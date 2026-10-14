import jwt
from litestar.testing import AsyncTestClient

from tests.conftest import PASSWORD, auth_headers, register


async def test_register_creates_a_user_without_leaking_the_hash(client: AsyncTestClient) -> None:
    response = await client.post(
        "/api/auth/register", json={"username": "Mallory", "password": PASSWORD}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "Mallory"
    assert set(body) == {"id", "username"}


async def test_register_rejects_duplicate_usernames_case_insensitively(
    client: AsyncTestClient,
) -> None:
    await register(client, "Mallory")

    response = await client.post(
        "/api/auth/register", json={"username": "mallory", "password": PASSWORD}
    )

    assert response.status_code == 409


async def test_register_rejects_short_passwords(client: AsyncTestClient) -> None:
    response = await client.post(
        "/api/auth/register", json={"username": "mallory", "password": "short"}
    )

    assert response.status_code == 400


async def test_register_rejects_invalid_usernames(client: AsyncTestClient) -> None:
    for username in ["ab", "has space", "x" * 25, "emoji😀"]:
        response = await client.post(
            "/api/auth/register", json={"username": username, "password": PASSWORD}
        )
        assert response.status_code == 400, username


async def test_login_returns_a_bearer_token(client: AsyncTestClient) -> None:
    await register(client, "mallory")

    response = await client.post(
        "/api/auth/login", json={"username": "MALLORY", "password": PASSWORD}
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


async def test_login_gives_the_same_answer_for_wrong_password_and_unknown_user(
    client: AsyncTestClient,
) -> None:
    await register(client, "mallory")

    wrong_password = await client.post(
        "/api/auth/login", json={"username": "mallory", "password": "not-the-password"}
    )
    unknown_user = await client.post(
        "/api/auth/login", json={"username": "nobody", "password": PASSWORD}
    )

    assert wrong_password.status_code == 401
    assert unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()


async def test_me_requires_a_token(client: AsyncTestClient) -> None:
    response = await client.get("/api/auth/me")

    assert response.status_code == 401


async def test_me_returns_the_current_user(client: AsyncTestClient) -> None:
    headers = await auth_headers(client, "mallory")

    response = await client.get("/api/auth/me", headers=headers)

    assert response.status_code == 200
    assert response.json()["username"] == "mallory"


async def test_me_rejects_a_token_signed_with_another_secret(client: AsyncTestClient) -> None:
    await register(client, "mallory")
    forged = jwt.encode({"sub": "1", "exp": 9999999999}, "x" * 40, algorithm="HS256")

    response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})

    assert response.status_code == 401
