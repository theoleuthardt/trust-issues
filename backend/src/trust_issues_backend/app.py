"""Application factory."""

from collections.abc import AsyncGenerator, Callable
from datetime import datetime, timedelta

import httpx
from litestar import Litestar
from litestar.connection import ASGIConnection
from litestar.datastructures import State
from litestar.di import Provide
from litestar.exceptions import HTTPException
from litestar.openapi import OpenAPIConfig
from litestar.security.jwt import JWTAuth, Token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from trust_issues_backend.models import Base, User, utcnow
from trust_issues_backend.ratelimit import SlidingWindowLimiter
from trust_issues_backend.routes.account import change_password, delete_account, logout_all
from trust_issues_backend.routes.auth import login, me, register
from trust_issues_backend.routes.health import health
from trust_issues_backend.routes.leaderboard import leaderboard, progress
from trust_issues_backend.routes.runs import submit_run
from trust_issues_backend.security_headers import SecurityHeadersMiddleware, exception_handler
from trust_issues_backend.settings import Settings
from trust_issues_backend.verifier import HttpVerifier, Verifier

LOGIN_ATTEMPTS_PER_MINUTE = 20
RUN_SUBMISSIONS_PER_MINUTE = 30

PUBLIC_PATHS = [
    r"^/health$",
    r"^/api/auth/register$",
    r"^/api/auth/login$",
    r"^/api/leaderboard/",
    r"^/schema",
]
MAX_REQUEST_BODY_BYTES = 256 * 1024


def create_app(
    settings: Settings,
    verifier: Verifier | None = None,
    engine: AsyncEngine | None = None,
    create_schema: bool = False,
    clock: Callable[[], datetime] = utcnow,
) -> Litestar:
    """
    Builds the app; verifier and engine are injectable so tests need no network.

    The schema belongs to the migrations (`alembic upgrade head`, run by the container before
    the server starts); `create_schema` lets tests build it from the models instead.
    """
    engine = engine or create_async_engine(settings.database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    http_client: httpx.AsyncClient | None = None
    if verifier is None:
        http_client = httpx.AsyncClient(
            base_url=settings.verifier_url,
            headers={"x-verifier-token": settings.verifier_token},
            timeout=httpx.Timeout(10.0),
        )
        verifier = HttpVerifier(http_client)

    async def retrieve_user(token: Token, connection: ASGIConnection) -> User | None:
        async with session_factory() as session:
            user = await session.scalar(select(User).where(User.id == int(token.sub)))
        if user is None or token.extras.get("tv") != user.token_version:
            return None
        return user

    jwt_auth = JWTAuth[User](
        token_secret=settings.jwt_secret,
        retrieve_user_handler=retrieve_user,
        exclude=PUBLIC_PATHS,
    )

    async def provide_session() -> AsyncGenerator[AsyncSession]:
        async with session_factory() as session:
            yield session

    async def on_startup(_: Litestar) -> None:
        if create_schema:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)

    async def on_shutdown(_: Litestar) -> None:
        await engine.dispose()
        if http_client is not None:
            await http_client.aclose()

    return Litestar(
        route_handlers=[
            health,
            register,
            login,
            me,
            logout_all,
            change_password,
            delete_account,
            submit_run,
            leaderboard,
            progress,
        ],
        dependencies={"session": Provide(provide_session)},
        state=State(
            {
                "jwt_auth": jwt_auth,
                "verifier": verifier,
                "token_lifetime": timedelta(minutes=settings.access_token_minutes),
                "clock": clock,
                "trusted_proxies": settings.trusted_proxy_ips,
                "login_limiter": SlidingWindowLimiter(LOGIN_ATTEMPTS_PER_MINUTE, 60),
                "run_limiter": SlidingWindowLimiter(RUN_SUBMISSIONS_PER_MINUTE, 60),
            }
        ),
        request_max_body_size=MAX_REQUEST_BODY_BYTES,
        middleware=[SecurityHeadersMiddleware],
        exception_handlers={HTTPException: exception_handler, Exception: exception_handler},
        on_app_init=[jwt_auth.on_app_init],
        on_startup=[on_startup],
        on_shutdown=[on_shutdown],
        openapi_config=(
            OpenAPIConfig(title="Trust Issues API", version="0.1.0")
            if settings.enable_docs
            else None
        ),
    )
