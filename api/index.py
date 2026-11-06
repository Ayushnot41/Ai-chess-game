"""
Vercel Serverless Function entrypoint for Grandmaster-AI.
Exposes the FastAPI application directly for unified single-link deployment,
with automatic path normalization for all Vercel serverless routing modes.
"""

import os
import sys
from pathlib import Path

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
            headers = dict(scope.get("headers", []))
            matched_path = headers.get(b"x-matched-path", b"").decode("utf-8", "ignore")

            if matched_path and matched_path.startswith("/api/"):
                scope["path"] = matched_path
            elif path.startswith("/api/index.py"):
                remainder = path[len("/api/index.py"):]
                scope["path"] = "/api" + remainder if remainder.startswith("/") else ("/api/" + remainder if remainder else "/api/status")
            elif path.startswith("/index.py"):
                remainder = path[len("/index.py"):]
                scope["path"] = "/api" + remainder if remainder.startswith("/") else ("/api/" + remainder if remainder else "/api/status")
            elif not path.startswith("/api/") and not path.startswith("/docs") and not path.startswith("/openapi"):
                scope["path"] = f"/api{path}"

        await self.app(scope, receive, send)


app = VercelPathMiddleware(fastapi_app)
__all__ = ["app"]
