"""Request ids and one structured access log line per request."""

import json
import logging
import re
import sys
import time
import uuid
from datetime import UTC, datetime

from litestar import Request, Response
from litestar.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "x-request-id"
_VALID_ID = re.compile(r"[A-Za-z0-9._-]{8,64}")

access_logger = logging.getLogger("trust_issues.access")

_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    """One JSON object per line with the extra fields of a record at the top level."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
_QUIET = ("sqlalchemy.engine", "httpx", "httpcore", "asyncio")


def configure_logging(level: str = "INFO") -> None:
    """
    Sends all logs to stdout as JSON lines. An unknown level falls back to INFO, and the
    libraries that would log SQL statements with their parameters or every outgoing request
    are kept at WARNING whatever the level is.
    """
    name = level.strip().upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(name if name in _LEVELS else "INFO")
    for library in _QUIET:
        logging.getLogger(library).setLevel(logging.WARNING)


def request_id_for(scope: Scope) -> str:
    """
    The id of this request: a sane `X-Request-ID` of the caller, otherwise a fresh one. It is
    remembered in the scope so every part of the request sees the same value.
    """
    state = scope.setdefault("state", {})
    existing = state.get("request_id")
    if existing:
        return str(existing)
    incoming = ""
    for name, value in scope.get("headers", []):
        if name.decode("latin-1").lower() == REQUEST_ID_HEADER:
            incoming = value.decode("latin-1")
            break
    request_id = incoming if _VALID_ID.fullmatch(incoming) else uuid.uuid4().hex
    state["request_id"] = request_id
    state.setdefault("started", time.perf_counter())
    return request_id


def _log_access(scope: Scope, status: int) -> None:
    state = scope.setdefault("state", {})
    if state.get("logged"):
        return
    state["logged"] = True
    started = state.get("started", time.perf_counter())
    user = scope.get("user")
    access_logger.info(
        "%s %s %s",
        scope.get("method", ""),
        scope.get("path", ""),
        status,
        extra={
            "request_id": request_id_for(scope),
            "method": scope.get("method"),
            "path": scope.get("path"),
            "status": status,
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            "user_id": getattr(user, "id", None),
        },
    )


def finish_error_response(request: Request, response: Response) -> None:
    """Adds the request id to an error response and logs it (errors skip the middleware)."""
    scope = request.scope
    response.headers[REQUEST_ID_HEADER] = request_id_for(scope)
    _log_access(scope, response.status_code)


class AccessLogMiddleware:
    """Assigns the request id, returns it as a header and logs one line per request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = request_id_for(scope)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                if all(name.decode("latin-1").lower() != REQUEST_ID_HEADER for name, _ in headers):
                    headers.append((REQUEST_ID_HEADER.encode(), request_id.encode()))
                message["headers"] = headers
                _log_access(scope, message["status"])
            await send(message)

        await self.app(scope, receive, send_with_id)
