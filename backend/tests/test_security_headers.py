from litestar.testing import AsyncTestClient
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from tests.conftest import FakeVerifier, auth_headers
from trust_issues_backend.app import create_app
from trust_issues_backend.settings import Settings


async def test_every_response_carries_the_security_headers(client: AsyncTestClient) -> None:
    response = await client.get("/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["content-security-policy"] == (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    )
    assert response.headers["cross-origin-resource-policy"] == "same-origin"


async def test_error_responses_carry_them_too(client: AsyncTestClient) -> None:
    response = await client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.headers["x-content-type-options"] == "nosniff"


async def test_authentication_responses_are_never_cached(client: AsyncTestClient) -> None:
    headers = await auth_headers(client, "mallory")

    me = await client.get("/api/auth/me", headers=headers)
    login = await client.post(
        "/api/auth/login", json={"username": "mallory", "password": "correct-horse-battery"}
    )

    assert me.headers["cache-control"] == "no-store"
    assert login.headers["cache-control"] == "no-store"


async def test_the_leaderboard_may_be_cached_briefly(client: AsyncTestClient) -> None:
    response = await client.get("/api/leaderboard/trust-nothing")

    assert response.headers["cache-control"] == "public, max-age=15"


async def test_there_is_no_cors_for_other_origins(client: AsyncTestClient) -> None:
    response = await client.get("/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in response.headers


async def test_unexpected_errors_carry_the_headers_and_are_not_cached(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = RuntimeError("boom")

    response = await client.post(
        "/api/runs", json={"level_id": "trust-nothing", "replay": [2, 60]}, headers=headers
    )

    assert response.status_code == 500
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"


async def test_errors_under_the_leaderboard_are_not_cached(client: AsyncTestClient) -> None:
    response = await client.get("/api/leaderboard/trust-nothing?limit=100000")

    assert response.status_code == 400
    assert response.headers["cache-control"] == "no-store"


async def test_the_documentation_pages_are_left_usable_when_enabled(settings: Settings) -> None:
    docs = Settings(
        database_url="sqlite+aiosqlite://",
        jwt_secret=settings.jwt_secret,
        verifier_url=settings.verifier_url,
        verifier_token=settings.verifier_token,
        enable_docs=True,
    )
    engine = create_async_engine(
        docs.database_url, poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    app = create_app(docs, verifier=FakeVerifier(), engine=engine, create_schema=True)

    async with AsyncTestClient(app=app) as test_client:
        page = await test_client.get("/schema/swagger")
        api = await test_client.get("/health")

    assert page.status_code == 200
    assert "content-security-policy" not in page.headers
    assert page.headers["x-content-type-options"] == "nosniff"
    assert "content-security-policy" in api.headers
