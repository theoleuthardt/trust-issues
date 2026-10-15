"""Response headers every answer of the API carries."""

from litestar import Request, Response
from litestar.datastructures import MutableScopeHeaders
from litestar.exceptions.responses import create_exception_response
from litestar.types import ASGIApp, Message, Receive, Scope, Send

SECURITY_HEADERS = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "cross-origin-resource-policy": "same-origin",
}

DOCS_PREFIX = "/schema"
LEADERBOARD_PREFIX = "/api/leaderboard/"
LEADERBOARD_CACHE = "public, max-age=15"
PRIVATE_CACHE = "no-store"


class SecurityHeadersMiddleware:
    """
    Adds the security headers to every HTTP response. Everything is `no-store` except the public
    leaderboard, which may be cached for a few seconds. The API documentation pages (served only
    with ENABLE_DOCS) keep the other headers but get no CSP, since they load their own assets.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope["path"]

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableScopeHeaders(message)
                for name, value in SECURITY_HEADERS.items():
                    if name == "content-security-policy" and path.startswith(DOCS_PREFIX):
                        continue
                    headers[name] = value
                if "cache-control" not in headers:
                    is_board = path.startswith(LEADERBOARD_PREFIX)
                    headers["cache-control"] = LEADERBOARD_CACHE if is_board else PRIVATE_CACHE
            await send(message)

        await self.app(scope, receive, send_with_headers)


def exception_handler(request: Request, exc: Exception) -> Response:
    """
    The default error response plus the security headers. Litestar answers exceptions outside
    the user middleware stack, so the middleware alone does not reach them.
    """
    response = create_exception_response(request, exc)
    for name, value in SECURITY_HEADERS.items():
        response.headers[name] = value
    response.headers.setdefault("cache-control", PRIVATE_CACHE)
    return response
