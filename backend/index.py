"""Vercel entrypoint: Vercel's FastAPI runtime serves the ASGI `app` exported from this module."""

from app.main import app  # noqa: F401
