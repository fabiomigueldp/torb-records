import asyncio
from fastapi import FastAPI, HTTPException, Response, status, Depends, Request
# Import session_manager and get_current_user from backend.auth
from backend.auth import load_users, User, LoginRequest, session_manager, get_current_user
from backend.routes import preferences as preferences_router
from backend.routes import upload as upload_router
from backend.routes import tracks as tracks_router
from backend.routes import playlists as playlists_router # Added playlists router
from backend.torb.models import UserPreference
from backend.routes.preferences import get_db
from sqlalchemy.orm import Session

app = FastAPI()

# Include routers
app.include_router(preferences_router.router)
app.include_router(upload_router.router)
app.include_router(tracks_router.router)
app.include_router(playlists_router.router) # Added playlists router

# SessionManager is now instantiated in auth.py and imported.
# Startup and shutdown events will use the imported session_manager.

from backend.routes.upload import create_media_directories # Import the function

@app.on_event("startup")
async def startup_event():
    print("Torb Records API alive")
    # Start the session cleanup task using the imported session_manager
    await session_manager.start_cleanup_task()
    # Create media directories
    create_media_directories()

@app.on_event("shutdown")
async def shutdown_event():
    await session_manager.close() # Gracefully stop cleanup task of the imported session_manager

@app.get("/")
async def read_root():
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
