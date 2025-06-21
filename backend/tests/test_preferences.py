import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from backend.main import app, get_current_user # Main FastAPI app & get_current_user for override
from backend.torb.models import Base, UserPreference # UserPreference model
from backend.auth import User # User model for mocking get_current_user return type
from backend.routes.preferences import get_db # get_db dependency

# Use a separate test database
DATABASE_URL = "sqlite:///./test_preferences.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency override for get_db
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

# Fixture to create tables and drop them after test session
@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine) # Create tables
    yield
    Base.metadata.drop_all(bind=engine) # Drop tables after tests

# Fixture to provide a database session for each test
@pytest.fixture(scope="function")
def db_session(setup_db):
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()

# Fixture for the TestClient
@pytest.fixture(scope="module")
def client():
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    # Clear overrides after yielding the client, not globally for the app
    # This is important if other test modules use the same app but different overrides
    app.dependency_overrides.pop(get_db, None)


# Mock get_current_user dependency
def mock_get_current_user_testuser():
    return User(username="testuser", is_admin=False)

@pytest.mark.parametrize("initial_prefs_exist, new_theme, new_muted_uploaders, expected_theme, expected_muted_uploaders", [
    (False, "neon", ["uploader1", "uploader2"], "neon", ["uploader1", "uploader2"]), # No initial prefs
    (True, "vaporwave", [], "vaporwave", []), # Initial prefs exist, new muted_uploaders is empty list
    (True, "retrocrt", None, "retrocrt", ["existing_uploader"]), # Initial prefs exist, muted_uploaders not sent (should keep existing)
    (True, "midnight", ["new_uploader"], "midnight", ["new_uploader"]), # Initial prefs exist, update all
])
def test_put_update_user_preferences(
    client: TestClient,
    db_session: Session,
    initial_prefs_exist: bool,
    new_theme: str,
    new_muted_uploaders: list[str] | None,
    expected_theme: str,
    expected_muted_uploaders: list[str]
):
    # Override the get_current_user dependency for this specific test or test module
    original_get_current_user = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = mock_get_current_user_testuser

    username = "testuser"
    initial_theme = "synthwave"
    initial_muted = ["existing_uploader"]

    if initial_prefs_exist:
        existing_pref = UserPreference(username=username, theme=initial_theme, muted_uploaders=initial_muted)
        db_session.add(existing_pref)
        db_session.commit()

    payload = {"theme": new_theme}
    if new_muted_uploaders is not None:
        payload["muted_uploaders"] = new_muted_uploaders

    response = client.put("/api/preferences", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["theme"] == expected_theme

    # If new_muted_uploaders was None, we expect the old ones to persist
    if new_muted_uploaders is None and initial_prefs_exist:
        assert data["muted_uploaders"] == initial_muted
    else:
        assert data["muted_uploaders"] == expected_muted_uploaders

    # Verify in DB
    db_pref = db_session.query(UserPreference).filter(UserPreference.username == username).one_or_none()
    assert db_pref is not None
    assert db_pref.theme == expected_theme
    if new_muted_uploaders is None and initial_prefs_exist:
        assert db_pref.muted_uploaders == initial_muted
    else:
        assert db_pref.muted_uploaders == expected_muted_uploaders

    # Clean up dependency override for get_current_user
    if original_get_current_user is not None:
        app.dependency_overrides[get_current_user] = original_get_current_user
    else:
        app.dependency_overrides.pop(get_current_user, None)


def test_login_creates_default_preferences(client: TestClient, db_session: Session):
    # Using "testuser" and "testpassword" as per simplified approach, assuming they exist in users.json
    login_username = "testuser"
    login_password = "testpassword"

    login_payload = {"username": login_username, "password": login_password}

    # Ensure no preferences exist for this user beforehand in this test's session
    # The db_session fixture ensures a clean transaction for each test.
    # However, we can explicitly delete if a previous test in the same session somehow created it
    # (though with function scope, this shouldn't happen).
    # For safety and clarity:
    existing_prefs_setup = db_session.query(UserPreference).filter(UserPreference.username == login_username).one_or_none()
    if existing_prefs_setup:
        db_session.delete(existing_prefs_setup)
        db_session.commit()
        # Re-query to confirm deletion or ensure it's not in the session cache
        existing_prefs_setup = db_session.query(UserPreference).filter(UserPreference.username == login_username).one_or_none()

    assert existing_prefs_setup is None, f"Preferences for {login_username} should not exist before login test"

    # Call the login endpoint
    # LoginRequest Pydantic model implies json payload, not form data
    response = client.post("/api/login", json=login_payload)

    assert response.status_code == 200, f"Login failed for user '{login_username}'. Response: {response.text}"

    # Verify preferences were created in the DB
    pref_record = db_session.query(UserPreference).filter(UserPreference.username == login_username).one_or_none()

    assert pref_record is not None, f"Preferences for {login_username} were not created after login"
    assert pref_record.theme == "synthwave", f"Default theme for {login_username} is not 'synthwave', found '{pref_record.theme}'"
    assert pref_record.muted_uploaders == [], f"Default muted_uploaders for {login_username} is not an empty list, found '{pref_record.muted_uploaders}'"

    # The db_session fixture will roll back this transaction, so the created preference will be removed.
    # No explicit cleanup of the UserPreference record is strictly needed here due to fixture's rollback.
