from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import pytest
from litestar.testing import AsyncTestClient
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from trust_issues_backend.app import create_app
from trust_issues_backend.settings import Settings
from trust_issues_backend.verifier import VerifiedRun

PASSWORD = "correct-horse-battery"


@dataclass
class FakeVerifier:
    """Verifier double: answers with `next` (a result or an exception to raise)."""

    next: VerifiedRun | Exception = field(
        default_factory=lambda: VerifiedRun(finished=True, frames=300, deaths=0)
    )
    calls: list[tuple[str, list[int]]] = field(default_factory=list)

    async def verify(self, level_id: str, replay: list[int]) -> VerifiedRun:
        self.calls.append((level_id, replay))
        if isinstance(self.next, Exception):
            raise self.next
        return self.next


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_url="sqlite+aiosqlite://",
        jwt_secret="j" * 16 + "unit-test-jwt-secret-0123456789",
        verifier_url="http://verifier.invalid",
        verifier_token="v" * 16 + "unit-test-verifier-token-0123456",
    )


@pytest.fixture
def verifier() -> FakeVerifier:
    return FakeVerifier()


@pytest.fixture
async def client(settings: Settings, verifier: FakeVerifier) -> AsyncIterator[AsyncTestClient]:
    engine = create_async_engine(
        settings.database_url,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    app = create_app(settings, verifier=verifier, engine=engine)
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
