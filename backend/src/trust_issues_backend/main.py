"""ASGI entry point: `uvicorn trust_issues_backend.main:app`."""

import os

from trust_issues_backend.app import create_app
from trust_issues_backend.observability import configure_logging
from trust_issues_backend.settings import Settings

configure_logging(os.environ.get("LOG_LEVEL", "INFO"))
app = create_app(Settings.from_env())
