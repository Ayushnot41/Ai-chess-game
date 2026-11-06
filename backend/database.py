"""Small relational store: SQLite locally, PostgreSQL for persistent hosting."""
import os
from functools import lru_cache
from pathlib import Path

from sqlalchemy import (Column, ForeignKey, Integer, MetaData, String, Table,
                        Text, create_engine, event)
from sqlalchemy.engine import make_url

metadata = MetaData()
users = Table("users", metadata,
    Column("id", String(32), primary_key=True),
    Column("username", String(24), unique=True, nullable=False),
    Column("password_hash", String(256), nullable=False),
    Column("created_at", Integer, nullable=False))
sessions = Table("sessions", metadata,
    Column("token_hash", String(64), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("expires_at", Integer, nullable=False, index=True))
saved_games = Table("saved_games", metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("payload", Text, nullable=False),
    Column("revision", String(32), nullable=False),
    Column("updated_at", Integer, nullable=False))
rate_limits = Table("rate_limits", metadata,
    Column("key", String(64), primary_key=True),
    Column("window", Integer, primary_key=True),
    Column("attempts", Integer, nullable=False))


@lru_cache(maxsize=1)
def get_engine():
    raw = os.getenv("DATABASE_URL", "")
    production = os.getenv("APP_ENV", "development") == "production"
    if production and not raw:
        raise RuntimeError("DATABASE_URL is required in production. Use persistent PostgreSQL.")
    if not raw:
        if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
            import tempfile
            path = Path(tempfile.gettempdir()) / "chess.db"
        else:
            path = Path(__file__).resolve().parent.parent / "data" / "chess.db"
            path.parent.mkdir(exist_ok=True)
        raw = f"sqlite:///{path.as_posix()}"
    if raw.startswith("postgres://"):
        raw = raw.replace("postgres://", "postgresql+psycopg://", 1)
    elif raw.startswith("postgresql://"):
        raw = raw.replace("postgresql://", "postgresql+psycopg://", 1)
    url = make_url(raw)
    if url.get_backend_name() not in ("sqlite", "postgresql"):
        raise RuntimeError("Use SQLite locally or PostgreSQL in production.")
    if production and (url.get_backend_name() != "postgresql" or os.getenv("COOKIE_SECURE", "true").lower() != "true"):
        raise RuntimeError("Production requires PostgreSQL and secure cookies.")
    options = {"pool_pre_ping": True, "hide_parameters": True}
    if url.get_backend_name() == "sqlite":
        options["connect_args"] = {"check_same_thread": False, "timeout": 15}
    else:
        options.update(pool_size=3, max_overflow=2, pool_recycle=300)
        options["connect_args"] = {"connect_timeout": 10}
    engine = create_engine(url, **options)
    if url.get_backend_name() == "sqlite":
        @event.listens_for(engine, "connect")
        def configure_sqlite(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA journal_mode=WAL")
    metadata.create_all(engine)
    return engine


def insert_for(connection, table):
    if connection.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    return insert(table)
