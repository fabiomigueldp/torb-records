from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List

from backend.auth import User, get_current_user # User and get_current_user from auth
from backend.torb.models import Track, UserPreference
from backend.routes.preferences import get_db # Assuming get_db is here
from pydantic import BaseModel

router = APIRouter()

class TrackResponse(BaseModel):
    id: int
    title: str
    uploader: str
    cover_url: str | None
    duration: int | None

@router.get("/api/tracks", response_model=List[TrackResponse])
async def get_tracks_list(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_prefs = db.query(UserPreference).filter(UserPreference.username == current_user.username).one_or_none()
    muted_uploaders = user_prefs.muted_uploaders if user_prefs and user_prefs.muted_uploaders else []

    all_tracks = db.query(Track).filter(Track.status == "ready").all()

    response_tracks: List[TrackResponse] = []
    for track in all_tracks:
        if track.uploader == 'fabiomigueldp' or track.uploader not in muted_uploaders:
            cover_url = f"/media/{track.uuid}/{track.cover_filename}" if track.uuid and track.cover_filename else None
            response_tracks.append(
                TrackResponse(
                    id=track.id,
                    title=track.title,
                    uploader=track.uploader,
                    cover_url=cover_url,
                    duration=track.duration
                )
            )
    return response_tracks

@router.get("/api/stream/{track_uuid}/master.m3u8")
async def stream_track_hls(
    track_uuid: str,
    current_user: User = Depends(get_current_user), # Auth protected
    db: Session = Depends(get_db)
):
    track = db.query(Track).filter(Track.uuid == track_uuid, Track.status == "ready").one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found or not ready")

    if not track.hls_root:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HLS stream not available for this track")

    # Construct the full path to the master.m3u8 file
    # hls_root is expected to be like 'media-data/{uuid}/hls'
    # and the file is master.m3u8 within that.
    # The upload process should store hls_root as the directory containing the HLS files.
    master_m3u8_path = f"{track.hls_root}/master.m3u8"

    # Security: Ensure the path is within the expected media directory.
    # This is a simplified check. A more robust check would involve resolving
    # the absolute path and ensuring it's within a designated media root.
    if not master_m3u8_path.startswith("media-data/"):
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid track path")


    return FileResponse(
        path=master_m3u8_path,
        media_type="application/vnd.apple.mpegurl",
        headers={
            "Content-Disposition": f"inline; filename=\"master.m3u8\""
        }
    )
