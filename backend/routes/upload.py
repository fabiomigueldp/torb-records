import asyncio
import os
import uuid
from pathlib import Path
import shutil

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, BackgroundTasks
from sqlalchemy.orm import Session

from backend.auth import User, get_current_user
from backend.torb.models import Track
from backend.routes.preferences import get_db # Reusing get_db from preferences for now

router = APIRouter()

UPLOAD_DIR = Path("/uploads")
MEDIA_DIR = Path("/media")

# Ensure upload and media directories exist (though Docker volumes should handle this)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

from backend.routes.preferences import SessionLocal # For creating session in background task

async def run_ffmpeg_command(command: list[str]):
    """Helper to run FFmpeg command and handle errors."""
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        raise RuntimeError(f"FFmpeg command failed: {command}\nStdout: {stdout.decode()}\nStderr: {stderr.decode()}")
    print(f"FFmpeg command successful: {command}\nStdout: {stdout.decode()}\nStderr: {stderr.decode()}")


async def process_audio_to_hls(track_id: int, original_file_path_str: str, track_uuid: str, SessionLocalForTask: sessionmaker):
    """
    Processes the uploaded audio file into HLS format with multiple bitrates.
    Updates the track status in the database.
    """
    track_media_dir = MEDIA_DIR / track_uuid
    original_file_path = Path(original_file_path_str)
    master_playlist_path = track_media_dir / "master.m3u8"

    db = SessionLocalForTask()
    try:
        print(f"Starting HLS processing for track ID {track_id}, UUID {track_uuid}")

        track_media_dir.mkdir(parents=True, exist_ok=True)

        bitrates = {
            "64k": "64000",
            "128k": "128000",
            "256k": "256000"
        }

        master_playlist_content = "#EXTM3U\n#EXT-X-VERSION:3\n"

        for br_name, br_value in bitrates.items():
            output_playlist_dir = track_media_dir / br_name
            output_playlist_dir.mkdir(parents=True, exist_ok=True)
            playlist_file = output_playlist_dir / "playlist.m3u8"
            segment_filename_template = str(output_playlist_dir / "segment%03d.ts")

            ffmpeg_command = [
                "ffmpeg",
                "-i", str(original_file_path),
                "-c:a", "aac",
                "-b:a", br_name, # e.g., 64k
                "-vn", # No video
                "-hls_time", "10", # Segment duration
                "-hls_list_size", "0", # Keep all segments in playlist
                "-hls_segment_filename", segment_filename_template,
                str(playlist_file)
            ]
            await run_ffmpeg_command(ffmpeg_command)
            master_playlist_content += f"#EXT-X-STREAM-INF:BANDWIDTH={br_value},RESOLUTION=audio\n{br_name}/playlist.m3u8\n"

        # Write the master playlist
        with open(master_playlist_path, "w") as f:
            f.write(master_playlist_content)

        # Update track status to ready
        track = db.query(Track).filter(Track.id == track_id).first()
        if track:
            track.status = "ready"
            track.hls_root = str(master_playlist_path)
            db.commit()
            print(f"Track ID {track_id} status updated to ready. HLS root: {track.hls_root}")
        else:
            print(f"Error: Track ID {track_id} not found in database after processing.")
            # This case should ideally not happen if the track was created before starting this task

    except Exception as e:
        print(f"Error processing track ID {track_id}: {str(e)}")
        # Update track status to error
        track = db.query(Track).filter(Track.id == track_id).first()
        if track:
            track.status = "error"
            # track.error_message = str(e) # Consider adding an error message field to Track model
            db.commit()
            print(f"Track ID {track_id} status updated to error.")
    finally:
        db.close()


@router.post("/api/upload")
async def upload_track(
    background_tasks: BackgroundTasks,
    request: Request,
    title: str = Form(...),
    file: UploadFile = File(...),
    cover: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    track_uuid = str(uuid.uuid4())
    track_upload_dir = UPLOAD_DIR / track_uuid
    track_upload_dir.mkdir(parents=True, exist_ok=True)

    original_file_ext = Path(file.filename).suffix
    original_filename = f"original{original_file_ext}"
    original_file_path = track_upload_dir / original_filename

    cover_filename = "cover.jpg" # Assuming cover is always JPG for simplicity
    cover_file_path = track_upload_dir / cover_filename

    try:
        # Save original file
        with open(original_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Save cover file
        with open(cover_file_path, "wb") as buffer:
            shutil.copyfileobj(cover.file, buffer)

    except Exception as e:
        # Clean up created directory if saving fails
        if track_upload_dir.exists():
            shutil.rmtree(track_upload_dir)
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded files: {str(e)}")
    finally:
        await file.close()
        await cover.close()

    new_track = Track(
        uuid=track_uuid,
        title=title,
        uploader=current_user.username,
        original_path=str(original_file_path),
        cover_filename=cover_filename,
        status="processing" # hls_root will be set by background task
    )
    db.add(new_track)
    db.commit()
    db.refresh(new_track)

    # Add background task for FFmpeg processing
    # We need a way to pass a DB session factory or engine to the background task
    # For now, let's assume get_db can be used if called within the task,
    # or we pass the necessary components.
    # A simple way is to pass what's needed, like track_id and paths.
    # The task itself will need to create its own db session.
    # This uses the main app's request.app.state.db_session_factory if available,
    # or pass get_db. For now, let's assume process_audio_to_hls will handle its own session.

    # For process_audio_to_hls to create its own session, it needs access to the engine or SessionLocal
    # This is often handled by passing a callable that provides a session.
    # For simplicity here, we'll rely on process_audio_to_hls to get a session via get_db()
    # which means it needs to be importable and usable independently.
    # A better way is to pass SessionLocal:
    from backend.routes.preferences import SessionLocal as AppSessionLocal # Ensure SessionLocal is imported
    background_tasks.add_task(process_audio_to_hls, new_track.id, str(original_file_path), track_uuid, AppSessionLocal)


    return {"track_id": new_track.id, "status": new_track.status, "title": new_track.title, "uuid": new_track.uuid}


@router.get("/api/upload/status/{track_id}")
async def get_upload_status(
    track_id: int,
    current_user: User = Depends(get_current_user), # Authenticated endpoint
    db: Session = Depends(get_db)
):
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Optionally, restrict access to only the uploader or admins
    # if track.uploader != current_user.username and not current_user.is_admin:
    #     raise HTTPException(status_code=403, detail="Not authorized to view this track's status")

    return {
        "track_id": track.id,
        "title": track.title,
        "uploader": track.uploader,
        "status": track.status,
        "hls_url": track.hls_root if track.status == "ready" else None,
        "uploaded_at": track.created_at,
        "uuid": track.uuid
    }

# Need to include this router in main.py
# Need to implement the actual FFmpeg processing in process_audio_to_hls
