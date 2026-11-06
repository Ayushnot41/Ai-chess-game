"""
Vercel Serverless Function entrypoint for Grandmaster-AI.
Exposes the FastAPI application directly for unified single-link deployment.
"""

import os
import sys
from pathlib import Path

# Add project root directory to Python path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Import the existing production FastAPI app
from backend.server import app

# Vercel's Python runtime detects 'app' as the ASGI application entrypoint
__all__ = ["app"]
