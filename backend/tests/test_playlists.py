import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session as SQLAlchemySession # Renamed to avoid clash
from typing import Optional

from backend.main import app
from backend.torb import models
from backend.routes.preferences import get_db # For dependency override
# Removed unused create_session_cookie, TestClient handles cookies via login.

# Database setup for tests
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_playlists.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override get_db dependency for tests
def override_get_db_for_playlists():
    try:
        db_session = TestingSessionLocal()
        yield db_session
    finally:
        db_session.close()

app.dependency_overrides[get_db] = override_get_db_for_playlists

@pytest.fixture(scope="function", autouse=True)
def setup_database_tables_fixture(): # Renamed to avoid clash if other test files have same name
    models.Base.metadata.create_all(bind=engine)
    yield
    models.Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db() -> SQLAlchemySession: # Use the renamed Session for type hint
    db_session = TestingSessionLocal()
    try:
        yield db_session
    finally:
        db_session.close()

# Helper to create tracks
def create_test_track_in_db(db_session: SQLAlchemySession, uploader: str, title: str = "Test Track", uuid_suffix: str = "") -> models.Track:
    # Ensure unique UUID for each track if title is the same in multiple calls within a test
    track_uuid = f"test-uuid-{title.replace(' ', '-')}-{uuid_suffix if uuid_suffix else id(title)}"
    track = models.Track(uploader=uploader, title=title, status="ready", duration=180, uuid=track_uuid)
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)
    return track

# Authenticated client for 'fabiomigueldp'
@pytest.fixture(scope="function")
def client_user1() -> TestClient:
    local_client = TestClient(app, base_url="http://testserver") # Explicit base_url
    login_response = local_client.post("/api/login", json={"username": "fabiomigueldp", "password": "abc1d2aa"})
    assert login_response.status_code == 200, f"Login failed for fabiomigueldp: {login_response.text}"

    # httpx.TestClient automatically handles cookies from responses for subsequent requests.
    # The sid cookie from login_response is now in local_client.cookies.
    # Debug print to confirm the contents of the cookie jar:
    if hasattr(local_client.cookies, 'jar'):
        print(f"client_user1 fixture: Cookies after login: {list(local_client.cookies.jar)}")
    else: # Fallback for older httpx or different structure
        print(f"client_user1 fixture: Cookies after login (dict): {dict(local_client.cookies)}")

    return local_client

@pytest.fixture(scope="function")
def user1_username() -> str:
    return "fabiomigueldp"

# Tests start here, using the fixtures defined above.
# Removed create_test_user as users are from users.json.
# Removed test_user_token and test_user_token_other as client_user1 and user1_username cover the primary test user.
# For 'other user' scenarios, data is created directly in DB with a different owner username.

# Test Playlist CRUD
def test_create_playlist(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    response = client_user1.post("/api/playlists", json={"name": "My Test Playlist", "is_shared": False})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Test Playlist"
    assert data["owner"] == user1_username
    assert not data["is_shared"]
    assert "id" in data
    assert data["tracks"] == []

    playlist_db = db.query(models.Playlist).filter(models.Playlist.id == data["id"]).first()
    assert playlist_db is not None
    assert playlist_db.name == "My Test Playlist"
    assert playlist_db.owner == user1_username

def test_get_playlists_empty(client_user1: TestClient):
    response = client_user1.get("/api/playlists")
    assert response.status_code == 200
    assert response.json() == []

def test_get_playlists_with_data(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    client_user1.post("/api/playlists", json={"name": "Playlist 1", "is_shared": False})
    client_user1.post("/api/playlists", json={"name": "Playlist Shared by User1", "is_shared": True})

    user2_db_username = "user2_owns_this"
    shared_by_user2 = models.Playlist(name="Shared by User2", owner=user2_db_username, is_shared=True)
    private_by_user2 = models.Playlist(name="Private by User2", owner=user2_db_username, is_shared=False)
    db.add_all([shared_by_user2, private_by_user2])
    db.commit()

    response = client_user1.get("/api/playlists")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3

    names = sorted([p["name"] for p in data])
    assert names == ["Playlist 1", "Playlist Shared by User1", "Shared by User2"]
    for p_data in data:
        if p_data["name"] == "Playlist 1":
            assert p_data["owner"] == user1_username and not p_data["is_shared"]
        elif p_data["name"] == "Playlist Shared by User1":
            assert p_data["owner"] == user1_username and p_data["is_shared"]
        elif p_data["name"] == "Shared by User2":
            assert p_data["owner"] == user2_db_username and p_data["is_shared"]

def test_get_single_playlist(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    create_res = client_user1.post("/api/playlists", json={"name": "Single View", "is_shared": False})
    playlist_id = create_res.json()["id"]

    response = client_user1.get(f"/api/playlists/{playlist_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Single View" and data["owner"] == user1_username and data["id"] == playlist_id

def test_get_single_playlist_shared_by_other(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    user2_db_username = "user2_owns_shared_playlist"
    shared_playlist = models.Playlist(name="Another Shared", owner=user2_db_username, is_shared=True)
    db.add(shared_playlist)
    db.commit(); db.refresh(shared_playlist)

    response = client_user1.get(f"/api/playlists/{shared_playlist.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Another Shared" and data["owner"] == user2_db_username and data["is_shared"]

def test_get_single_playlist_private_by_other_forbidden(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    user2_db_username = "user2_owns_private_playlist"
    private_playlist = models.Playlist(name="Another Private", owner=user2_db_username, is_shared=False)
    db.add(private_playlist)
    db.commit(); db.refresh(private_playlist)

    response = client_user1.get(f"/api/playlists/{private_playlist.id}")
    assert response.status_code == 403

def test_get_nonexistent_playlist(client_user1: TestClient):
    response = client_user1.get("/api/playlists/99999")
    assert response.status_code == 404

def test_update_playlist_name(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    create_res = client_user1.post("/api/playlists", json={"name": "Original", "is_shared": False})
    playlist_id = create_res.json()["id"]

    response = client_user1.put(f"/api/playlists/{playlist_id}", json={"name": "Updated"})
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated" and not data["is_shared"]
    assert db.query(models.Playlist).get(playlist_id).name == "Updated"

def test_update_playlist_is_shared(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    create_res = client_user1.post("/api/playlists", json={"name": "To Share", "is_shared": False})
    playlist_id = create_res.json()["id"]

    response = client_user1.put(f"/api/playlists/{playlist_id}", json={"is_shared": True})
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "To Share" and data["is_shared"]
    assert db.query(models.Playlist).get(playlist_id).is_shared

def test_update_playlist_partial(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    create_res = client_user1.post("/api/playlists", json={"name": "Partial Original", "is_shared": False})
    playlist_id = create_res.json()["id"]

    response = client_user1.put(f"/api/playlists/{playlist_id}", json={"name": "Partial Updated Name"})
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Partial Updated Name" and not data["is_shared"]
    db_playlist = db.query(models.Playlist).get(playlist_id)
    assert db_playlist.name == "Partial Updated Name" and not db_playlist.is_shared

def test_update_playlist_by_non_owner_forbidden(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    user2_db_username = "owner_of_playlist_to_update"
    owned_pl = models.Playlist(name="Owned PL", owner=user2_db_username, is_shared=False)
    db.add(owned_pl); db.commit(); db.refresh(owned_pl)

    response = client_user1.put(f"/api/playlists/{owned_pl.id}", json={"name": "Update Attempt"})
    assert response.status_code == 403

    owned_pl.is_shared = True # Make it shared
    db.commit()
    response = client_user1.put(f"/api/playlists/{owned_pl.id}", json={"name": "Update Shared Attempt"})
    assert response.status_code == 403 # Still forbidden for non-owner to modify

def test_delete_playlist(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    create_res = client_user1.post("/api/playlists", json={"name": "To Delete", "is_shared": False})
    playlist_id = create_res.json()["id"]

    response = client_user1.delete(f"/api/playlists/{playlist_id}")
    assert response.status_code == 204
    assert db.query(models.Playlist).get(playlist_id) is None
    assert client_user1.get(f"/api/playlists/{playlist_id}").status_code == 404

def test_delete_playlist_by_non_owner_forbidden(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    user2_db_username = "owner_of_playlist_to_delete"
    owned_pl = models.Playlist(name="Owned PL Del", owner=user2_db_username, is_shared=False)
    db.add(owned_pl); db.commit(); db.refresh(owned_pl)

    response = client_user1.delete(f"/api/playlists/{owned_pl.id}")
    assert response.status_code == 403
    assert db.query(models.Playlist).get(owned_pl.id) is not None


# Test Playlist Tracks
@pytest.fixture
def fixture_playlist_with_tracks(db: SQLAlchemySession, user1_username: str, client_user1: TestClient): # Renamed
    track1 = create_test_track_in_db(db, uploader=user1_username, title="Track Alpha", uuid_suffix="alpha")
    track2 = create_test_track_in_db(db, uploader=user1_username, title="Track Beta", uuid_suffix="beta")
    track3 = create_test_track_in_db(db, uploader=user1_username, title="Track Gamma", uuid_suffix="gamma")

    playlist_res = client_user1.post("/api/playlists", json={"name": "Tracks Test PL", "is_shared": False})
    assert playlist_res.status_code == 201
    playlist_id = playlist_res.json()["id"]
    return playlist_id, track1, track2, track3

def test_add_track_to_playlist(client_user1: TestClient, db: SQLAlchemySession, fixture_playlist_with_tracks): # Renamed fixture
    playlist_id, track1, track2, _ = fixture_playlist_with_tracks

    res_add_t1 = client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 1})
    assert res_add_t1.status_code == 200 # Changed from 201
    d1 = res_add_t1.json()
    assert d1["track_id"] == track1.id and d1["position"] == 1 and d1["track"]["id"] == track1.id

    res_add_t2 = client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track2.id, "position": 1})
    assert res_add_t2.status_code == 200 # Changed from 201
    d2 = res_add_t2.json()
    assert d2["track_id"] == track2.id and d2["position"] == 1

    playlist_res = client_user1.get(f"/api/playlists/{playlist_id}")
    tracks_in_pl = playlist_res.json()["tracks"]
    assert len(tracks_in_pl) == 2
    assert tracks_in_pl[0]["track_id"] == track2.id and tracks_in_pl[0]["position"] == 1
    assert tracks_in_pl[1]["track_id"] == track1.id and tracks_in_pl[1]["position"] == 2

def test_add_track_to_playlist_invalid_position(client_user1: TestClient, fixture_playlist_with_tracks): # Renamed
    playlist_id, track1, _, _ = fixture_playlist_with_tracks
    assert client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 0}).status_code == 422
        # The next line's expectation might change based on whether the 400 is correctly raised now.
        # If it was returning 201 incorrectly, and now returns 200 incorrectly (if 400 not raised), this test still fails.
        # The goal is for it to correctly return 400.
    assert client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 5}).status_code == 400

def test_add_nonexistent_track_to_playlist(client_user1: TestClient, fixture_playlist_with_tracks): # Renamed
    playlist_id, _, _, _ = fixture_playlist_with_tracks
    assert client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": 9999, "position": 1}).status_code == 404

def test_add_track_to_nonexistent_playlist(client_user1: TestClient, db: SQLAlchemySession, user1_username: str):
    track = create_test_track_in_db(db, uploader=user1_username, uuid_suffix="nonexistpl")
    assert client_user1.post("/api/playlists/9999/tracks", json={"track_id": track.id, "position": 1}).status_code == 404

def test_add_or_reorder_track_existing_is_reorder(client_user1: TestClient, fixture_playlist_with_tracks): # Renamed
    playlist_id, track1, _, _ = fixture_playlist_with_tracks
    # First call adds the track, should be 200 now (was 201, but endpoint default is 200)
    add_response = client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 1})
    assert add_response.status_code == 200

    # Second call reorders (no change), should be 200
    response = client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 1})
    assert response.status_code == 200
    assert response.json()["position"] == 1
    assert len(client_user1.get(f"/api/playlists/{playlist_id}").json()["tracks"]) == 1

def test_reorder_track_in_playlist(client_user1: TestClient, db: SQLAlchemySession, fixture_playlist_with_tracks): # Renamed
    playlist_id, track1, track2, track3 = fixture_playlist_with_tracks
    client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 1})
    client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track2.id, "position": 2})
    client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track3.id, "position": 3})

    res_reorder_t1 = client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 3})
    assert res_reorder_t1.status_code == 200
    assert res_reorder_t1.json()["track_id"] == track1.id and res_reorder_t1.json()["position"] == 3

    tracks = client_user1.get(f"/api/playlists/{playlist_id}").json()["tracks"]
    assert tracks[0]["track_id"] == track2.id and tracks[0]["position"] == 1
    assert tracks[1]["track_id"] == track3.id and tracks[1]["position"] == 2
    assert tracks[2]["track_id"] == track1.id and tracks[2]["position"] == 3

    res_reorder_t3 = client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track3.id, "position": 1})
    assert res_reorder_t3.status_code == 200
    assert res_reorder_t3.json()["track_id"] == track3.id and res_reorder_t3.json()["position"] == 1

    tracks = client_user1.get(f"/api/playlists/{playlist_id}").json()["tracks"]
    assert tracks[0]["track_id"] == track3.id and tracks[0]["position"] == 1
    assert tracks[1]["track_id"] == track2.id and tracks[1]["position"] == 2
    assert tracks[2]["track_id"] == track1.id and tracks[2]["position"] == 3

def test_reorder_track_invalid_position(client_user1: TestClient, fixture_playlist_with_tracks): # Renamed
    playlist_id, track1, track2 = fixture_playlist_with_tracks[0:3:1] # Get first two tracks
    client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 1})
    client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track2.id, "position": 2})

    assert client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 0}).status_code == 422
    assert client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 3}).status_code == 400

def test_remove_track_from_playlist(client_user1: TestClient, db: SQLAlchemySession, fixture_playlist_with_tracks): # Renamed
    playlist_id, track1, track2, track3 = fixture_playlist_with_tracks
    client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track1.id, "position": 1})
    client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track2.id, "position": 2})
    client_user1.post(f"/api/playlists/{playlist_id}/tracks", json={"track_id": track3.id, "position": 3})

    assert client_user1.delete(f"/api/playlists/{playlist_id}/tracks/{track2.id}").status_code == 204
    tracks = client_user1.get(f"/api/playlists/{playlist_id}").json()["tracks"]
    assert len(tracks) == 2
    assert tracks[0]["track_id"] == track1.id and tracks[1]["track_id"] == track3.id and tracks[1]["position"] == 2

    assert client_user1.delete(f"/api/playlists/{playlist_id}/tracks/{track1.id}").status_code == 204
    tracks = client_user1.get(f"/api/playlists/{playlist_id}").json()["tracks"]
    assert len(tracks) == 1
    assert tracks[0]["track_id"] == track3.id and tracks[0]["position"] == 1

    assert client_user1.delete(f"/api/playlists/{playlist_id}/tracks/{track3.id}").status_code == 204
    assert len(client_user1.get(f"/api/playlists/{playlist_id}").json()["tracks"]) == 0

def test_remove_nonexistent_track_from_playlist(client_user1: TestClient, fixture_playlist_with_tracks): # Renamed
    playlist_id, _, _, _ = fixture_playlist_with_tracks
    assert client_user1.delete(f"/api/playlists/{playlist_id}/tracks/9999").status_code == 404

def test_add_or_reorder_track_by_non_owner_forbidden(client_user1: TestClient, db: SQLAlchemySession, user1_username: str): # Changed test_user_token to user1_username
    user2_db_username = "track_owner_forbidden_test"
    owned_pl = models.Playlist(name="User2 PL Tracks Forbidden", owner=user2_db_username, is_shared=False)
    track_to_add = create_test_track_in_db(db, uploader=user2_db_username, title="User2 Track Forbidden", uuid_suffix="forbiddenadd")
    db.add(owned_pl); db.commit(); db.refresh(owned_pl)

    response = client_user1.post(f"/api/playlists/{owned_pl.id}/tracks", json={"track_id": track_to_add.id, "position": 1})
    assert response.status_code == 403

def test_remove_track_by_non_owner_forbidden(client_user1: TestClient, db: SQLAlchemySession, user1_username: str): # Changed test_user_token to user1_username
    user2_db_username = "track_remove_forbidden_test"
    owned_pl = models.Playlist(name="User2 PL Remove Forbidden", owner=user2_db_username, is_shared=False)
    track_in_pl = create_test_track_in_db(db, uploader=user2_db_username, title="Track To Remove Forbidden", uuid_suffix="forbiddenremove")
    db.add(owned_pl); db.commit(); db.refresh(owned_pl)

    # Add track to playlist directly in DB for setup as user2_db_username
    pt_entry = models.PlaylistTrack(playlist_id=owned_pl.id, track_id=track_in_pl.id, position=1)
    db.add(pt_entry); db.commit()

    response = client_user1.delete(f"/api/playlists/{owned_pl.id}/tracks/{track_in_pl.id}")
    assert response.status_code == 403

# Authentication tests for main playlist endpoints
def test_create_playlist_unauthenticated(db: SQLAlchemySession): # db fixture for table setup
    unauth_client = TestClient(app)
    response = unauth_client.post("/api/playlists", json={"name": "Unauth PL", "is_shared": False})
    assert response.status_code == 401

def test_get_playlists_unauthenticated(db: SQLAlchemySession): # db fixture for table setup
    unauth_client = TestClient(app)
    response = unauth_client.get("/api/playlists")
    assert response.status_code == 401

# Final print statement from original template removed as it's not part of the test logic.
# Test logic for `test_add_track_to_playlist_invalid_position` and `test_reorder_track_invalid_position`
# for position > max_pos + 1 (add) or > max_pos (reorder) are covered by the `400` status code checks.
# The Pydantic `gt=0` for position covers `<=0` cases with `422`.
