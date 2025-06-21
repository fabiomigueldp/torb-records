from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import NoResultFound # Import NoResultFound
from backend.auth import User, get_current_user # Assuming get_current_user authenticates and returns a User model
from backend.torb.models import UserPreference # Assuming UserPreference model is in models.py
from pydantic import BaseModel, Json # For request body validation

# Database session dependency (assuming a get_db function exists or will be created)
# For now, let's assume a placeholder for DB session management.
# This will need to be integrated with the actual DB session setup in main.py or a shared module.
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite:///./torb.db" # Replace with your actual database URL
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

router = APIRouter()

class UserPreferenceUpdate(BaseModel):
    theme: str
    muted_uploaders: list[str] | None = None # Made optional as per plan

@router.get("/api/preferences", response_model=UserPreferenceUpdate)
async def get_user_preferences(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        preference = db.query(UserPreference).filter(UserPreference.username == current_user.username).one()
        # Ensure muted_uploaders is a list, even if None in DB (though model has default=[])
        muted_uploaders = preference.muted_uploaders if preference.muted_uploaders is not None else []
        return UserPreferenceUpdate(theme=preference.theme, muted_uploaders=muted_uploaders)
    except NoResultFound:
        # Return default preferences if none found
        # The plan mentions default theme is "synthwave" or the first in our list. Let's use "synthwave".
        return UserPreferenceUpdate(theme="synthwave", muted_uploaders=[])

@router.put("/api/preferences", response_model=UserPreferenceUpdate)
async def update_user_preferences(
    pref_update: UserPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        preference = db.query(UserPreference).filter(UserPreference.username == current_user.username).one_or_none()
        if preference:
            preference.theme = pref_update.theme
            if pref_update.muted_uploaders is not None: # Only update if provided
                preference.muted_uploaders = pref_update.muted_uploaders
            db.commit()
            db.refresh(preference)
            # Ensure muted_uploaders is a list for the response
            muted_uploaders_resp = preference.muted_uploaders if preference.muted_uploaders is not None else []
            return UserPreferenceUpdate(theme=preference.theme, muted_uploaders=muted_uploaders_resp)
        else:
            # If no preference exists, create one. This aligns with the idea of defaults.
            new_preference = UserPreference(
                username=current_user.username,
                theme=pref_update.theme,
                muted_uploaders=pref_update.muted_uploaders if pref_update.muted_uploaders is not None else []
            )
            db.add(new_preference)
            db.commit()
            db.refresh(new_preference)
            # Ensure muted_uploaders is a list for the response
            muted_uploaders_resp = new_preference.muted_uploaders if new_preference.muted_uploaders is not None else []
            return UserPreferenceUpdate(theme=new_preference.theme, muted_uploaders=muted_uploaders_resp)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
