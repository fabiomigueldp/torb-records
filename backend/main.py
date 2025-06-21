import asyncio
from fastapi import FastAPI, HTTPException, Response, status, Depends, Request
from loguru import logger
import sys
# Import session_manager and get_current_user from backend.auth
from backend.auth import load_users, User, LoginRequest, session_manager, get_current_user
from backend.routes import preferences as preferences_router
from backend.routes import upload as upload_router
from backend.routes import tracks as tracks_router
from backend.routes import playlists as playlists_router
from backend.routes import presence as presence_router
from backend.routes import chat as chat_router
from backend.routes import admin as admin_router # Added admin router
from backend.routes import removal_requests as removal_requests_router # Added removal_requests router
from backend.ws import router as ws_router
from backend.ws import presence_updater_task # Added presence updater task
from backend.torb.models import UserPreference
from backend.routes.preferences import get_db
from sqlalchemy.orm import Session

app = FastAPI()

# Include routers
app.include_router(preferences_router.router)
app.include_router(upload_router.router)
app.include_router(tracks_router.router)
app.include_router(playlists_router.router)
app.include_router(presence_router.router)
app.include_router(chat_router.router)
app.include_router(admin_router.router) # Added admin router
app.include_router(removal_requests_router.router) # Added removal_requests router
app.include_router(ws_router)

# SessionManager is now instantiated in auth.py and imported.
# Startup and shutdown events will use the imported session_manager.

from backend.routes.upload import create_media_directories # Import the function

# Define a variable to hold the presence updater task
presence_task = None

# Configure Loguru
logger.remove() # Remove default handler
logger.add(sys.stderr, level="INFO") # Log to stderr with INFO level
logger.add("logs/backend_{time}.log", rotation="1 day", level="INFO", enqueue=True) # Log to file with daily rotation

@app.on_event("startup")
async def startup_event():
    global presence_task
    logger.info("Torb Records API starting up...")
    # Start the session cleanup task using the imported session_manager
    await session_manager.start_cleanup_task()
    # Create media directories
    create_media_directories()
    # Start the presence updater task
    loop = asyncio.get_event_loop()
    presence_task = loop.create_task(presence_updater_task())
    logger.info("Presence updater task started.")

@app.on_event("shutdown")
async def shutdown_event():
    global presence_task
    logger.info("Torb Records API shutting down...")
    if presence_task:
        presence_task.cancel()
        try:
            await presence_task
        except asyncio.CancelledError:
            logger.info("Presence updater task cancelled.")
    await session_manager.close() # Gracefully stop cleanup task of the imported session_manager
    logger.info("Torb Records API shutdown complete.")

@app.get("/")
async def read_root():
    logger.info("Root endpoint was called.")
    return {"message": "Torb Records API is running"}

# get_current_user is now imported from backend.auth

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
        secure=False, # Set to False for testing with http://testserver
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
