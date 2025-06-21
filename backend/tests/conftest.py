import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session as SQLAlchemySession
from fastapi.testclient import TestClient
import os # For environment variables if needed, though direct patching is used here

from backend.main import app
from backend.torb.models import Base

# --- Database Setup ---
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False}  # Needed for SQLite in-memory
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def apply_db_url_overrides(monkeypatch: pytest.MonkeyPatch):
    """Applies DATABASE_URL overrides to relevant modules."""
    monkeypatch.setattr("backend.routes.chat.DATABASE_URL", SQLALCHEMY_TEST_DATABASE_URL)
    monkeypatch.setattr("backend.ws.DATABASE_URL", SQLALCHEMY_TEST_DATABASE_URL)

    # After patching DATABASE_URL, SessionLocal in those modules must be re-initialized
    # This assumes SessionLocal is defined at the module level in chat.py and ws.py
    from backend.routes import chat as chat_route
    from backend import ws as ws_module

    chat_route.engine = create_engine(SQLALCHEMY_TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    chat_route.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=chat_route.engine)

    ws_module.engine = create_engine(SQLALCHEMY_TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    ws_module.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=ws_module.engine)

@pytest.fixture(scope="session", autouse=True)
def test_db_session_override(monkeypatch_session_scope: pytest.MonkeyPatch):
    """
    Session-scoped fixture to:
    1. Override DATABASE_URL in necessary modules.
    2. Create all database tables.
    3. Yield for the test session.
    4. Drop all database tables after the session.
    """
    apply_db_url_overrides(monkeypatch_session_scope)

    Base.metadata.create_all(bind=engine) # Create tables using the test engine
    yield
    Base.metadata.drop_all(bind=engine) # Drop tables

@pytest.fixture(scope="session")
def monkeypatch_session_scope():
    """Provides a session-scoped monkeypatch object."""
    with pytest.MonkeyPatch.context() as mp:
        yield mp

@pytest.fixture(scope="function")
def db() -> SQLAlchemySession:
    """
    Provides a transactional database session for each test function.
    Rolls back the transaction after the test to ensure isolation.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="module")
def client() -> TestClient:
    """
    Provides a TestClient for the FastAPI application.
    The app will use the overridden (test) database due to `test_db_session_override`.
    """
    # If your app uses Depends(get_db) for session management in routes,
    # you might need to override that dependency here for the TestClient.
    # Example:
    # def override_get_db():
    #     try:
    #         db_session = TestingSessionLocal()
    #         yield db_session
    #     finally:
    #         db_session.close()
    # app.dependency_overrides[get_original_db_dependency] = override_get_db
    # For now, the direct patching of DATABASE_URL and re-init of SessionLocal
    # in the modules themselves is the approach taken.
    return TestClient(app)
