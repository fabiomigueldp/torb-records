import json
import os
import time
import uuid
import asyncio
from pydantic import BaseModel

class User(BaseModel):
    username: str
    is_admin: bool

class LoginRequest(BaseModel):
    username: str
    password: str

import pathlib
BACKEND_DIR = pathlib.Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
USERS_FILE = ROOT_DIR / 'config/users.json'
_users_cache = None
_users_mtime = 0

def load_users():
    """Loads user data from USERS_FILE, caches it, and watches for file changes."""
    global _users_cache, _users_mtime
    try:
        mtime = os.path.getmtime(USERS_FILE)
        if mtime == _users_mtime and _users_cache is not None:
            return _users_cache
        with open(USERS_FILE, 'r') as f:
            _users_cache = json.load(f)
        _users_mtime = mtime
        return _users_cache
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        # Handle cases where the file is empty or malformed
        return []


def save_users(users_data):
    """Writes user data to USERS_FILE in a pretty-printed JSON format."""
    with open(USERS_FILE, 'w') as f:
        json.dump(users_data, f, indent=2)


class SessionManager:
    def __init__(self):
        self._sessions = {}  # {token: (username, creation_time)}
        self._session_ttl = 4 * 60 * 60  # 4 hours in seconds
        self._cleanup_interval = 30 * 60  # 30 minutes in seconds
        self._cleanup_task: asyncio.Task | None = None

    async def start_cleanup_task(self):
        """Starts the session cleanup task if not already running."""
        if self._cleanup_task is None or self._cleanup_task.done():
            # Ensure there's a running loop. This should be true if called from FastAPI startup.
            try:
                loop = asyncio.get_running_loop()
                self._cleanup_task = loop.create_task(self._cleanup_sessions())
                print("Session cleanup task started.")
            except RuntimeError:
                print("Error: No running event loop to start session cleanup task.")
                # Optionally, re-raise or handle as appropriate if this method
                # could be called from a context without a loop.
                # For FastAPI startup, a loop is guaranteed.


    def create_session(self, username: str) -> str:
        """Creates a new session for the given username."""
        token = str(uuid.uuid4())
        self._sessions[token] = (username, time.time())
        return token

    def get_session(self, token: str) -> str | None:
        """Gets the username associated with the given token."""
        session_data = self._sessions.get(token)
        if session_data:
            username, creation_time = session_data
            if time.time() - creation_time < self._session_ttl:
                return username
            else:
                # Session expired
                self.delete_session(token)
        return None

    def delete_session(self, token: str) -> None:
        """Deletes the session with the given token."""
        if token in self._sessions:
            del self._sessions[token]

    async def _cleanup_sessions(self):
        """Periodically cleans up expired sessions."""
        while True:
            await asyncio.sleep(self._cleanup_interval)
            now = time.time()
            expired_tokens = [
                token for token, (_, creation_time) in self._sessions.items()
                if now - creation_time >= self._session_ttl
            ]
            for token in expired_tokens:
                self.delete_session(token)

    async def close(self):
        """Cancels the cleanup task when the application shuts down."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

# Example usage (optional, can be removed or commented out)
async def main():
    # Initialize users if file doesn't exist or is empty
    if not os.path.exists(USERS_FILE) or os.path.getsize(USERS_FILE) == 0:
        initial_users = [
            {"username": "admin", "password": "password", "is_admin": True}
        ]
        save_users(initial_users)
        print(f"Initialized {USERS_FILE} with default admin user.")

    users = load_users()
    print(f"Loaded users: {users}")

    session_manager = SessionManager()
    user_to_login = users[0]['username'] if users else "testuser"

    if not users: # If no users loaded, create a dummy one for session test
        save_users([{"username": "testuser", "password": "password", "is_admin": False}])
        users = load_users()
        user_to_login = users[0]['username']


    session_token = session_manager.create_session(user_to_login)
    print(f"Created session for {user_to_login}: {session_token}")

    retrieved_user = session_manager.get_session(session_token)
    print(f"Retrieved user for session {session_token}: {retrieved_user}")

    await asyncio.sleep(1) # Keep it running for a bit for cleanup task to cycle once (though unlikely in 1s)

    session_manager.delete_session(session_token)
    print(f"Deleted session {session_token}")
    retrieved_user_after_deletion = session_manager.get_session(session_token)
    print(f"Retrieved user after deletion: {retrieved_user_after_deletion}")

    await session_manager.close() # Important to clean up the task

if __name__ == '__main__':
    # This part is tricky because _cleanup_sessions is an async task
    # For direct script execution, it's better to run the main coroutine
    # However, this file is intended to be a module.
    # The example main() can be used for isolated testing.
    # To run it:
    # Ensure config/users.json exists or can be created.
    # python backend/auth.py
    pass # asyncio.run(main()) # This would run the example if uncommented

# Instantiate SessionManager globally within auth.py
session_manager = SessionManager()

# Imports for get_current_user
from fastapi import Request, HTTPException, status

async def get_current_user(request: Request) -> User:
    print(f"get_current_user: All request cookies: {request.cookies}") # Debug print
    sid = request.cookies.get("sid")
    print(f"get_current_user: SID from cookie: {sid}") # Debug print
    if not sid:
        print("get_current_user: SID not found in cookies.") # Debug print
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Use the global session_manager from this module
    print(f"get_current_user: Validating SID '{sid}' with session_manager.") # Debug print
    username = session_manager.get_session(sid)
    print(f"get_current_user: Username from session_manager: {username}") # Debug print
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    users = load_users()
    current_user_data = next((user for user in users if user["username"] == username), None)
    if not current_user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found for session", # Should ideally not happen
            headers={"WWW-Authenticate": "Bearer"},
        )
    return User(username=current_user_data["username"], is_admin=current_user_data["is_admin"])
