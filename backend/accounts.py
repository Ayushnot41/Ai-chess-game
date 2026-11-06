"""Username accounts, opaque cookie sessions, and one private saved match."""
import hashlib
import hmac
import json
import os
import secrets
import time
from threading import BoundedSemaphore
from typing import Literal

import chess
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, SecretStr, field_validator
from sqlalchemy import and_, delete, select
from sqlalchemy.exc import IntegrityError

from backend.database import get_engine, insert_for, rate_limits, saved_games, sessions, users

router = APIRouter(prefix="/api", tags=["Accounts"])
COOKIE = "chess_session"
SESSION_SECONDS = 7 * 24 * 3600
hash_slots = BoundedSemaphore(2)


def secure_cookie():
    return os.getenv("COOKIE_SECURE", "true" if os.getenv("APP_ENV") == "production" else "false").lower() == "true"


def csrf_guard(request: Request):
    if request.headers.get("x-chess-client") != "1":
        raise HTTPException(403, "Please submit this request from the chess application.")
    origin = request.headers.get("origin")
    if origin:
        expected = os.getenv("PUBLIC_ORIGIN", "").rstrip("/")
        if expected:
            if origin.rstrip("/") != expected:
                raise HTTPException(403, "This request came from another website.")
        else:
            host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
            origin_host = origin.split("://")[-1].rstrip("/")
            base_host = str(request.base_url).split("://")[-1].rstrip("/")
            if host and origin_host != host and origin_host != base_host:
                raise HTTPException(403, "This request came from another website.")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "Cross-site requests are not allowed.")


def hashing_capacity():
    if not hash_slots.acquire(blocking=False):
        raise HTTPException(503, "Sign-in is busy. Try again shortly.", headers={"Retry-After": "2"})
    try:
        yield
    finally:
        hash_slots.release()


def password_hash(password: str, salt: bytes | None = None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=32768, r=8, p=3, maxmem=64*1024*1024, dklen=32)
    return f"scrypt$32768$8$3${salt.hex()}${digest.hex()}"


def password_matches(password: str, encoded: str):
    try:
        algorithm, n, r, p, salt, _ = encoded.split("$")
        if (algorithm, n, r, p) != ("scrypt", "32768", "8", "3"):
            return False
        return hmac.compare_digest(password_hash(password, bytes.fromhex(salt)), encoded)
    except (ValueError, TypeError):
        return False


def token_digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


def limit_attempts(request: Request, username: str, action: str):
    now = int(time.time())
    window = now // 900
    ip = request.client.host if request.client else "unknown"
    # Uvicorn resolves proxy client addresses only from its trusted proxy list.
    rules = [(f"{action}:ip:{ip}", 30), (f"{action}:user:{username}", 10)]
    limited = False
    with get_engine().begin() as connection:
        connection.execute(delete(rate_limits).where(rate_limits.c.window < window - 1))
        for identity, maximum in rules:
            key = token_digest(identity)
            statement = insert_for(connection, rate_limits).values(key=key, window=window, attempts=1)
            statement = statement.on_conflict_do_update(index_elements=["key", "window"],
                set_={"attempts": rate_limits.c.attempts + 1}, where=rate_limits.c.attempts < maximum)
            if connection.execute(statement).rowcount == 0:
                limited = True
    if limited:
        raise HTTPException(429, "Too many attempts. Please try again in 15 minutes.", headers={"Retry-After": str(900-now%900)})


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=24, pattern=r"^[a-zA-Z0-9_]+$")
    password: SecretStr

    @field_validator("username")
    @classmethod
    def normalize(cls, value):
        return value.lower()

    @field_validator("password")
    @classmethod
    def password_length(cls, value):
        if not 12 <= len(value.get_secret_value()) <= 128:
            raise ValueError("Use a password between 12 and 128 characters.")
        return value


def new_session(connection, response, user_id, old_token=None):
    now = int(time.time())
    connection.execute(delete(sessions).where(sessions.c.expires_at <= now))
    if old_token:
        connection.execute(delete(sessions).where(sessions.c.token_hash == token_digest(old_token)))
    token = secrets.token_urlsafe(32)
    connection.execute(sessions.insert().values(token_hash=token_digest(token), user_id=user_id, expires_at=now+SESSION_SECONDS))
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=secure_cookie(), samesite="lax", path="/api")
    response.headers["Cache-Control"] = "no-store"


def current_user(request: Request):
    token = request.cookies.get(COOKIE, "")
    if not 32 <= len(token) <= 128:
        raise HTTPException(401, "Sign in to access your account.")
    with get_engine().connect() as connection:
        user = connection.execute(select(users.c.id, users.c.username).join(sessions).where(and_(
            sessions.c.token_hash == token_digest(token), sessions.c.expires_at > int(time.time())))).mappings().first()
    if not user:
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    return dict(user)


@router.post("/auth/register", status_code=201, dependencies=[Depends(csrf_guard), Depends(hashing_capacity)])
def register(body: Credentials, request: Request, response: Response):
    limit_attempts(request, body.username, "register")
    encoded = password_hash(body.password.get_secret_value())
    user_id = secrets.token_hex(16)
    try:
        with get_engine().begin() as connection:
            connection.execute(users.insert().values(id=user_id, username=body.username, password_hash=encoded, created_at=int(time.time())))
            new_session(connection, response, user_id, request.cookies.get(COOKIE))
    except IntegrityError as error:
        raise HTTPException(409, "That username is unavailable. Choose another.") from error
    return {"user": {"username": body.username}}


@router.post("/auth/login", dependencies=[Depends(csrf_guard), Depends(hashing_capacity)])
def login(body: Credentials, request: Request, response: Response):
    limit_attempts(request, body.username, "login")
    with get_engine().connect() as connection:
        user = connection.execute(select(users).where(users.c.username == body.username)).mappings().first()
    if user:
        valid = password_matches(body.password.get_secret_value(), user["password_hash"])
    else:
        password_hash(body.password.get_secret_value(), b"missing-user-pad")
        valid = False
    if not valid:
        raise HTTPException(401, "Username or password is incorrect.")
    with get_engine().begin() as connection:
        new_session(connection, response, user["id"], request.cookies.get(COOKIE))
    return {"user": {"username": user["username"]}}


class GoogleCredential(BaseModel):
    credential: str = Field(min_length=16, max_length=4096)


@router.get("/auth/config")
def auth_config():
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    return {
        "google_enabled": bool(client_id),
        "google_client_id": client_id,
    }


@router.post("/auth/google", dependencies=[Depends(csrf_guard)])
def google_auth(body: GoogleCredential, request: Request, response: Response):
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    import httpx
    try:
        res = httpx.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": body.credential},
            timeout=8.0,
        )
    except Exception as e:
        raise HTTPException(502, "Failed to contact Google identity servers.") from e

    if res.status_code != 200:
        raise HTTPException(401, "Invalid or expired Google token.")

    data = res.json()
    if client_id and data.get("aud") != client_id and data.get("azp") != client_id:
        raise HTTPException(401, "Google token audience mismatch.")

    sub = data.get("sub")
    if not sub:
        raise HTTPException(401, "Invalid Google profile.")

    user_id = f"g_{sub[:28]}"
    raw_name = data.get("name") or data.get("email", "").split("@")[0] or "player"
    import re
    clean_name = re.sub(r"[^a-zA-Z0-9_]", "", raw_name)[:18] or "google_user"

    with get_engine().begin() as connection:
        existing = connection.execute(select(users).where(users.c.id == user_id)).mappings().first()
        if existing:
            username = existing["username"]
        else:
            candidate_username = clean_name
            while connection.execute(select(users).where(users.c.username == candidate_username)).mappings().first():
                candidate_username = f"{clean_name[:16]}_{secrets.token_hex(2)}"
            username = candidate_username
            connection.execute(users.insert().values(
                id=user_id,
                username=username,
                password_hash="oauth:google",
                created_at=int(time.time()),
            ))
        new_session(connection, response, user_id, request.cookies.get(COOKIE))

    return {
        "user": {
            "username": username,
            "name": data.get("name", username),
            "email": data.get("email", ""),
            "picture": data.get("picture", ""),
            "provider": "google",
        }
    }


@router.get("/auth/google/callback")
def google_callback(request: Request):
    from fastapi.responses import RedirectResponse
    code = request.query_params.get("code")
    if not code:
        error = request.query_params.get("error", "Access denied by Google.")
        return RedirectResponse(url=f"/?auth_error={error}", status_code=303)

    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    base_url = str(request.base_url).rstrip("/")
    redirect_uri = f"{base_url}/api/auth/google/callback"

    import httpx
    try:
        token_res = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10.0,
        )
    except Exception as e:
        return RedirectResponse(url="/?auth_error=google_connection_failed", status_code=303)

    if token_res.status_code != 200:
        return RedirectResponse(url="/?auth_error=token_exchange_failed", status_code=303)

    token_data = token_res.json()
    id_token = token_data.get("id_token")
    if not id_token:
        return RedirectResponse(url="/?auth_error=missing_id_token", status_code=303)

    try:
        info_res = httpx.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": id_token}, timeout=8.0)
    except Exception:
        return RedirectResponse(url="/?auth_error=google_tokeninfo_failed", status_code=303)

    if info_res.status_code != 200:
        return RedirectResponse(url="/?auth_error=invalid_token", status_code=303)

    data = info_res.json()
    sub = data.get("sub")
    if not sub:
        return RedirectResponse(url="/?auth_error=invalid_profile", status_code=303)

    user_id = f"g_{sub[:28]}"
    raw_name = data.get("name") or data.get("email", "").split("@")[0] or "player"
    import re
    clean_name = re.sub(r"[^a-zA-Z0-9_]", "", raw_name)[:18] or "google_user"

    response = RedirectResponse(url="/?signed_in=google", status_code=303)
    with get_engine().begin() as connection:
        existing = connection.execute(select(users).where(users.c.id == user_id)).mappings().first()
        if existing:
            username = existing["username"]
        else:
            candidate_username = clean_name
            while connection.execute(select(users).where(users.c.username == candidate_username)).mappings().first():
                candidate_username = f"{clean_name[:16]}_{secrets.token_hex(2)}"
            username = candidate_username
            connection.execute(users.insert().values(
                id=user_id,
                username=username,
                password_hash="oauth:google",
                created_at=int(time.time()),
            ))
        new_session(connection, response, user_id, request.cookies.get(COOKIE))

    return response


@router.get("/auth/me")
def me(user=Depends(current_user)):
    return {"user": {"username": user["username"]}}


@router.post("/auth/logout", dependencies=[Depends(csrf_guard)])
def logout(request: Request, response: Response):
    with get_engine().begin() as connection:
        connection.execute(delete(sessions).where(sessions.c.token_hash == token_digest(request.cookies.get(COOKIE, ""))))
    response.delete_cookie(COOKIE, path="/api", secure=secure_cookie(), httponly=True, samesite="lax")
    return {"ok": True}


class SaveGame(BaseModel):
    version: Literal[1] = 1
    initialFen: str = Field(max_length=120)
    moves: list[str] = Field(max_length=1000)
    playerColor: Literal["white", "black"]
    aiDepth: Literal[1, 2, 3, 4, 5]
    kidMode: bool = True
    theme: Literal["wood", "marble", "cyberpunk", "gold"] = "wood"
    expected_revision: str | None = Field(default=None, max_length=32)


@router.get("/account/game")
def get_game(user=Depends(current_user)):
    with get_engine().connect() as connection:
        row = connection.execute(select(saved_games).where(saved_games.c.user_id == user["id"])).mappings().first()
    return {"game": json.loads(row["payload"]) if row else None, "revision": row["revision"] if row else None}


@router.put("/account/game", dependencies=[Depends(csrf_guard)])
def save_game(body: SaveGame, user=Depends(current_user)):
    try:
        board = chess.Board(body.initialFen)
        if not board.is_valid():
            raise ValueError("Invalid initial position")
        for uci in body.moves:
            if len(uci) not in (4, 5) or board.is_game_over() or board.is_fifty_moves() or board.is_repetition(3):
                raise ValueError("Invalid move history")
            move = chess.Move.from_uci(uci)
            if move not in board.legal_moves:
                raise ValueError("Illegal move")
            board.push(move)
    except ValueError as error:
        raise HTTPException(400, "This game contains an invalid position or move.") from error
    revision = secrets.token_hex(16)
    payload = json.dumps(body.model_dump(exclude={"expected_revision"}), separators=(",", ":"))
    with get_engine().begin() as connection:
        values = dict(user_id=user["id"], payload=payload, revision=revision, updated_at=int(time.time()))
        if body.expected_revision is None:
            result = connection.execute(insert_for(connection, saved_games).values(**values).on_conflict_do_nothing(index_elements=["user_id"]))
        else:
            result = connection.execute(saved_games.update().where(and_(saved_games.c.user_id == user["id"],
                saved_games.c.revision == body.expected_revision)).values(payload=payload, revision=revision, updated_at=values["updated_at"]))
        if result.rowcount == 0:
            raise HTTPException(409, "Your cloud game changed on another device. Load it before saving again.")
    return {"revision": revision, "saved": True}
