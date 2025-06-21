import asyncio
import json
from typing import Set, Dict, Any
from fastapi import APIRouter, WebSocket, Depends, WebSocketDisconnect, HTTPException, status
from backend.auth import get_current_user, User # Assuming User model is appropriate

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_presences: Dict[str, Dict[str, Any]] = {} # {username: {"track_id": "..."}}

    async def connect(self, websocket: WebSocket, user: User):
        await websocket.accept()
        self.active_connections[user.username] = websocket
        # Initialize presence for the user
        if user.username not in self.user_presences:
            self.user_presences[user.username] = {"track_id": None}
        print(f"User {user.username} connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, user: User):
        if user.username in self.active_connections:
            del self.active_connections[user.username]
        # Optionally, remove from user_presences or mark as offline
        # For now, presence data persists until overwritten or explicitly cleared
        print(f"User {user.username} disconnected. Total connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, user: User):
        if user.username in self.active_connections:
            await self.active_connections[user.username].send_text(message)

    async def broadcast_presence(self):
        if not self.active_connections:
            return

        # Prepare the list of users and their current tracks
        users_data = []
        for username, presence_data in self.user_presences.items():
            # Only include users who are currently connected or have presence data
            if username in self.active_connections or presence_data.get("track_id") is not None:
                 # TODO: Fetch track details if needed, for now sending track_id
                users_data.append({
                    "username": username,
                    "track_id": presence_data.get("track_id"),
                    "online": username in self.active_connections # Add online status
                })

        # Filter to only include users who are actually online for the broadcast list
        # Or decide if offline users with last known track should be included.
        # For now, let's send all users with presence data, marked by "online" status.

        message = {"type": "presence", "users": users_data}
        message_json = json.dumps(message)

        # Create a list of tasks for sending messages
        tasks = []
        for username, websocket in self.active_connections.items():
            tasks.append(websocket.send_text(message_json))

        # Execute all send tasks concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                # Handle potential errors, e.g., client disconnected abruptly
                # Username can be obtained from list(self.active_connections.keys())[i]
                failed_username = list(self.active_connections.keys())[i]
                print(f"Error sending presence to {failed_username}: {result}")
                # Consider disconnecting this user if send fails repeatedly

    async def broadcast_chat_message(self, sender: str, content: str, timestamp: str, message_id: int):
        if not self.active_connections:
            return

        message = {
            "type": "chat",
            "payload": {
                "id": message_id,
                "sender": sender,
                "content": content,
                "timestamp": timestamp
            }
        }
        message_json = json.dumps(message)

        tasks = []
        for websocket in self.active_connections.values():
            tasks.append(websocket.send_text(message_json))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                failed_username = list(self.active_connections.keys())[i] # TODO: This might not be accurate if dict order changes during async
                print(f"Error sending chat message to {failed_username}: {result}")


manager = ConnectionManager()

# Need to import Chat model and SessionLocal for DB operations
from backend.torb.models import Chat
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
import datetime

# This would ideally come from a shared DB session setup, e.g., from main.py or a db_utils.py
# For simplicity here, let's assume a way to get a DB session.
# This is a placeholder and needs proper SQLAlchemy session management.
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
DATABASE_URL = "sqlite:///./torb.db" # Make sure this matches your actual DB URL
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


async def presence_updater_task():
    while True:
        await asyncio.sleep(5)
        print("Broadcasting presence updates...")
        await manager.broadcast_presence()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Attempt to authenticate user from cookie
    try:
        # Simulate request object for get_current_user if needed, or adapt get_current_user
        # FastAPI's WebSocket has `websocket.cookies`
        class MockRequest:
            def __init__(self, cookies):
                self.cookies = cookies

        mock_request = MockRequest(websocket.cookies)
        current_user: User = await get_current_user(mock_request) # type: ignore
        if not current_user: # Should not happen if get_current_user raises HTTPException
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except HTTPException: # Handles cases where get_current_user raises 401
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed")
        return

    await manager.connect(websocket, current_user)
    try:
        while True:
            # Keep the connection alive and handle client messages (e.g., heartbeats if implemented)
            # If client sends a specific message for presence update, handle it here.
            # For now, primarily relies on periodic broadcast and PUT /api/presence
            data = await websocket.receive_text()
            # Example: client could send pings, server sends pongs
            # if data == "ping":
            # await websocket.send_text("pong")
            print(f"Received message from {current_user.username}: {data}")

            try:
                message_data = json.loads(data)
                if message_data.get("type") == "chat":
                    content = message_data.get("content")
                    if content:
                        # Persist to DB
                        db: Session = SessionLocal()
                        try:
                            # Ensure created_at is timezone-aware if your DB expects it
                            # SQLAlchemy's func.now() for server_default usually handles this
                            # If setting manually, ensure it's correct.
                            chat_message = Chat(
                                sender=current_user.username,
                                content=content,
                                target=None, # For global chat
                                # created_at will be set by server_default
                            )
                            db.add(chat_message)
                            db.commit()
                            db.refresh(chat_message)

                            # Broadcast the message
                            # Ensure timestamp is in ISO format and includes timezone Z for UTC
                            timestamp_iso = chat_message.created_at.isoformat()
                            if chat_message.created_at.tzinfo is None:
                                # If somehow timezone is not set, assume UTC and append 'Z'
                                # This depends on how `func.now()` is configured with SQLAlchemy and DB
                                # For SQLite with `DateTime(timezone=True)` and `func.now()`, it should be UTC.
                                # Let's make it robust.
                                timestamp_iso = chat_message.created_at.replace(tzinfo=datetime.timezone.utc).isoformat()

                            await manager.broadcast_chat_message(
                                sender=chat_message.sender,
                                content=chat_message.content,
                                timestamp=timestamp_iso,
                                message_id=chat_message.id
                            )
                        except Exception as e:
                            print(f"Error processing chat message: {e}")
                            db.rollback()
                        finally:
                            db.close()
                    else:
                        print(f"Received chat message with no content from {current_user.username}")
                # Handle other message types if any
                # else if message_data.get("type") == "xyz":
                #    ...

            except json.JSONDecodeError:
                print(f"Received non-JSON message from {current_user.username}: {data}")
            # We could allow clients to push their presence updates via WebSocket too
            # For now, the PUT /api/presence is the primary mechanism for track updates

    except WebSocketDisconnect:
        print(f"WebSocketDisconnect for user {current_user.username}")
    except Exception as e:
        print(f"Error in WebSocket for {current_user.username}: {e}")
    finally:
        manager.disconnect(current_user)
        # Potentially update presence to offline or remove if desired
        # manager.user_presences[current_user.username]["online"] = False
        # await manager.broadcast_presence() # Optionally broadcast after disconnect

# Note: The presence_updater_task needs to be started when the FastAPI application starts.
# This will be handled in main.py.

# Placeholder for the new PUT /api/presence endpoint logic
# This will likely go into a new routes file, e.g., backend/routes/presence.py
# For now, let's add a function here that can be called by the new route.

async def update_user_track_presence(username: str, track_id: str | None):
    """
    Updates the track presence for a user.
    This function will be called by the PUT /api/presence endpoint.
    """
    if username not in manager.user_presences:
        manager.user_presences[username] = {}

    manager.user_presences[username]["track_id"] = track_id
    print(f"Updated presence for {username}: track_id = {track_id}")
    # After updating, immediately broadcast to reflect the change quickly.
    # This makes the system more responsive than waiting for the next 5s interval.
    await manager.broadcast_presence()

# Example of how a route for PUT /api/presence might look (to be placed in its own file later)
# from fastapi import Body
# @router.put("/api/presence") # This router prefix might need adjustment
# async def set_presence(
#     track_info: Dict[str, str | None] = Body(...), # {"track_id": "some_id_or_null"}
#     current_user: User = Depends(get_current_user)
# ):
#     track_id = track_info.get("track_id")
#     await update_user_track_presence(current_user.username, track_id)
#     return {"message": "Presence updated successfully"}

# Ensure this file ends with a newline character for POSIX compliance.
