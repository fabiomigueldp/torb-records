import pytest
import os
import tempfile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Adjust the import path based on your project structure
# This assumes 'torb' is a package in the 'backend' directory and 'backend' is in PYTHONPATH
from torb.models import Base, UserPreference, Track, Playlist, PlaylistTrack, Chat, RemovalRequest

# Define a fixture for an in-memory SQLite database for testing
@pytest.fixture(scope="function")
def test_db_session():
    # Create a temporary file for the SQLite database
    db_fd, db_path = tempfile.mkstemp(suffix=".db")

    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine) # Create tables

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()

    yield session # Provide the session to the test

    session.close()
    engine.dispose()
    os.close(db_fd) # Close the file descriptor
    os.unlink(db_path) # Remove the temporary database file

def test_import_and_create_models(test_db_session):
    """
    Tests that all models can be imported and tables can be created.
    Also does a basic check that a UserPreference can be added.
    """
    session = test_db_session

    # Try to create an instance of each model to ensure basic mapping
    user_pref = UserPreference(username="testuser", theme="dark")
    session.add(user_pref)

    track = Track(
        title="Test Track",
        uploader="testuploader",
        hls_root="/path/to/hls",
        status="ready"
    )
    session.add(track)
    session.commit() # Commit to get track.id for foreign keys

    playlist = Playlist(
        owner="testuser",
        name="Test Playlist"
    )
    session.add(playlist)
    session.commit() # Commit to get playlist.id

    playlist_track = PlaylistTrack(
        playlist_id=playlist.id,
        track_id=track.id,
        position=1
    )
    session.add(playlist_track)

    chat_message = Chat(
        sender="testuser1",
        target="testuser2",
        content="Hello!"
    )
    session.add(chat_message)

    removal_request = RemovalRequest(
        track_id=track.id,
        requester="testadmin",
        reason="Test reason"
    )
    session.add(removal_request)

    session.commit()

    # Query back the user preference to ensure it was saved
    retrieved_pref = session.query(UserPreference).filter_by(username="testuser").first()
    assert retrieved_pref is not None
    assert retrieved_pref.theme == "dark"

    retrieved_track = session.query(Track).filter_by(title="Test Track").first()
    assert retrieved_track is not None
    assert retrieved_track.uploader == "testuploader"

    print("All models imported and basic operations tested successfully.")
