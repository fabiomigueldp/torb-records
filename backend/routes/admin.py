from fastapi import APIRouter, Depends, HTTPException, status, Response
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import datetime # Added missing import for RemovalRequestResponse

from backend.auth import User, get_current_user, load_users, save_users, LoginRequest, ROOT_DIR
from backend.torb.models import RemovalRequest, Track, PlaylistTrack
from backend.routes.preferences import get_db
from sqlalchemy.orm import Session
import shutil
import os
from backend.ws import manager as ws_manager # Import WebSocket manager

router = APIRouter(prefix="/api/admin", tags=["Admin"])

# Dependency to ensure user is an admin
async def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have admin privileges"
        )
    return current_user

# Placeholder for User models (as per current plan, modifying users.json directly)
class AdminUserCreateRequest(BaseModel):
    username: str
    password: str # Should be hashed before saving in a real scenario
    is_admin: bool

class AdminUserUpdateRequest(BaseModel):
    password: Optional[str] = None # Should be hashed
    is_admin: Optional[bool] = None

class AdminUserResponse(BaseModel):
    username: str
    is_admin: bool
    # Add other fields if necessary, like created_at, last_login if we had a User model

# --- User Management Endpoints ---

@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: AdminUserCreateRequest,
    admin: User = Depends(get_current_admin_user)
):
    users = load_users()
    if any(u["username"] == user_data.username for u in users):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

    # In a real app, hash the password here: e.g., hashed_password = hash_function(user_data.password)
    new_user = {"username": user_data.username, "password": user_data.password, "is_admin": user_data.is_admin}
    users.append(new_user)
    save_users(users)
    return AdminUserResponse(username=new_user["username"], is_admin=new_user["is_admin"])

@router.get("/users", response_model=List[AdminUserResponse])
async def get_users_list(admin: User = Depends(get_current_admin_user)):
    users = load_users()
    return [AdminUserResponse(username=u["username"], is_admin=u["is_admin"]) for u in users]

@router.put("/users/{username}", response_model=AdminUserResponse)
async def update_user(
    username: str,
    user_update_data: AdminUserUpdateRequest,
    admin: User = Depends(get_current_admin_user)
):
    users = load_users()
    user_found = False
    updated_user_details = None
    for i, u in enumerate(users):
        if u["username"] == username:
            if user_update_data.password is not None:
                # In a real app, hash the password here
                users[i]["password"] = user_update_data.password
            if user_update_data.is_admin is not None:
                users[i]["is_admin"] = user_update_data.is_admin
            updated_user_details = users[i]
            user_found = True
            break

    if not user_found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    save_users(users)
    return AdminUserResponse(username=updated_user_details["username"], is_admin=updated_user_details["is_admin"])

@router.delete("/users/{username}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    username: str,
    admin: User = Depends(get_current_admin_user)
):
    users = load_users()
    original_len = len(users)
    users = [u for u in users if u["username"] != username]

    if len(users) == original_len:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent admin from deleting themselves (optional safeguard)
    if username == admin.username:
         # Re-add admin to prevent self-deletion and raise error
        users.append({"username": admin.username, "password": "dummy_password_not_saved", "is_admin": True}) # Or load original
        save_users(load_users()) # revert
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin users cannot delete themselves.")

    save_users(users)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Removal Requests Management Endpoints ---
class RemovalRequestResponse(BaseModel):
    id: int
    track_id: int
    requester: str
    reason: Optional[str]
    status: str
    created_at: datetime.datetime
    track_title: Optional[str] # For easier display on frontend
    track_uploader: Optional[str]

    class Config:
        orm_mode = True # Renamed from from_attributes for Pydantic v2

@router.get("/removal_requests", response_model=List[RemovalRequestResponse])
async def get_all_removal_requests(
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    requests = db.query(RemovalRequest).order_by(RemovalRequest.created_at.desc()).all()
    response_list = []
    for req in requests:
        response_list.append(RemovalRequestResponse(
            id=req.id,
            track_id=req.track_id,
            requester=req.requester,
            reason=req.reason,
            status=req.status,
            created_at=req.created_at,
            track_title=req.track.title if req.track else "N/A (Track Deleted)",
            track_uploader=req.track.uploader if req.track else "N/A"
        ))
    return response_list


# Resolve absolute paths for data directories for security
ABS_MEDIA_DATA_ROOT = (ROOT_DIR / "media-data").resolve()
ABS_UPLOAD_DATA_ROOT = (ROOT_DIR / "upload-data").resolve()


@router.post("/removal_requests/{request_id}/approve", response_model=RemovalRequestResponse)
async def approve_removal_request(
    request_id: int,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
    # TODO: Add WebSocket manager dependency later for broadcasting
):
    req = db.query(RemovalRequest).filter(RemovalRequest.id == request_id).one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Removal request not found")
    if req.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Request already processed with status: {req.status}")

    track_to_delete = db.query(Track).filter(Track.id == req.track_id).one_or_none()

    if track_to_delete:
        # 1. Delete files
        # Delete HLS media directory: media-data/{track.uuid}/
        if track_to_delete.uuid:
            # Construct path safely, joining with resolved absolute root
            track_media_dir_abs = (ABS_MEDIA_DATA_ROOT / track_to_delete.uuid).resolve()
            # Security check: Ensure the path is within ABS_MEDIA_DATA_ROOT
            if track_media_dir_abs.is_dir() and str(track_media_dir_abs).startswith(str(ABS_MEDIA_DATA_ROOT)):
                try:
                    shutil.rmtree(track_media_dir_abs)
                    print(f"Deleted HLS directory: {track_media_dir_abs}")
                except Exception as e:
                    print(f"Error deleting HLS directory {track_media_dir_abs}: {e}") # Log error, but continue
            else:
                print(f"HLS directory not found or path issue: {track_media_dir_abs}")

        # Delete original uploaded file: upload-data/{track.original_path}
        if track_to_delete.original_path:
            # original_path is expected to be a relative path from the UPLOAD_DATA_ROOT
            # e.g. "some_file.mp3" or "subdir/some_file.mp3"
            # Construct path safely, joining with resolved absolute root
            original_file_abs = (ABS_UPLOAD_DATA_ROOT / track_to_delete.original_path).resolve()

            # Security check: Ensure the path is within ABS_UPLOAD_DATA_ROOT
            if str(original_file_abs).startswith(str(ABS_UPLOAD_DATA_ROOT)):
                if original_file_abs.is_file():
                    try:
                        os.remove(original_file_abs)
                        print(f"Deleted original file: {original_file_abs}")
                    except Exception as e:
                        print(f"Error deleting original file {original_file_abs}: {e}") # Log error
                elif original_file_abs.is_dir(): # If original_path pointed to a directory
                    try:
                        shutil.rmtree(original_file_abs)
                        print(f"Deleted original directory (unexpected): {original_file_abs}")
                    except Exception as e:
                        print(f"Error deleting original directory {original_file_abs}: {e}")
                else:
                    print(f"Original file/dir not found or path issue: {original_file_abs}")
            else:
                print(f"Path traversal attempt or invalid original_path: {original_file_abs}")


        # 2. Delete PlaylistTrack entries
        db.query(PlaylistTrack).filter(PlaylistTrack.track_id == track_to_delete.id).delete()

        # 3. Delete Track row
        db.delete(track_to_delete)

    # 4. Update RemovalRequest status
    req.status = "approved"
    db.commit()
    db.refresh(req)

    # Broadcast WebSocket event
    await ws_manager.broadcast_admin_event({
        "event_type": "removal_request_updated",
        "request_id": req.id,
        "status": req.status,
        "track_id": req.track_id
    })

    return RemovalRequestResponse(
        id=req.id, track_id=req.track_id, requester=req.requester, reason=req.reason,
        status=req.status, created_at=req.created_at,
        track_title=track_to_delete.title if track_to_delete else "N/A (Track Deleted)",
        track_uploader=track_to_delete.uploader if track_to_delete else "N/A"
    )


@router.post("/removal_requests/{request_id}/reject", response_model=RemovalRequestResponse)
async def reject_removal_request(
    request_id: int,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
    # TODO: Add WebSocket manager dependency later for broadcasting
):
    req = db.query(RemovalRequest).filter(RemovalRequest.id == request_id).one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Removal request not found")
    if req.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Request already processed with status: {req.status}")

    req.status = "rejected"
    db.commit()
    db.refresh(req)

    # Broadcast WebSocket event
    await ws_manager.broadcast_admin_event({
        "event_type": "removal_request_updated",
        "request_id": req.id,
        "status": req.status,
        "track_id": req.track_id
    })

    track_info = db.query(Track).filter(Track.id == req.track_id).one_or_none()

    return RemovalRequestResponse(
        id=req.id, track_id=req.track_id, requester=req.requester, reason=req.reason,
        status=req.status, created_at=req.created_at,
        track_title=track_info.title if track_info else "N/A", # Track still exists
        track_uploader=track_info.uploader if track_info else "N/A"
    )

# Ensure this file ends with a newline character for POSIX compliance.
