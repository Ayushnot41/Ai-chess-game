"""
Vercel Serverless Function entrypoint for Grandmaster-AI.
Exposes the FastAPI application directly for unified single-link deployment,
with automatic path normalization for all Vercel serverless routing modes.
"""

import os
import sys
from pathlib import Path
from urllib.parse import parse_qs

# Add project root and local directories to Python path
ROOT_DIR = Path(__file__).resolve().parent.parent
API_DIR = Path(__file__).resolve().parent
CWD = Path.cwd()

for p in [ROOT_DIR, API_DIR, CWD, CWD / "api"]:
    s = str(p)
    if s not in sys.path:
        sys.path.insert(0, s)

from backend.server import app as fastapi_app


class VercelPathMiddleware:
    """Ensures all API requests map correctly regardless of Vercel rewrite syntax."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            raw_query = scope.get("query_string", b"")
            headers = dict(scope.get("headers", []))
            matched_path = headers.get(b"x-matched-path", b"").decode("utf-8", "ignore")
            forwarded_uri = headers.get(b"x-forwarded-uri", b"").decode("utf-8", "ignore") or headers.get(b"x-original-uri", b"").decode("utf-8", "ignore")

            target_path = path

            # 1. Parse __route__ parameter if injected by Vercel routes dest: /api/index.py?__route__=$1
            if b"__route__=" in raw_query:
                try:
                    qs = parse_qs(raw_query.decode("utf-8", "ignore"))
                    route = qs.get("__route__", [""])[0].strip("/")
                    if route:
                        target_path = f"/api/{route}"
                    # Remove __route__ from query string so endpoints receive clean params
                    clean_pairs = [p for p in raw_query.split(b"&") if not p.startswith(b"__route__=")]
                    scope["query_string"] = b"&".join(clean_pairs)
                except Exception:
                    pass
            elif forwarded_uri and forwarded_uri.startswith("/api"):
                target_path = forwarded_uri.split("?")[0]
            elif matched_path and matched_path.startswith("/api") and not matched_path.endswith("index.py"):
                target_path = matched_path.split("?")[0]
            elif path.startswith("/api") and not path.startswith("/api/index.py"):
                target_path = path
            elif path.startswith("/api/index.py"):
                remainder = path[len("/api/index.py"):].lstrip("/")
                target_path = f"/api/{remainder}" if remainder else "/api/status"
            elif path.startswith("/index.py"):
                remainder = path[len("/index.py"):].lstrip("/")
                target_path = f"/api/{remainder}" if remainder else "/api/status"
            elif path.startswith("/frontend/"):
                target_path = path[len("/frontend"):]
            elif path.startswith("/public/"):
                target_path = path[len("/public"):]

            scope["path"] = target_path
            scope["raw_path"] = target_path.encode("utf-8")

        await self.app(scope, receive, send)


app = VercelPathMiddleware(fastapi_app)
__all__ = ["app"]
