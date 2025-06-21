from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.torb.models import Chat
from backend.auth import get_current_user, User # For protecting the endpoint
from typing import List, Optional
from pydantic import BaseModel
import datetime

# Placeholder for database session dependency
# This should align with how sessions are managed in the rest of your FastAPI app
# e.g., using a dependency injector like in backend/routes/preferences.py
from sqlalchemy import create_engine, or_
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite:///./torb.db" # Ensure this matches your main DB URL
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

router = APIRouter(
    prefix="/api/chat",
    tags=["chat"],
    responses={404: {"description": "Not found"}},
    dependencies=[Depends(get_current_user)] # Protect chat history endpoint
)

from typing import Optional # Add Optional

class ChatMessageResponse(BaseModel):
    id: int
    sender: str
    content: str
    timestamp: datetime.datetime # Will be automatically converted to ISO string by FastAPI
    target: Optional[str] = None # Add target for DMs

    class Config:
        orm_mode = True

@router.get("", response_model=List[ChatMessageResponse])
async def get_chat_messages(
    before: Optional[datetime.datetime] = Query(None, description="Fetch messages created before this timestamp (ISO format)."),
    limit: int = Query(50, ge=1, le=200, description="Number of messages to return."),
    db: Session = Depends(get_db)
):
    """
    Fetches global chat messages.
    - Returns messages in descending order of creation (newest first).
    - Supports pagination using the `before` timestamp to get older messages.
    """
    query = db.query(Chat).filter(Chat.target.is_(None)) # Global chat messages

    if before:
        # Ensure 'before' is timezone-aware if comparing with timezone-aware datetimes in DB
        # If 'before' is naive, and DB stores aware, comparison might be problematic
        # Assuming 'created_at' is stored as UTC. FastAPI typically parses ISO strings to aware datetimes.
        query = query.filter(Chat.created_at < before)

    messages = query.order_by(Chat.created_at.desc()).limit(limit).all()

    # Pydantic model will handle serialization, including datetime to ISO string
    return messages


@router.get("/dm/{username}", response_model=List[ChatMessageResponse])
async def get_direct_messages(
    username: str,
    before: Optional[datetime.datetime] = Query(None, description="Fetch messages created before this timestamp (ISO format)."),
    limit: int = Query(50, ge=1, le=200, description="Number of messages to return."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user) # Inject current user
):
    """
    Fetches direct messages between the current user and the specified username.
    - Returns messages in descending order of creation (newest first).
    - Supports pagination using the `before` timestamp to get older messages.
    """
    # Messages where current user is sender and target is 'username'
    # OR current user is target and sender is 'username'
    query = db.query(Chat).filter(
        or_(
            (Chat.sender == current_user.username) & (Chat.target == username),
            (Chat.sender == username) & (Chat.target == current_user.username)
        )
    )

    if before:
        # Ensure 'before' is timezone-aware if comparing with timezone-aware datetimes in DB
        query = query.filter(Chat.created_at < before)

    messages = query.order_by(Chat.created_at.desc()).limit(limit).all()

    return messages
