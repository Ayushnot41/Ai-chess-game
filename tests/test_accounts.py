"""Account isolation, session security, persistence and game-conflict checks."""
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.database import get_engine, sessions, users
from backend.server import app
from backend.accounts import COOKIE

HEADERS = {"X-Chess-Client":"1", "Origin":"http://testserver"}
PASSWORD = "a test-only long passphrase"


@pytest.fixture
def account_client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'accounts.db').as_posix()}")
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.delenv("PUBLIC_ORIGIN", raising=False)
    get_engine.cache_clear()
    with TestClient(app, headers=HEADERS) as client:
        yield client
    get_engine().dispose()
    get_engine.cache_clear()


def register(client, username="student_one"):
    return client.post("/api/auth/register", json={"username":username,"password":PASSWORD})


def game(**updates):
    import chess
    return {"version":1,"initialFen":chess.STARTING_FEN,"moves":["e2e4"],"playerColor":"white", "aiDepth":1,"kidMode":True,"theme":"wood", **updates}


def test_registration_hashes_password_and_uses_opaque_http_only_cookie(account_client):
    response=register(account_client)
    assert response.status_code == 201
    cookie=response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/api" in cookie
    assert account_client.get("/api/auth/me").json()["user"]["username"] == "student_one"
    with get_engine().connect() as connection:
        encoded=connection.execute(select(users.c.password_hash)).scalar_one()
        token=connection.execute(select(sessions.c.token_hash)).scalar_one()
    assert encoded.startswith("scrypt$32768$8$3$") and PASSWORD not in encoded
    assert token != account_client.cookies.get(COOKIE)
    assert response.headers["cache-control"] == "no-store"


def test_duplicate_normalization_and_invalid_credentials(account_client):
    assert register(account_client,"Student_One").status_code == 201
    assert register(account_client,"student_one").status_code == 409
    assert account_client.post("/api/auth/login",json={"username":"student_one","password":"wrong-password-long"}).status_code == 401
    response=account_client.post("/api/auth/register",json={"username":"bad!", "password":"short"})
    assert response.status_code == 422 and '"input"' not in response.text


def test_logout_invalidates_session_and_login_rotates_token(account_client):
    register(account_client)
    original=account_client.cookies.get(COOKIE)
    assert account_client.post("/api/auth/logout").status_code == 200
    assert account_client.get("/api/auth/me").status_code == 401
    assert account_client.post("/api/auth/login", json={"username":"student_one","password":PASSWORD}).status_code == 200
    assert account_client.cookies.get(COOKIE) != original
    assert account_client.get("/api/auth/me",headers={"Cookie":f"{COOKIE}={original}"}).status_code == 401


def test_csrf_and_untrusted_origins_are_blocked(account_client):
    assert register(account_client).status_code == 201
    assert account_client.post("/api/auth/logout",headers={"X-Chess-Client":""}).status_code == 403
    assert account_client.post("/api/auth/logout",headers={"Origin":"https://attacker.example"}).status_code == 403
    assert account_client.post("/api/auth/logout",headers={"Sec-Fetch-Site":"cross-site"}).status_code == 403


def test_saved_games_are_private_and_conflicts_do_not_overwrite(account_client):
    assert account_client.get("/api/account/game").status_code == 401
    register(account_client)
    first=account_client.put("/api/account/game",json=game())
    assert first.status_code == 200
    revision=first.json()["revision"]
    assert account_client.put("/api/account/game",json=game()).status_code == 409
    assert account_client.put("/api/account/game",json=game(expected_revision=revision,moves=["e2e4","e7e5"])).status_code == 200
    assert account_client.put("/api/account/game",json=game(expected_revision=revision)).status_code == 409
    account_client.post("/api/auth/logout")
    register(account_client,"student_two")
    assert account_client.get("/api/account/game").json()["game"] is None
    account_client.post("/api/auth/logout")
    account_client.post("/api/auth/login",json={"username":"student_one","password":PASSWORD})
    assert account_client.get("/api/account/game").json()["game"]["moves"] == ["e2e4","e7e5"]


def test_invalid_games_rejected_and_expired_cookie_rejected(account_client):
    register(account_client)
    assert account_client.put("/api/account/game",json=game(moves=["e2e5"])).status_code == 400
    assert account_client.put("/api/account/game",json=game(initialFen="invalid")).status_code == 400
    with get_engine().begin() as connection:
        connection.execute(sessions.update().values(expires_at=int(time.time())-1))
    assert account_client.get("/api/auth/me").status_code == 401


def test_login_throttling(account_client):
    for _ in range(10):
        assert account_client.post("/api/auth/login",json={"username":"missing_user","password":PASSWORD}).status_code == 401
    response=account_client.post("/api/auth/login",json={"username":"missing_user","password":PASSWORD})
    assert response.status_code == 429 and "retry-after" in response.headers


def test_production_fails_without_persistent_database(monkeypatch):
    monkeypatch.setenv("APP_ENV","production")
    monkeypatch.delenv("DATABASE_URL",raising=False)
    get_engine.cache_clear()
    with pytest.raises(RuntimeError,match="DATABASE_URL"):
        get_engine()


def test_secure_cookie_flag(account_client, monkeypatch):
    monkeypatch.setenv("COOKIE_SECURE","true")
    assert "Secure" in register(account_client).headers["set-cookie"]
