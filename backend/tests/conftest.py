import os
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pytest
from litestar.testing import AsyncTestClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import StaticPool

from trust_issues_backend.app import create_app
from trust_issues_backend.models import Base
from trust_issues_backend.settings import Settings
from trust_issues_backend.verifier import VerifiedRun

PASSWORD = "correct-horse-battery"
RUN_VERSIONS = {"sim_version": 1, "level_revision": 1}
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


def require_test_database(url: str) -> None:
    """Refuses to let a test wipe a database whose name does not contain "test"."""
    database = make_url(url).database or ""
    if "test" not in database:
        raise RuntimeError(
            f"refusing to reset database '{database}': TEST_DATABASE_URL must name a "
            "database that contains 'test'"
        )


@dataclass
class FakeVerifier:
    """Verifier double: answers with `next` (a result or an exception to raise)."""

    next: VerifiedRun | Exception = field(
        default_factory=lambda: VerifiedRun(finished=True, frames=300, deaths=0, score=1000)
    )
    calls: list[tuple[str, list[int]]] = field(default_factory=list)
    versions: list[tuple[int, int]] = field(default_factory=list)
    request_ids: list[str | None] = field(default_factory=list)
    compute: Callable[[str, list[int]], VerifiedRun] | None = None

    async def verify(
        self,
        level_id: str,
        replay: list[int],
        sim_version: int,
        level_revision: int,
        request_id: str | None = None,
    ) -> VerifiedRun:
        self.calls.append((level_id, replay))
        self.versions.append((sim_version, level_revision))
        self.request_ids.append(request_id)
        if self.compute is not None:
            return self.compute(level_id, replay)
        if isinstance(self.next, Exception):
            raise self.next
        return self.next


class FakeClock:
    """A controllable wall clock for lockouts."""

    def __init__(self) -> None:
        self.now = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs: float) -> None:
        self.now += timedelta(**kwargs)


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_url=TEST_DATABASE_URL or "sqlite+aiosqlite://",
        jwt_secret="j" * 16 + "unit-test-jwt-secret-0123456789",
        verifier_url="http://verifier.invalid",
        verifier_token="v" * 16 + "unit-test-verifier-token-0123456",
    )


@pytest.fixture
def verifier() -> FakeVerifier:
    return FakeVerifier()


@pytest.fixture
async def engine(settings: Settings) -> AsyncIterator[AsyncEngine]:
    if settings.database_url.startswith("sqlite"):
        test_engine = create_async_engine(
            settings.database_url,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
    else:
        require_test_database(settings.database_url)
        cleanup = create_async_engine(settings.database_url)
        try:
            async with cleanup.begin() as connection:
                await connection.run_sync(Base.metadata.drop_all)
        finally:
            await cleanup.dispose()
        test_engine = create_async_engine(settings.database_url)
    yield test_engine
    await test_engine.dispose()


@pytest.fixture
async def client(
    settings: Settings, verifier: FakeVerifier, clock: FakeClock, engine: AsyncEngine
) -> AsyncIterator[AsyncTestClient]:
    app = create_app(settings, verifier=verifier, engine=engine, create_schema=True, clock=clock)
    async with AsyncTestClient(app=app) as test_client:
        yield test_client


async def register(client: AsyncTestClient, username: str) -> None:
    response = await client.post(
        "/api/auth/register", json={"username": username, "password": PASSWORD}
    )
    assert response.status_code == 201, response.text


async def auth_headers(client: AsyncTestClient, username: str) -> dict[str, str]:
    await register(client, username)
    response = await client.post(
        "/api/auth/login", json={"username": username, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
