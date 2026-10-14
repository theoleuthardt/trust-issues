"""Application factory."""

import asyncio
import logging
from collections.abc import AsyncGenerator
from datetime import timedelta

import httpx
from litestar import Litestar
from litestar.connection import ASGIConnection
from litestar.datastructures import State
from litestar.di import Provide
from litestar.openapi import OpenAPIConfig
from litestar.security.jwt import JWTAuth, Token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from trust_issues_backend.models import Base, User
from trust_issues_backend.routes.auth import login, me, register
from trust_issues_backend.routes.health import health
from trust_issues_backend.routes.leaderboard import leaderboard, progress
from trust_issues_backend.routes.runs import submit_run
from trust_issues_backend.settings import Settings
from trust_issues_backend.verifier import HttpVerifier, Verifier

logger = logging.getLogger(__name__)

PUBLIC_PATHS = [
    r"^/health$",
    r"^/api/auth/register$",
    r"^/api/auth/login$",
    r"^/api/leaderboard/",
    r"^/schema",
]
DATABASE_STARTUP_ATTEMPTS = 30
MAX_REQUEST_BODY_BYTES = 256 * 1024


async def _create_schema(engine: AsyncEngine) -> None:
    """Creates missing tables, waiting for the database to accept connections first."""
    for attempt in range(1, DATABASE_STARTUP_ATTEMPTS + 1):
        try:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
        except (OSError, ConnectionError) as error:
            if attempt == DATABASE_STARTUP_ATTEMPTS:
                raise
            logger.warning("database not ready (%s), retrying", error)
            await asyncio.sleep(1)
        else:
            return


def create_app(
    settings: Settings,
    verifier: Verifier | None = None,
    engine: AsyncEngine | None = None,
) -> Litestar:
    """Builds the app; verifier and engine are injectable so tests need no network."""
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
        await _create_schema(engine)

    async def on_shutdown(_: Litestar) -> None:
        await engine.dispose()
        if http_client is not None:
            await http_client.aclose()

    return Litestar(
        route_handlers=[health, register, login, me, submit_run, leaderboard, progress],
        dependencies={"session": Provide(provide_session)},
        state=State(
            {
                "jwt_auth": jwt_auth,
                "verifier": verifier,
                "token_lifetime": timedelta(minutes=settings.access_token_minutes),
            }
        ),
        request_max_body_size=MAX_REQUEST_BODY_BYTES,
        on_app_init=[jwt_auth.on_app_init],
        on_startup=[on_startup],
        on_shutdown=[on_shutdown],
        openapi_config=(
            OpenAPIConfig(title="Trust Issues API", version="0.1.0")
            if settings.enable_docs
            else None
        ),
    )
