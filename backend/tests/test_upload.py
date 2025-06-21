import asyncio
import shutil
from pathlib import Path
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from backend.main import app # Main FastAPI app
from backend.torb.models import Base, Track
from backend.routes.preferences import get_db as app_get_db # The get_db used by the app
from backend.tests.utils import generate_test_mp3 # Utility to generate test audio
from backend.auth import User, get_current_user # For overriding dependencies

# Test database setup
DATABASE_URL = "sqlite:///./test_upload.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}) # check_same_thread for SQLite
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency override for get_db
def override_get_db():
    try:
        db = TestSessionLocal()
        yield db
    finally:
        db.close()

# --- AC-3: CPU Load Test (Parallel Uploads) ---
@pytest.mark.asyncio # Pytest-asyncio might be needed for this if using async client calls directly
async def test_parallel_uploads_succeed(authenticated_client: TestClient, temp_upload_media_dirs):
    """
    Tests that two uploads initiated in parallel can both complete successfully.
    This is a basic check for concurrent processing.
    """
    local_files_dir, _, _ = temp_upload_media_dirs

    # Prepare two different files and titles
    test_mp3_path1 = generate_test_mp3(local_files_dir, "parallel_test1.mp3", duration_seconds=1)
    test_cover_path1 = local_files_dir / "parallel_cover1.jpg"
    with open(test_cover_path1, "wb") as f:
        f.write(b"pcover1")

    test_mp3_path2 = generate_test_mp3(local_files_dir, "parallel_test2.mp3", duration_seconds=1)
    test_cover_path2 = local_files_dir / "parallel_cover2.jpg"
    with open(test_cover_path2, "wb") as f:
        f.write(b"pcover2")

    # Define an async function to upload and poll for one track
    async def upload_and_poll(title: str, audio_path: Path, cover_path: Path) -> dict:
        # authenticated_client is synchronous, so we run its methods in a thread pool
        # to make them awaitable in this async test function.
        # Alternatively, use an async TestClient like httpx.AsyncClient if app is setup for it.
        # For now, TestClient from FastAPI is sync.

        loop = asyncio.get_event_loop()

        def _upload():
            with open(audio_path, "rb") as af, open(cover_path, "rb") as cf:
                return authenticated_client.post(
                    "/api/upload",
                    data={"title": title},
                    files={"file": (audio_path.name, af, "audio/mpeg"), "cover": (cover_path.name, cf, "image/jpeg")}
                )

        response = await loop.run_in_executor(None, _upload)
        assert response.status_code == 200
        upload_data = response.json()
        track_id = upload_data["track_id"]
        assert upload_data["status"] == "processing"

        max_wait_time = 45  # Increased wait time for parallel processing
        poll_interval = 1
        start_time = time.time()

        while time.time() - start_time < max_wait_time:
            def _poll():
                return authenticated_client.get(f"/api/upload/status/{track_id}")

            status_response = await loop.run_in_executor(None, _poll)
            assert status_response.status_code == 200
            current_status_data = status_response.json()

            if current_status_data["status"] == "ready":
                # Verify HLS files for this track (simplified check for brevity)
                track_uuid_poll = current_status_data["uuid"]
                master_m3u8_path_poll = Path("/media") / track_uuid_poll / "master.m3u8"
                assert master_m3u8_path_poll.exists(), f"Master playlist for {title} not found at {master_m3u8_path_poll}"
                return current_status_data
            elif current_status_data["status"] == "error":
                pytest.fail(f"Track '{title}' processing failed: {current_status_data}")
            await asyncio.sleep(poll_interval) # Use asyncio.sleep in async def

        pytest.fail(f"Track '{title}' did not become ready within {max_wait_time} seconds.")


    # Run two upload_and_poll tasks concurrently
    results = await asyncio.gather(
        upload_and_poll("Parallel Track 1", test_mp3_path1, test_cover_path1),
        upload_and_poll("Parallel Track 2", test_mp3_path2, test_cover_path2)
    )

    # Check results
    for result in results:
        assert result["status"] == "ready"
        assert result["hls_url"] is not None
        # Further checks on DB or file system for each track can be added if needed

    print("Both parallel uploads completed successfully.")

# Fixture for a test client
@pytest.fixture(scope="module")
def client():
    # Create tables for the test DB
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[app_get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    # Teardown: remove test DB and clean overrides
    Base.metadata.drop_all(bind=engine)
    Path("./test_upload.db").unlink(missing_ok=True)
    app.dependency_overrides = {}


# Fixture to provide an authenticated client
@pytest.fixture
def authenticated_client(client: TestClient):
    # Mock get_current_user to return a test user
    def override_get_current_user_test_user():
        return User(username="testuser", is_admin=False)

    app.dependency_overrides[get_current_user] = override_get_current_user_test_user
    # Note: Actual login flow is not tested here, we directly mock the authenticated user.
    # To test login, you'd post to /api/login. For endpoint auth tests, mocking is fine.
    return client


# Fixture to provide an unauthenticated client (no overrides for get_current_user)
@pytest.fixture
def unauthenticated_client(client: TestClient):
    # Ensure no auth override is active from previous tests if any
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]
    return client

# Temporary directory for test uploads and media
@pytest.fixture(scope="module")
def temp_upload_media_dirs():
    base_temp_dir = Path("./temp_test_data_upload_module")
    test_uploads_dir = base_temp_dir / "uploads"
    test_media_dir = base_temp_dir / "media"

    # Monkeypatch the UPLOAD_DIR and MEDIA_DIR in the upload route module
    # This is a bit tricky as the module constants are already loaded.
    # For a robust solution, the upload module might need to be refactored to get these paths from config or app state.
    # For now, we'll try to ensure the test environment uses these paths.
    # The critical part is that the background task also uses these paths.

    # Let's ensure they exist for the test session
    test_uploads_dir.mkdir(parents=True, exist_ok=True)
    test_media_dir.mkdir(parents=True, exist_ok=True)

    # The upload module uses these paths directly.
    # We need to ensure our tests and the code run by the TestClient uses these.
    # One way is to use environment variables if the code supports it, or patch them directly.
    # For now, we rely on the fact that the test client runs in the same process and can see these paths
    # if the upload module is imported AFTER these paths are set up or if they are configured.
    # The current upload.py defines them as module-level constants.
    # This means they are set when the module is first imported.
    # A common pattern is `UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/uploads"))`
    # For this test, we'll assume the default /uploads and /media are mapped via docker-compose in real env,
    # and for local tests, we'll ensure test files go to local ./temp_test_data...
    # The actual UPLOAD_DIR and MEDIA_DIR used by the app are hardcoded in backend/routes/upload.py
    # We will create files in the *actual* UPLOAD_DIR and MEDIA_DIR paths used by the app for testing.
    # So, the fixture will just manage a local temp dir for generated test files before they are "uploaded".

    local_test_files_dir = base_temp_dir / "local_test_files"
    local_test_files_dir.mkdir(parents=True, exist_ok=True)

    yield local_test_files_dir, test_uploads_dir, test_media_dir # local_test_files_dir for generating, the others for app interaction

    # Teardown
    if base_temp_dir.exists():
        shutil.rmtree(base_temp_dir)


# --- AC-1: Authentication Tests ---

def test_upload_track_unauthenticated(unauthenticated_client: TestClient, temp_upload_media_dirs):
    """Test POST /api/upload without authentication."""
    local_files_dir, _, _ = temp_upload_media_dirs
    test_mp3_path = generate_test_mp3(local_files_dir, "auth_test.mp3")
    test_cover_path = local_files_dir / "cover.jpg"
    with open(test_cover_path, "wb") as f:
        f.write(b"fake cover data")

    with open(test_mp3_path, "rb") as audio_file, open(test_cover_path, "rb") as cover_file:
        response = unauthenticated_client.post(
            "/api/upload",
            data={"title": "Auth Test Track"},
            files={"file": ("test.mp3", audio_file, "audio/mpeg"), "cover": ("cover.jpg", cover_file, "image/jpeg")}
        )
    assert response.status_code == 401


def test_get_upload_status_unauthenticated(unauthenticated_client: TestClient):
    """Test GET /api/upload/status/{track_id} without authentication."""
    response = unauthenticated_client.get("/api/upload/status/1")
    assert response.status_code == 401

# --- End AC-1 ---

# Placeholder for further tests
# Test AC-2: Three bitrate playlists present in master.
# Test AC-3: CPU load test: 2 × uploads in parallel succeed.
# Test full upload and processing pipeline.
# Test status polling during and after processing.
# Test error handling in processing.

# It's important that the UPLOAD_DIR and MEDIA_DIR in backend.routes.upload
# point to locations that the test environment can write to and verify.
# If they are absolute paths like /uploads, the test setup needs to ensure these are usable.
# For tests, it might be better if these were configurable.
# For now, we assume the tests run in an environment where /uploads and /media are writable temp dirs
# or the test runner (e.g. Dockerized test env) maps them appropriately.
# The temp_upload_media_dirs fixture is more for *generating* files that are then fed to the endpoint.
# The endpoint itself will use its hardcoded UPLOAD_DIR and MEDIA_DIR.
# We will need to inspect those locations. Let's assume they are /uploads and /media.
# For the test to clean them up, this might be an issue if they are system paths.
# A better approach for tests would be to override these path configurations.
# Let's proceed for now and address path management if it becomes a problem.
# The `temp_upload_media_dirs` fixture's `test_uploads_dir` and `test_media_dir` are not directly used by the app code.

# To truly test file system interactions, we might need to patch Path or os.path.join
# within the scope of the test, or make UPLOAD_DIR/MEDIA_DIR configurable in the app.
# For now, the tests will operate on the hardcoded /uploads and /media.
# The test fixture `temp_upload_media_dirs` will manage its own ./temp_test_data_upload_module
# for inputs, but the app will write to /uploads and /media.
# These paths might need to be actual temporary directories for testing.

# Let's add a fixture to clean up /uploads and /media content if they are used by tests.
@pytest.fixture(autouse=True) # autouse to ensure it runs for all tests in this module
def cleanup_app_upload_media_dirs():
    # These are the paths hardcoded in backend/routes/upload.py
    app_upload_dir = Path("/uploads")
    app_media_dir = Path("/media")

    def _cleanup():
        if app_upload_dir.exists():
            for item in app_upload_dir.iterdir():
                if item.is_dir(): # Assuming track_uuid subdirs
                    shutil.rmtree(item)
                else:
                    item.unlink() # Just in case
        if app_media_dir.exists():
             for item in app_media_dir.iterdir():
                if item.is_dir(): # Assuming track_uuid subdirs
                    shutil.rmtree(item)
                else:
                    item.unlink()

    _cleanup() # Cleanup before test
    yield
    _cleanup() # Cleanup after test

# Note: The `cleanup_app_upload_media_dirs` assumes it has permission to delete from /uploads and /media.
# This is fine if these are mapped to temporary locations during testing (e.g., in a Dockerized test environment).
# If running locally where /uploads is a real system path, this could be problematic.
# A safer way is to make these paths configurable in the app and override them in tests.
# For example, using FastAPI's app state or settings.

# For now, the test structure is laid out.
# Next will be the integration test for successful upload and processing.
# And then AC-2 and AC-3.

# --- AC-2: Integration Test for Upload, Processing, and HLS structure ---
def test_upload_and_processing_pipeline_success(authenticated_client: TestClient, temp_upload_media_dirs):
    """
    Tests the full upload pipeline:
    1. Upload a generated MP3 and a cover.
    2. Poll status until "ready".
    3. Verify AC-2: master.m3u8 and sub-playlists are created and structured correctly.
    4. Verify Track record in DB.
    """
    local_files_dir, app_uploads_dir_actual, app_media_dir_actual = temp_upload_media_dirs
    # Note: app_uploads_dir_actual and app_media_dir_actual are not used by the test logic directly,
    # but represent the paths the app will use (/uploads, /media). We rely on cleanup_app_upload_media_dirs.

    test_mp3_path = generate_test_mp3(local_files_dir, "pipeline_test.mp3", duration_seconds=1) # Short duration for faster test
    test_cover_path = local_files_dir / "pipeline_cover.jpg"
    with open(test_cover_path, "wb") as f:
        f.write(b"fake pipeline cover data")

    track_id = None
    track_uuid = None

    with open(test_mp3_path, "rb") as audio_f, open(test_cover_path, "rb") as cover_f:
        response = authenticated_client.post(
            "/api/upload",
            data={"title": "Pipeline Test Track"},
            files={"file": ("test.mp3", audio_f, "audio/mpeg"), "cover": ("cover.jpg", cover_f, "image/jpeg")}
        )

    assert response.status_code == 200
    response_data = response.json()
    assert response_data["status"] == "processing"
    track_id = response_data["track_id"]
    track_uuid = response_data["uuid"]
    assert track_id is not None
    assert track_uuid is not None

    # Poll for status
    max_wait_time = 30  # seconds, FFmpeg can take a bit
    poll_interval = 1
    start_time = time.time()
    final_status_data = None

    while time.time() - start_time < max_wait_time:
        status_response = authenticated_client.get(f"/api/upload/status/{track_id}")
        assert status_response.status_code == 200
        current_status_data = status_response.json()
        if current_status_data["status"] == "ready":
            final_status_data = current_status_data
            break
        elif current_status_data["status"] == "error":
            pytest.fail(f"Track processing failed with error status: {current_status_data}")
        time.sleep(poll_interval)
    else:
        pytest.fail(f"Track did not become ready within {max_wait_time} seconds. Last status: {current_status_data['status']}")

    assert final_status_data is not None
    assert final_status_data["status"] == "ready"
    assert final_status_data["hls_url"] is not None

    # Verify AC-2: HLS file structure and content
    # The hls_url is an absolute path from the server's perspective (e.g., /media/<uuid>/master.m3u8)
    # We need to check the actual file system for these.
    # These paths are hardcoded in backend/routes/upload.py as MEDIA_DIR = Path("/media")

    media_base_path = Path("/media") # As defined in upload.py
    track_media_path = media_base_path / track_uuid
    master_m3u8_path = track_media_path / "master.m3u8"

    assert master_m3u8_path.exists(), f"Master playlist not found at {master_m3u8_path}"

    with open(master_m3u8_path, "r") as f:
        master_content = f.read()

    assert "#EXTM3U" in master_content
    assert "64k/playlist.m3u8" in master_content
    assert "128k/playlist.m3u8" in master_content
    assert "256k/playlist.m3u8" in master_content
    assert "BANDWIDTH=64000" in master_content
    assert "BANDWIDTH=128000" in master_content
    assert "BANDWIDTH=256000" in master_content

    expected_bitrates = ["64k", "128k", "256k"]
    for br in expected_bitrates:
        br_playlist_path = track_media_path / br / "playlist.m3u8"
        assert br_playlist_path.exists(), f"Bitrate playlist {br_playlist_path} not found"
        with open(br_playlist_path, "r") as f:
            br_content = f.read()
        assert "#EXTM3U" in br_content
        assert "segment" in br_content # Check for segment files listed

        # Check for actual segment files
        segment_dir = track_media_path / br
        ts_files = list(segment_dir.glob("segment*.ts"))
        assert len(ts_files) > 0, f"No .ts segment files found in {segment_dir}"
        for ts_file in ts_files:
            assert ts_file.stat().st_size > 0, f"Segment file {ts_file} is empty"

    # Verify Track record in DB
    db = TestSessionLocal()
    try:
        track_from_db = db.query(Track).filter(Track.id == track_id).first()
        assert track_from_db is not None
        assert track_from_db.status == "ready"
        assert track_from_db.hls_root == str(master_m3u8_path)
        assert track_from_db.title == "Pipeline Test Track"
        assert track_from_db.uploader == "testuser" # From authenticated_client fixture
        assert (Path("/uploads") / track_uuid / "original.mp3").exists() # Check original file
        assert (Path("/uploads") / track_uuid / "cover.jpg").exists() # Check cover file
    finally:
        db.close()
