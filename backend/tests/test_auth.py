import asyncio
import json
import os
import shutil # For file operations
import pytest
import httpx
from fastapi.testclient import TestClient # Using TestClient for consistency, can switch to httpx.AsyncClient if preferred for async nature later

# Import the app instance from backend.main
from backend.main import app
# Import auth functions for test setup/manipulation
from backend.auth import USERS_FILE, load_users, save_users, _users_cache, _users_mtime # Import cache variables for manipulation

# Original content of users.json for restoration
ORIGINAL_USERS_CONTENT = [
  {
    "username": "fabiomigueldp",
    "password": "abc1d2aa",
    "is_admin": true
  },
  {
    "username": "demo",
    "password": "demo",
    "is_admin": false
  }
]

# Fixture to manage config/users.json and auth module's cache
@pytest.fixture(autouse=True)
async def manage_users_file_and_cache():
    global _users_cache, _users_mtime
    # Ensure config directory exists
    os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)

    # Backup original file if it exists
    original_file_existed = os.path.exists(USERS_FILE)
    if original_file_existed:
        backup_file = USERS_FILE + ".bak"
        shutil.copy(USERS_FILE, backup_file)

    # Write predefined original content for a clean slate before each test
    save_users(ORIGINAL_USERS_CONTENT)

    # Reset cache in auth.py before each test
    _users_cache = None
    _users_mtime = 0
    load_users() # Pre-load users for the test

    yield # Test runs here

    # Restore original file content
    save_users(ORIGINAL_USERS_CONTENT) # Save original content back
    _users_cache = None # Clear cache again
    _users_mtime = 0

    # If a backup was made, restore it. Otherwise, remove the test file.
    if original_file_existed and os.path.exists(backup_file): # Check if backup_file exists
        shutil.move(backup_file, USERS_FILE) # Restore backup
    elif not original_file_existed and os.path.exists(USERS_FILE): # If file was created by test
        # os.remove(USERS_FILE) # Or save original content back
        pass # Already saved original content

    # Clean up cache again after test
    _users_cache = None
    _users_mtime = 0


@pytest.mark.asyncio
async def test_login_success():
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/login", json={"username": "fabiomigueldp", "password": "abc1d2aa"})
        assert response.status_code == 200
        assert "sid" in response.cookies
        assert response.json() == {"message": "Login successful"}

@pytest.mark.asyncio
async def test_login_failure_wrong_password():
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/login", json={"username": "fabiomigueldp", "password": "wrongpassword"})
        assert response.status_code == 401
        assert "sid" not in response.cookies

@pytest.mark.asyncio
async def test_login_failure_wrong_username():
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/login", json={"username": "nonexistentuser", "password": "password"})
        assert response.status_code == 401
        assert "sid" not in response.cookies

@pytest.mark.asyncio
async def test_get_me_authenticated():
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        # Log in first
        login_response = await client.post("/api/login", json={"username": "fabiomigueldp", "password": "abc1d2aa"})
        assert login_response.status_code == 200
        sid_cookie = login_response.cookies.get("sid")
        assert sid_cookie is not None

        # Make request to /api/me with the session cookie
        me_response = await client.get("/api/me", cookies={"sid": sid_cookie})
        assert me_response.status_code == 200
        user_data = me_response.json()
        assert user_data["username"] == "fabiomigueldp"
        assert user_data["is_admin"] is True

@pytest.mark.asyncio
async def test_get_me_unauthenticated_no_cookie(): # AC-1
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/me")
        assert response.status_code == 401

@pytest.mark.asyncio
async def test_logout():
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        # Log in first
        login_response = await client.post("/api/login", json={"username": "demo", "password": "demo"})
        assert login_response.status_code == 200
        sid_cookie = login_response.cookies.get("sid")
        assert sid_cookie is not None

        # Logout
        logout_response = await client.post("/api/logout", cookies={"sid": sid_cookie})
        assert logout_response.status_code == 200

        # Check if cookie is cleared
        # httpx doesn't directly expose 'max-age' or 'expires' of set-cookie headers from response.
        # We check if the 'sid' cookie is effectively gone or set to empty with expiry.
        # A common way to clear a cookie is to set its value to empty and max-age to 0.
        assert "sid" in logout_response.cookies
        # Depending on server implementation, it might set sid="" and Max-Age=0, or just remove it.
        # FastAPI's response.delete_cookie sets Max-Age=0 and path=/ and an empty value.
        # httpx.Cookies is a dict-like object. If the cookie "sid" is in logout_response.cookies,
        # it means a "Set-Cookie" header for "sid" was present.
        # We need to inspect the actual Set-Cookie header if possible or rely on subsequent request behavior.
        # For simplicity, we'll check that a Set-Cookie for 'sid' is present,
        # as FastAPI's delete_cookie sends one.
        # The crucial test is test_get_me_after_logout.

@pytest.mark.asyncio
async def test_get_me_after_logout():
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        # Log in first
        login_response = await client.post("/api/login", json={"username": "demo", "password": "demo"})
        assert login_response.status_code == 200
        sid_cookie = login_response.cookies.get("sid")
        assert sid_cookie is not None

        # Logout
        await client.post("/api/logout", cookies={"sid": sid_cookie})

        # Attempt to access /api/me
        # The cookie 'sid' might still be sent by the client if not properly handled by httpx's cookie jar
        # after a "Set-Cookie" with Max-Age=0.
        # However, server should invalidate the session.
        # To be sure, we can send the original cookie or no cookie.
        # If the cookie was properly cleared by the browser (or client), it wouldn't be sent.
        # httpx's client.cookies should reflect the cleared cookie if the server sent proper headers.

        # Option 1: Use the client's cookie jar, which should have processed the Set-Cookie from logout
        me_response_after_logout = await client.get("/api/me")
        assert me_response_after_logout.status_code == 401

        # Option 2: Explicitly send the old cookie (which should now be invalid on the server)
        # me_response_after_logout_with_old_cookie = await client.get("/api/me", cookies={"sid": sid_cookie})
        # assert me_response_after_logout_with_old_cookie.status_code == 401


@pytest.mark.asyncio
async def test_users_json_persistence(): # AC-2
    global _users_cache, _users_mtime # To manually reset cache for this test

    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        # 1. Define new user data
        new_user_data = {"username": "newuser", "password": "newpassword", "is_admin": False}

        # 2. Read current users and add the new one
        current_users = load_users() # Should be ORIGINAL_USERS_CONTENT due to fixture
        updated_users = current_users + [new_user_data]

        # 3. Call save_users with the combined user data
        save_users(updated_users)

        # 4. Reset the cache in auth.py to force a re-read from users.json
        _users_cache = None
        _users_mtime = 0
        # load_users() # This will be called by the login endpoint implicitly

        # 5. Attempt to log in as the new user
        response = await client.post("/api/login", json={"username": "newuser", "password": "newpassword"})
        assert response.status_code == 200
        assert "sid" in response.cookies
        assert response.json() == {"message": "Login successful"}

        # 6. Verify /api/me for the new user
        sid_cookie = response.cookies.get("sid")
        me_response = await client.get("/api/me", cookies={"sid": sid_cookie})
        assert me_response.status_code == 200
        user_data = me_response.json()
        assert user_data["username"] == "newuser"
        assert user_data["is_admin"] is False

        # The fixture `manage_users_file_and_cache` will handle restoring users.json
        # and clearing cache after the test.
