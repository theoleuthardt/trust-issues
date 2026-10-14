"""ASGI entry point: `uvicorn trust_issues_backend.main:app`."""

from trust_issues_backend.app import create_app
from trust_issues_backend.settings import Settings

app = create_app(Settings.from_env())
