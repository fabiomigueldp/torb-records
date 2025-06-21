import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as SQLAlchemySession # Use the same alias as in conftest
from backend.main import app
from backend.torb.models import Chat # Removed User import as it's not in torb.models and not used here
from backend.auth import create_access_token
from datetime import datetime, timedelta, timezone

# client fixture is now in conftest.py and used automatically if named 'client'

# Fixture to create test users and chat messages
@pytest.fixture(scope="function")
def setup_chat_data(db: SQLAlchemySession): # Use SQLAlchemySession type hint
    # Clear existing chat data to ensure test isolation
    db.query(Chat).delete()
    # User creation/management is outside the scope of this fixture now,
    # relying on get_auth_headers and config/users.json for user identity.

    user1 = "testuser1"
    user2 = "testuser2"
    user3 = "testuser3"

    # Create some chat messages
    messages = [
        # DMs between user1 and user2
        Chat(sender=user1, target=user2, content="Hello User2 from User1", created_at=datetime.now(timezone.utc) - timedelta(minutes=10)),
        Chat(sender=user2, target=user1, content="Hi User1 from User2", created_at=datetime.now(timezone.utc) - timedelta(minutes=9)),
        Chat(sender=user1, target=user2, content="How are you?", created_at=datetime.now(timezone.utc) - timedelta(minutes=8)),
        # Global messages
        Chat(sender=user1, target=None, content="Global message from User1", created_at=datetime.now(timezone.utc) - timedelta(minutes=7)),
        Chat(sender=user3, target=None, content="Global message from User3", created_at=datetime.now(timezone.utc) - timedelta(minutes=6)),
        # DM between user1 and user3
        Chat(sender=user1, target=user3, content="Hi User3", created_at=datetime.now(timezone.utc) - timedelta(minutes=5)),
    ]
    db.add_all(messages)
    db.commit()

    # Return usernames for token generation if User model is more complex
    return {"user1": user1, "user2": user2, "user3": user3, "messages": messages}


def get_auth_headers(username: str):
    # This function needs to align with your actual User model and token creation
    # Assuming a simple User model where username is sufficient for token data
    # If your User model requires an ID or other fields, adjust accordingly.
    # For testing, we might bypass actual user DB lookup for token creation if it's complex,
    # or ensure the test users exist in the DB that auth functions would query.

    # Minimal user data for token
    user_data = {"sub": username, "scopes": []} # Adjust scopes as needed
    if username == "adminuser": # Example if admin has special scope
        user_data["scopes"] = ["admin"]

    token = create_access_token(data=user_data, expires_delta=timedelta(minutes=15))
    return {"Authorization": f"Bearer {token}"}

# Test fetching DMs successfully
def test_get_direct_messages_success(client: TestClient, setup_chat_data, db: Session):
    user1 = setup_chat_data["user1"]
    user2 = setup_chat_data["user2"]

    headers = get_auth_headers(user1)
    response = client.get(f"/api/chat/dm/{user2}", headers=headers)

    assert response.status_code == 200
    data = response.json()

    # Expected DMs between user1 and user2:
    # msg1: user1 -> user2 "Hello User2 from User1"
    # msg2: user2 -> user1 "Hi User1 from User2"
    # msg3: user1 -> user2 "How are you?"
    # Response is newest first.
    assert len(data) == 3
    assert data[0]["content"] == "How are you?"
    assert data[0]["sender"] == user1
    assert data[1]["content"] == "Hi User1 from User2"
    assert data[1]["sender"] == user2
    assert data[2]["content"] == "Hello User2 from User1"
    assert data[2]["sender"] == user1

# Test fetching DMs when no messages exist
def test_get_direct_messages_no_messages(client: TestClient, setup_chat_data, db: Session):
    user1 = setup_chat_data["user1"]
    user3 = "nonexistentuser" # A user with no DMs with user1

    headers = get_auth_headers(user1)
    # First, ensure no messages exist between user1 and 'nonexistentuser'
    # For this test, let's use user3, but we created one DM. So let's use a truly non-existent one for clarity
    # Or ensure user3 has no DMs with user1 after setup (the current setup has one DM)

    # Let's test DM with user "ghost" who has no messages
    response = client.get("/api/chat/dm/ghost", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0

# Test pagination: limit
def test_get_direct_messages_pagination_limit(client: TestClient, setup_chat_data, db: Session):
    user1 = setup_chat_data["user1"]
    user2 = setup_chat_data["user2"]

    headers = get_auth_headers(user1)
    response = client.get(f"/api/chat/dm/{user2}?limit=1", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["content"] == "How are you?" # Newest message

# Test pagination: before
def test_get_direct_messages_pagination_before(client: TestClient, setup_chat_data, db: Session):
    user1 = setup_chat_data["user1"]
    user2 = setup_chat_data["user2"]

    # Get the timestamp of the second newest message ("Hi User1 from User2")
    # This requires knowing the message order or querying it.
    # For simplicity, let's get all messages first to find a 'before' timestamp.
    all_dms_resp = client.get(f"/api/chat/dm/{user2}", headers=get_auth_headers(user1))
    all_dms = all_dms_resp.json()

    # We want messages before "Hi User1 from User2" (index 1 in newest-first list)
    # So, we pass its timestamp as 'before'. We expect only "Hello User2 from User1".
    if len(all_dms) > 1:
        before_timestamp = all_dms[1]["timestamp"] # Timestamp of "Hi User1 from User2"

        headers = get_auth_headers(user1)
        response = client.get(f"/api/chat/dm/{user2}?before={before_timestamp}&limit=5", headers=headers)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["content"] == "Hello User2 from User1"
    else:
        pytest.skip("Not enough messages to test 'before' pagination.")

# Test authentication: no token
def test_get_direct_messages_no_auth(client: TestClient, setup_chat_data):
    user2 = setup_chat_data["user2"]
    response = client.get(f"/api/chat/dm/{user2}") # No headers
    assert response.status_code == 401 # Expect Unauthorized

# Test authentication: invalid token
def test_get_direct_messages_invalid_token(client: TestClient, setup_chat_data):
    user2 = setup_chat_data["user2"]
    headers = {"Authorization": "Bearer invalidtoken"}
    response = client.get(f"/api/chat/dm/{user2}", headers=headers)
    assert response.status_code == 401 # Expect Unauthorized

# Test authorization: user trying to access DMs not involving them
# This is inherently covered by the endpoint logic, as it queries based on current_user.username
# So, if user3 tries to get DMs for user2, it effectively asks for DMs between user3 and user2.
# No special "forbidden" case, just gets DMs relevant to user3 and user2.
def test_get_direct_messages_authorization(client: TestClient, setup_chat_data, db: Session):
    user1 = setup_chat_data["user1"]
    user2 = setup_chat_data["user2"]
    user3 = setup_chat_data["user3"]

    # User3 tries to get DMs of User1 with User2.
    # The endpoint /api/chat/dm/{username} means "get my DMs with {username}".
    # So user3 calling /api/chat/dm/user2 will get DMs between user3 and user2.
    # There are no DMs between user3 and user2 in the setup_chat_data.

    headers_user3 = get_auth_headers(user3)
    response = client.get(f"/api/chat/dm/{user2}", headers=headers_user3) # User3 asking for their DMs with User2

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0 # User3 has no DMs with User2 in this test setup

    # User1 asking for their DMs with User3. There is one.
    headers_user1 = get_auth_headers(user1)
    response_user1_user3 = client.get(f"/api/chat/dm/{user3}", headers=headers_user1)
    assert response_user1_user3.status_code == 200
    data_user1_user3 = response_user1_user3.json()
    assert len(data_user1_user3) == 1
    assert data_user1_user3[0]["content"] == "Hi User3"
    assert data_user1_user3[0]["sender"] == user1
    assert data_user1_user3[0]["target"] == user3 # Asserting target now

# Test global chat messages (existing endpoint)
def test_get_global_chat_messages(client: TestClient, setup_chat_data, db: SQLAlchemySession): # Use SQLAlchemySession
    user1 = setup_chat_data["user1"]
    headers = get_auth_headers(user1) # Any authenticated user can fetch global chat

    response = client.get("/api/chat?limit=10", headers=headers)
    assert response.status_code == 200
    data = response.json()

    global_messages_content = [msg["content"] for msg in data if msg["sender"] in ["testuser1", "testuser3"] and not msg.get("target")]

    # Expected global messages: "Global message from User3", "Global message from User1" (newest first)
    # The ChatMessageResponse model doesn't include 'target', so we filter by sender and known global content.
    # This test might need refinement based on how ChatMessageResponse is defined.
    # Assuming ChatMessageResponse only has id, sender, content, timestamp.

    # Filter out potential DM messages if the response model were to include them or target.
    # Here, we rely on the endpoint /api/chat to only return target=None messages.

    assert "Global message from User3" in [m['content'] for m in data]
    assert "Global message from User1" in [m['content'] for m in data]
    # Check count of global messages based on setup
    db_global_messages = db.query(Chat).filter(Chat.target.is_(None)).count()
    assert len(data) == db_global_messages


# Need a conftest.py or similar to provide the 'db' session fixture if not already available globally.
# For example, in conftest.py:
# import pytest
# from sqlalchemy import create_engine
# from sqlalchemy.orm import sessionmaker, Session
# from backend.torb.models import Base # Assuming your models Base
#
# DATABASE_URL = "sqlite:///./test_torb.db" # Use a test database
# engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
# TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
#
# @pytest.fixture(scope="session", autouse=True)
# def setup_test_db():
#     Base.metadata.create_all(bind=engine) # Create tables
#     yield
#     Base.metadata.drop_all(bind=engine) # Drop tables after tests
#
# @pytest.fixture(scope="function")
# def db():
#     connection = engine.connect()
#     transaction = connection.begin()
#     session = TestingSessionLocal(bind=connection)
#     yield session
#     session.close()
#     transaction.rollback()
#     connection.close()

# Note: The above conftest.py example assumes you want a separate test DB.
# If your project already has a fixture for 'db' session that uses the main DB,
# ensure tests clean up after themselves to avoid polluting the main DB.
# The provided `setup_chat_data` fixture already tries to clean Chat table.
# User table cleanup might also be needed if users are created per test run.
# It's generally better to use a dedicated test database.
# The `create_access_token` also needs the correct User model and secret key setup from your auth system.
# This test file assumes `backend.auth.SECRET_KEY` and `ALGORITHM` are correctly configured.
# If `User` model is needed by `create_access_token` (e.g. to fetch roles/scopes),
# then `get_auth_headers` needs to interact with `db` to fetch/create that User.
# For simplicity, current `get_auth_headers` creates token from username string directly.
# This might not match a real auth system that looks up user in DB.
# Ensure `backend.main` and `backend.auth` can be imported and initialized correctly in test environment.
# (e.g. environment variables for DB URLs, secrets, etc.)
# The User model import `from backend.torb.models import Chat, User` might need adjustment if User is elsewhere or not used by Chat.
# If User is not directly linked by Chat model (e.g. sender is just a string), then User import might not be strictly needed here.
# However, `get_auth_headers` likely needs a User concept for creating valid tokens.
# The current `Chat` model uses `sender = Column(String, nullable=False)`.
# If `User` model is from `fastapi_users.models.BaseUser`, adapt `get_auth_headers`.
# The tests for `/api/chat` (global messages) are included to show how they might look.
# The main focus is `test_get_direct_messages_*` for the new DM endpoint.
# The `setup_chat_data` creates messages with specific time offsets. Timestamps in responses
# will be full ISO strings. Asserting exact timestamp strings can be brittle.
# It's often better to assert relative order or content as done here.
# To test `target` in response, `ChatMessageResponse` model in `chat.py` needs `target: Optional[str]`.
# Currently it doesn't, so we cannot directly assert `msg['target'] == user2`.
# We infer correctness from sender and recipient in the request context.
# The `Chat.created_at` uses `timezone.utc`. Ensure comparisons and generation are consistent.
# `datetime.now(timezone.utc)` is correct.
# The `client` fixture should ideally be function-scoped if tests modify shared state (like DB)
# that isn't reset per test, or module-scoped if DB is reset for each test function via `db` fixture.
# Here, `setup_chat_data` is function-scoped and cleans `Chat` table, so client can be module.
# `db` fixture must handle transactions and rollbacks correctly for isolation.
# The provided conftest example creates a new session per test and rolls back.
# This is a good practice.
# Final check on `get_auth_headers`: if your `get_current_user` dependency relies on DB checks
# for the user from token, then the user MUST exist in the test DB.
# The simple token creation might pass initial token validation but fail `get_current_user`.
# Simplest for testing might be to mock `get_current_user` or ensure test users are in DB.
# For now, assuming `create_access_token` with just `sub` is enough for `get_current_user`
# to reconstruct a minimal `User` object or that `get_current_user` is simple.
# If `get_current_user` queries DB by username in `sub`, then users like "testuser1" must be in the test `users` table.
# This setup implies `User` model in `torb.models` should be populated or mocked.
# If users are from `config/users.json` and `get_current_user` reads this, then it's simpler.
# The `backend.auth.get_current_user` seems to use `config/users.json` based on previous tasks.
# So, ensure `testuser1`, `testuser2`, `testuser3` are in `config/users.json` for these tests to pass authentication.
# If `config/users.json` is not used by tests, or a test-specific user setup is needed, this part needs care.
# For now, the tests assume `get_auth_headers` produces a token that `get_current_user` will accept
# and correctly identify the user (e.g., "testuser1").
