from litestar.testing import AsyncTestClient

from tests.conftest import auth_headers


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
