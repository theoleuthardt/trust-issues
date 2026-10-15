import asyncio

from litestar.testing import AsyncTestClient

from tests.conftest import PASSWORD, FakeVerifier, auth_headers, register
from trust_issues_backend.verifier import VerifiedRun

NEW_PASSWORD = "a-completely-new-passphrase"


async def login(client: AsyncTestClient, username: str, password: str):
    return await client.post("/api/auth/login", json={"username": username, "password": password})


async def test_logout_all_invalidates_every_token(client: AsyncTestClient) -> None:
    first = await auth_headers(client, "mallory")
    second = {
        "Authorization": "Bearer "
        + (await login(client, "mallory", PASSWORD)).json()["access_token"]
    }

    response = await client.post("/api/auth/logout-all", headers=first)

    assert response.status_code == 204
    assert (await client.get("/api/auth/me", headers=first)).status_code == 401
    assert (await client.get("/api/auth/me", headers=second)).status_code == 401
    assert (await login(client, "mallory", PASSWORD)).status_code == 200


async def test_logout_all_requires_a_token(client: AsyncTestClient) -> None:
    assert (await client.post("/api/auth/logout-all")).status_code == 401


async def test_change_password_returns_a_fresh_token_and_revokes_the_old_ones(
    client: AsyncTestClient,
) -> None:
    old = await auth_headers(client, "mallory")

    response = await client.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
        headers=old,
    )

    assert response.status_code == 200
    fresh = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert (await client.get("/api/auth/me", headers=old)).status_code == 401
    assert (await client.get("/api/auth/me", headers=fresh)).status_code == 200
    assert (await login(client, "mallory", NEW_PASSWORD)).status_code == 200
    assert (await login(client, "mallory", PASSWORD)).status_code == 401


async def test_change_password_needs_the_current_password(client: AsyncTestClient) -> None:
    headers = await auth_headers(client, "mallory")

    response = await client.post(
        "/api/auth/password",
        json={"current_password": "not-my-password-at-all", "new_password": NEW_PASSWORD},
        headers=headers,
    )

    assert response.status_code == 403
    assert (await login(client, "mallory", PASSWORD)).status_code == 200


async def test_change_password_enforces_the_password_rules(client: AsyncTestClient) -> None:
    headers = await auth_headers(client, "mallory")

    response = await client.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": "short"},
        headers=headers,
    )

    assert response.status_code == 400


async def test_wrong_current_passwords_count_towards_the_lockout(client: AsyncTestClient) -> None:
    headers = await auth_headers(client, "mallory")
    for _ in range(5):
        await client.post(
            "/api/auth/password",
            json={"current_password": "not-my-password-at-all", "new_password": NEW_PASSWORD},
            headers=headers,
        )

    assert (await login(client, "mallory", PASSWORD)).status_code == 429


async def test_delete_account_needs_the_password(client: AsyncTestClient) -> None:
    headers = await auth_headers(client, "mallory")

    response = await client.post(
        "/api/auth/delete", json={"password": "not-my-password-at-all"}, headers=headers
    )

    assert response.status_code == 403
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 200


async def test_delete_account_removes_the_user_and_the_runs(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = VerifiedRun(finished=True, frames=300, deaths=0, score=1000)
    await client.post(
        "/api/runs", json={"level_id": "trust-nothing", "replay": [2, 60]}, headers=headers
    )
    assert len((await client.get("/api/leaderboard/trust-nothing")).json()) == 1

    response = await client.post("/api/auth/delete", json={"password": PASSWORD}, headers=headers)

    assert response.status_code == 204
    assert (await client.get("/api/leaderboard/trust-nothing")).json() == []
    assert (await login(client, "mallory", PASSWORD)).status_code == 401
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401


async def test_a_deleted_username_can_be_registered_again(client: AsyncTestClient) -> None:
    headers = await auth_headers(client, "mallory")
    await client.post("/api/auth/delete", json={"password": PASSWORD}, headers=headers)

    await register(client, "mallory")


async def test_delete_account_requires_a_token(client: AsyncTestClient) -> None:
    response = await client.post("/api/auth/delete", json={"password": PASSWORD})

    assert response.status_code == 401


async def test_concurrent_wrong_passwords_cannot_dodge_the_lockout(
    client: AsyncTestClient,
) -> None:
    headers = await auth_headers(client, "mallory")

    await asyncio.gather(
        *(
            client.post(
                "/api/auth/password",
                json={"current_password": "not-my-password-at-all", "new_password": NEW_PASSWORD},
                headers=headers,
            )
            for _ in range(5)
        )
    )

    assert (await login(client, "mallory", PASSWORD)).status_code == 429


async def test_concurrent_wrong_logins_cannot_dodge_the_lockout(client: AsyncTestClient) -> None:
    await register(client, "mallory")

    await asyncio.gather(
        *(login(client, "mallory", "definitely-the-wrong-password") for _ in range(5))
    )

    assert (await login(client, "mallory", PASSWORD)).status_code == 429


async def test_a_locked_account_cannot_change_its_password_or_delete_itself(
    client: AsyncTestClient,
) -> None:
    headers = await auth_headers(client, "mallory")
    for _ in range(5):
        await login(client, "mallory", "definitely-the-wrong-password")

    changed = await client.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
        headers=headers,
    )
    deleted = await client.post("/api/auth/delete", json={"password": PASSWORD}, headers=headers)

    assert changed.status_code == 429
    assert deleted.status_code == 429
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 200
