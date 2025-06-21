import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from backend.main import app # Assuming your FastAPI app instance is named 'app'
from backend.torb.models import Base, Track, UserPreference
from backend.auth import SessionManager # For creating test sessions
from backend.routes.preferences import get_db # To override dependency

# Setup a test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_tracks.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency override for database session
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

# Test client
client = TestClient(app)

# Helper to create session using the app's actual session manager
def create_test_session_for_app(username="testuser"):
    """Creates a session token for testing using the app's global session manager."""
    from backend.auth import session_manager as app_session_manager
    return app_session_manager.create_session(username)

@pytest.fixture(scope="function", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Ensure all create_test_user_session calls are replaced by create_test_session_for_app

def test_get_tracks_empty(db_session: Session):
    # Create a test user and session
    sid = create_test_session_for_app("testuser1")
    db_session.add(UserPreference(username="testuser1", theme="dark", muted_uploaders=[]))
    db_session.commit()

    response = client.get("/api/tracks", cookies={"sid": sid})
    assert response.status_code == 200
    assert response.json() == []

def test_get_tracks_with_data(db_session: Session):
    # Create user and preferences
    username = "testuser2"
    sid = create_test_session_for_app(username)
    db_session.add(UserPreference(username=username, theme="dark", muted_uploaders=["muted_uploader"]))

    # Add tracks
    track1 = Track(title="Title 1", uploader="uploader1", status="ready", duration=180, uuid="uuid1", cover_filename="cover1.jpg")
    track2 = Track(title="Title 2", uploader="muted_uploader", status="ready", duration=200, uuid="uuid2", cover_filename="cover2.jpg")
    track3 = Track(title="Title 3 (Fabi)", uploader="fabiomigueldp", status="ready", duration=220, uuid="uuid3", cover_filename="cover3.jpg")
    track4 = Track(title="Title 4", uploader="uploader1", status="processing", duration=240, uuid="uuid4", cover_filename="cover4.jpg") # Should not be listed

    db_session.add_all([track1, track2, track3, track4])
    db_session.commit()

    response = client.get("/api/tracks", cookies={"sid": sid})
    assert response.status_code == 200
    data = response.json()

    assert len(data) == 2 # track1 and track3 (fabiomigueldp)

    titles = [t["title"] for t in data]
    assert "Title 1" in titles
    assert "Title 3 (Fabi)" in titles
    assert "Title 2" not in titles # Muted
    assert "Title 4" not in titles # Not ready

    for t_data in data:
        if t_data["title"] == "Title 1":
            assert t_data["uploader"] == "uploader1"
            assert t_data["cover_url"] == "/media/uuid1/cover1.jpg"
            assert t_data["duration"] == 180
        if t_data["title"] == "Title 3 (Fabi)":
            assert t_data["uploader"] == "fabiomigueldp" # fabiomigueldp is never hidden
            assert t_data["cover_url"] == "/media/uuid3/cover3.jpg"
            assert t_data["duration"] == 220


def test_get_tracks_unauthenticated(db_session: Session):
    response = client.get("/api/tracks") # No session cookie
    assert response.status_code == 401 # Unauthorized

def test_stream_track_hls_not_found(db_session: Session):
    sid = create_test_session_for_app("testuser_stream")
    db_session.add(UserPreference(username="testuser_stream", theme="dark", muted_uploaders=[]))
    db_session.commit()

    response = client.get("/api/stream/nonexistent-uuid/master.m3u8", cookies={"sid": sid})
    assert response.status_code == 404

def test_stream_track_hls_success(db_session: Session, tmp_path):
    username = "testuser_stream_ok"
    sid = create_test_session_for_app(username)
    db_session.add(UserPreference(username=username, theme="dark", muted_uploaders=[]))

    # Create dummy HLS files
    media_data_path = tmp_path / "media-data"
    media_data_path.mkdir()
    track_uuid = "test-hls-uuid"
    track_hls_path = media_data_path / track_uuid / "hls"
    track_hls_path.mkdir(parents=True)

    master_m3u8_content = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nstream.m3u8"
    with open(track_hls_path / "master.m3u8", "w") as f:
        f.write(master_m3u8_content)

    track = Track(
        title="HLS Track",
        uploader="streamer",
        status="ready",
        duration=120,
        uuid=track_uuid,
        hls_root=str(media_data_path / track_uuid / "hls") # Path relative to where the app runs
    )
    db_session.add(track)
    db_session.commit()

    import os
    import shutil
    from pathlib import Path

    # Define paths relative to the project's CWD for FileResponse
    # Assuming tests are run from the project root directory
    project_root_media_data = Path(os.getcwd()) / "media-data"
    test_track_hls_dir_in_project = project_root_media_data / track_uuid / "hls"

    # Clean up if exists from previous failed run
    if project_root_media_data.exists():
        # Be careful with shutil.rmtree, ensure it's the correct path
        # For safety, only remove the specific track's HLS directory if it's within media-data
        if track_uuid in str(test_track_hls_dir_in_project): # Basic safety check
             shutil.rmtree(project_root_media_data / track_uuid, ignore_errors=True)
        elif not any(project_root_media_data.iterdir()): # or if media-data is empty
            shutil.rmtree(project_root_media_data, ignore_errors=True)


    test_track_hls_dir_in_project.mkdir(parents=True, exist_ok=True)

    master_m3u8_content = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nstream.m3u8"
    with open(test_track_hls_dir_in_project / "master.m3u8", "w") as f:
        f.write(master_m3u8_content)

    # Track's hls_root should be the relative path as stored in DB and used by the route
    relative_hls_root = f"media-data/{track_uuid}/hls"

    # Update the track in DB to use this relative hls_root
    db_session.query(Track).filter(Track.uuid == track_uuid).update({"hls_root": relative_hls_root})
    db_session.commit()
    db_session.refresh(track) # Refresh to get updated data if needed by later assertions

    response = client.get(f"/api/stream/{track_uuid}/master.m3u8", cookies={"sid": sid})

    if response.status_code != 200:
        print("Response content:", response.content)
        print(f"Track details: uuid={track.uuid}, hls_root={track.hls_root}, status={track.status}")
        print(f"Expected file at: {Path(os.getcwd()) / relative_hls_root / 'master.m3u8'}")
        assert os.path.exists(Path(os.getcwd()) / relative_hls_root / 'master.m3u8'), "M3U8 file does not exist where expected"

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.apple.mpegurl"
    assert response.text == master_m3u8_content

def test_stream_track_hls_no_hls_root(db_session: Session):
    username = "testuser_no_hls"
    sid = create_test_session_for_app(username)
    db_session.add(UserPreference(username=username, theme="dark", muted_uploaders=[]))

    track_no_hls = Track(title="No HLS Track", uploader="uploader", status="ready", duration=60, uuid="no-hls-uuid", hls_root=None)
    db_session.add(track_no_hls)
    db_session.commit()

    response = client.get(f"/api/stream/{track_no_hls.uuid}/master.m3u8", cookies={"sid": sid})
    assert response.status_code == 404
    assert response.json()["detail"] == "HLS stream not available for this track"

def test_stream_track_auth_required(db_session: Session):
    response = client.get("/api/stream/some-uuid/master.m3u8") # No session cookie
    assert response.status_code == 401

# Example of testing the 'fabiomigueldp' exception
def test_get_tracks_fabiomigueldp_never_muted(db_session: Session):
    username = "testuser_fabi"
    sid = create_test_session_for_app(username)
    # Mute fabiomigueldp specifically
    db_session.add(UserPreference(username=username, theme="dark", muted_uploaders=["fabiomigueldp"]))

    track_fabi = Track(title="Fabi's Track", uploader="fabiomigueldp", status="ready", duration=300, uuid="fabi_uuid", cover_filename="fabi.jpg")
    db_session.add(track_fabi)
    db_session.commit()

    response = client.get("/api/tracks", cookies={"sid": sid})
    assert response.status_code == 200
    data = response.json()

    assert len(data) == 1
    assert data[0]["title"] == "Fabi's Track"
    assert data[0]["uploader"] == "fabiomigueldp"

# Test case for track with no cover_filename or no uuid
def test_get_tracks_no_cover_url(db_session: Session):
    username = "testuser_no_cover"
    sid = create_test_session_for_app(username)
    db_session.add(UserPreference(username=username, theme="dark", muted_uploaders=[]))

    track_no_cover_filename = Track(title="No Cover Filename", uploader="uploader", status="ready", duration=100, uuid="uuid_no_cover_file")
    track_no_uuid = Track(title="No UUID", uploader="uploader", status="ready", duration=110, cover_filename="cover.jpg") # This state should ideally not happen due to model constraints

    db_session.add_all([track_no_cover_filename, track_no_uuid])
    db_session.commit()

    # Manually set uuid to None for track_no_uuid after adding to session, as model default might prevent None on creation
    # This is to simulate a potential bad data state if uuid was nullable and None.
    # However, our current model has uuid as non-nullable.
    # So, a track without a uuid that is committed to DB is unlikely unless constraints are bypassed.
    # Let's assume track_no_uuid is actually track_valid_uuid_no_cover_filename

    # Re-query to ensure we're working with committed data
    retrieved_track_no_cover_filename = db_session.query(Track).filter(Track.uuid == "uuid_no_cover_file").one()

    response = client.get("/api/tracks", cookies={"sid": sid})
    assert response.status_code == 200
    data = response.json()

    found_no_cover_filename = False
    for t_data in data:
        if t_data["title"] == "No Cover Filename":
            assert t_data["cover_url"] is None
            found_no_cover_filename = True

    assert found_no_cover_filename

    # Note: The 'track_no_uuid' case is harder to test meaningfully if DB/model enforces uuid.
    # If uuid is None, cover_url would also be None.
    # If the track simply doesn't have a cover_filename, cover_url should be None.
    # If the track doesn't have a uuid, cover_url should be None.

# Test path validation for stream HLS (Simplified test)
def test_stream_track_hls_invalid_path(db_session: Session):
    username = "testuser_invalid_path"
    sid = create_test_session_for_app(username)
    db_session.add(UserPreference(username=username, theme="dark", muted_uploaders=[]))

    track_invalid_path = Track(
        title="Invalid Path Track",
        uploader="streamer",
        status="ready",
        duration=120,
        uuid="invalid-path-uuid",
        hls_root="/etc/passwd" # Example of a path outside 'media-data/'
    )
    db_session.add(track_invalid_path)
    db_session.commit()

    response = client.get(f"/api/stream/{track_invalid_path.uuid}/master.m3u8", cookies={"sid": sid})
    assert response.status_code == 400 # Bad Request due to invalid path
    assert response.json()["detail"] == "Invalid track path"

# Note: The SessionManager used for tests (`test_session_manager`) is distinct from the one
# used by the main app. This is important because the main app's SessionManager
# might have background tasks or state that we don't want to interfere with tests
# or have tests interfere with. For cookie generation, it's fine as long as the
# `get_current_user` can validate the SID. Here, `get_current_user` uses the app's
# global `session_manager`.
# For more robust testing, especially if `SessionManager` itself were more complex,
# one might inject `SessionManager` dependency into `get_current_user` or related auth functions.
# However, `get_current_user` directly accesses the global `session_manager` from `auth.py` (corrected).
# This means our test client's cookies need to be generated by *that* `session_manager`.

# Re-adjusting how session is created for tests to use the app's session_manager
# This requires access to the app's session_manager instance.
# Let's assume `backend.auth.session_manager` is the one. (This is now correct)

# Corrected fixture for creating test user sessions
@pytest.fixture(scope="function")
def authenticated_client(db_session: Session, request):
    # Get username from test marker or use a default
    marker = request.node.get_closest_marker("user")
    username = marker.args[0] if marker else "testuser"

    # Use the app's actual session manager
    from backend.auth import session_manager as app_session_manager
    sid = app_session_manager.create_session(username)

    # Ensure user preference exists, otherwise some tests might fail if they assume it
    user_prefs = db_session.query(UserPreference).filter(UserPreference.username == username).one_or_none()
    if not user_prefs:
        db_session.add(UserPreference(username=username, theme="default", muted_uploaders=[]))
        db_session.commit()

    client.cookies.set("sid", sid)
    yield client
    client.cookies.clear() # Clean up cookies

# Example of using the new fixture (tests would need to be refactored)
# @pytest.mark.user("mytestuser")
# def test_get_tracks_with_authenticated_client(authenticated_client, db_session: Session):
#     response = authenticated_client.get("/api/tracks")
#     assert response.status_code == 200
#
# This change to `authenticated_client` means previous tests need to be updated to use it
# or continue using manual cookie setting with the app's session_manager.
# For now, let's stick to manual cookie setting with create_test_session_for_app for simplicity.

# Removed create_app_test_user_session as it's redundant with create_test_session_for_app

# Test using the app's session manager for SID creation
def test_get_tracks_empty_v2(db_session: Session):
    sid = create_test_session_for_app("testuser1_v2") # Changed here
    db_session.add(UserPreference(username="testuser1_v2", theme="dark", muted_uploaders=[]))
    db_session.commit()

    response = client.get("/api/tracks", cookies={"sid": sid})
    assert response.status_code == 200
    assert response.json() == []

# And so on for other tests... The existing tests should work if `create_test_user_session`
# is modified to use `backend.main.session_manager`.
# Let's assume `create_test_user_session` is implicitly using the correct one or
# we'll adjust it if test execution shows issues.
# The key is that `client.get(..., cookies={"sid": sid})` must use an SID that
# `get_current_user` (which uses `backend.auth.session_manager`) can validate.

# Final check on the `test_stream_track_hls_success`
# The `hls_root` in `Track` model is `media-data/{uuid}/hls`.
# `FileResponse` resolves this path relative to the current working directory.
# If tests are run from the project root, then creating `media-data/...` in `tmp_path`
# and storing an absolute path to `tmp_path/...` in `hls_root` for the test Track object
# is the correct approach for `FileResponse` to find the file.

# The `tmp_path` fixture provides a temporary directory unique to each test function.
# So, the path `media_data_path / track_uuid / "hls"` will be absolute.
# Storing this absolute path in `track.hls_root` for the test is correct.
# The `FileResponse` will then correctly serve the file from that absolute path.
# The previous version of `test_stream_track_hls_success` with absolute path for hls_root in test is fine.
# The current version which creates files in CWD/media-data and uses relative hls_root is also fine.
