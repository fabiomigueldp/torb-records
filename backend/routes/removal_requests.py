from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
import datetime

from backend.auth import User, get_current_user
from backend.torb.models import Track, RemovalRequest
from backend.routes.preferences import get_db # Assuming get_db provides DB session

router = APIRouter(prefix="/api", tags=["Removal Requests"])

class RemovalRequestCreate(BaseModel):
    reason: str

class RemovalRequestPublicResponse(BaseModel):
    id: int
    track_id: int
    requester: str
    reason: str
    status: str
    created_at: datetime.datetime

    class Config:
        orm_mode = True # Renamed from from_attributes for Pydantic v2


@router.post("/tracks/{track_id}/removal_request", response_model=RemovalRequestPublicResponse, status_code=status.HTTP_201_CREATED)
async def submit_removal_request(
    track_id: int,
    request_data: RemovalRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if track exists
    track = db.query(Track).filter(Track.id == track_id).one_or_none()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    # Optional: Check if a pending request already exists for this track by this user
    existing_request = db.query(RemovalRequest).filter(
        RemovalRequest.track_id == track_id,
        RemovalRequest.requester == current_user.username,
        RemovalRequest.status == "pending"
    ).first()

    if existing_request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have a pending removal request for this track."
        )

    new_request = RemovalRequest(
        track_id=track_id,
        requester=current_user.username,
        reason=request_data.reason,
        status="pending" # Default status
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)

    return RemovalRequestPublicResponse(
        id=new_request.id,
        track_id=new_request.track_id,
        requester=new_request.requester,
        reason=new_request.reason,
        status=new_request.status,
        created_at=new_request.created_at
    )

# Ensure this file ends with a newline character for POSIX compliance.
