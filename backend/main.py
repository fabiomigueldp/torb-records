import asyncio
from fastapi import FastAPI, HTTPException, Response, status, Depends, Request
from backend.auth import load_users, SessionManager, User, LoginRequest
from backend.routes import preferences as preferences_router
from backend.routes import upload as upload_router # Import the new upload router
from backend.torb.models import UserPreference # Added for preferences
from backend.routes.preferences import get_db # Added for preferences
from sqlalchemy.orm import Session # Added for preferences

app = FastAPI()

# Include the preferences router
app.include_router(preferences_router.router)
app.include_router(upload_router.router) # Include the upload router

# Instantiate SessionManager
session_manager = SessionManager()

@app.on_event("startup")
async def startup_event():
    print("Torb Records API alive")
    # Start the session cleanup task
    # The SessionManager already starts its own cleanup task in its __init__
    # No need to start it again here if it's designed that way.
    # If _cleanup_sessions is a public method intended to be called here, then it's fine.
    # Based on the previous auth.py, it starts automatically.
    # Let's ensure it's not started twice.
    # The provided snippet was: asyncio.create_task(session_manager._cleanup_sessions())
    # This creates a *new* task, which is not what we want if __init__ already started one.
    # If the SessionManager is guaranteed to be initialized only once, its __init__ handles it.
    # For now, I'll assume SessionManager's __init__ correctly starts the task.
    pass

@app.on_event("shutdown")
async def shutdown_event():
    await session_manager.close() # Gracefully stop cleanup task

@app.get("/")
async def read_root():
    return {"message": "Torb Records API is running"}

async def get_current_user(request: Request) -> User:
    sid = request.cookies.get("sid")
    if not sid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = session_manager.get_session(sid)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    users = load_users()
    current_user_data = next((user for user in users if user["username"] == username), None)
    if not current_user_data:
        # This case should ideally not happen if session creation is tied to valid users
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found for session",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return User(username=current_user_data["username"], is_admin=current_user_data["is_admin"])

@app.post("/api/login")
async def login(login_request: LoginRequest, response: Response):
    users = load_users()
    user = next((u for u in users if u["username"] == login_request.username and u["password"] == login_request.password), None)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    session_token = session_manager.create_session(user["username"])
    response.set_cookie(
        key="sid",
        value=session_token,
        httponly=True,
        secure=True, # Set to True in production if using HTTPS
        samesite="lax", # Or "strict"
        # max_age can be set if needed, but session manager handles TTL
    )

    # Add default preferences logic
    db: Session = next(get_db())
    try:
        user_prefs = db.query(UserPreference).filter(UserPreference.username == user["username"]).one_or_none()
        if not user_prefs:
            default_prefs = UserPreference(
                username=user["username"],
                theme="synthwave", # Default theme
                muted_uploaders=[]
            )
            db.add(default_prefs)
            db.commit()
    finally:
        db.close()

    return {"message": "Login successful"}

@app.get("/api/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/api/logout")
async def logout(response: Response, request: Request):
    sid = request.cookies.get("sid")
    if sid:
        session_manager.delete_session(sid)

    response.delete_cookie(key="sid", httponly=True, secure=True, samesite="lax")
    return {"message": "Logout successful"}
