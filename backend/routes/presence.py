from fastapi import APIRouter, Depends, Body, HTTPException
from typing import Dict
from backend.auth import User, get_current_user
from pydantic import BaseModel # Moved to top
from backend.ws import update_user_track_presence # Import the function from ws.py

router = APIRouter(
    prefix="/api/presence",
    tags=["presence"],
    responses={404: {"description": "Not found"}},
)

class TrackPresenceRequest(BaseModel): # Use Pydantic model for request body
    track_id: str | None = None

@router.put("")
async def set_user_presence(
    payload: TrackPresenceRequest, # Use the Pydantic model
    current_user: User = Depends(get_current_user)
):
    """
    Allows a user to update their currently playing track.
    This information is then used by the WebSocket presence system.
    """
    if not current_user: # Should be handled by get_current_user, but as a safeguard
        raise HTTPException(status_code=401, detail="Not authenticated")

    await update_user_track_presence(current_user.username, payload.track_id)
    return {"message": f"Presence updated for {current_user.username}."}
