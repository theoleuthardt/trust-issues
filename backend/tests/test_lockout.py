from litestar.testing import AsyncTestClient

from tests.conftest import PASSWORD, FakeClock, register

WRONG = "definitely-the-wrong-password"


async def attempt(client: AsyncTestClient, username: str, password: str):
    return await client.post("/api/auth/login", json={"username": username, "password": password})


async def fail_times(client: AsyncTestClient, username: str, times: int) -> None:
    for _ in range(times):
        response = await attempt(client, username, WRONG)
        assert response.status_code == 401


async def test_locks_the_account_after_five_failed_attempts(client: AsyncTestClient) -> None:
    await register(client, "mallory")

    await fail_times(client, "mallory", 5)
    locked = await attempt(client, "mallory", PASSWORD)

    assert locked.status_code == 429
    assert int(locked.headers["retry-after"]) > 0


async def test_unlocks_after_fifteen_minutes(client: AsyncTestClient, clock: FakeClock) -> None:
    await register(client, "mallory")
    await fail_times(client, "mallory", 5)

    clock.advance(minutes=14)
    assert (await attempt(client, "mallory", PASSWORD)).status_code == 429
    clock.advance(minutes=2)

    assert (await attempt(client, "mallory", PASSWORD)).status_code == 200


async def test_a_successful_login_resets_the_counter(client: AsyncTestClient) -> None:
    await register(client, "mallory")
    await fail_times(client, "mallory", 4)

    assert (await attempt(client, "mallory", PASSWORD)).status_code == 200
    await fail_times(client, "mallory", 4)

    assert (await attempt(client, "mallory", PASSWORD)).status_code == 200


async def test_the_lock_does_not_extend_while_it_is_active(
    client: AsyncTestClient, clock: FakeClock
) -> None:
    await register(client, "mallory")
    await fail_times(client, "mallory", 5)
    clock.advance(minutes=10)
    for _ in range(10):
        assert (await attempt(client, "mallory", WRONG)).status_code == 429

    clock.advance(minutes=6)

    assert (await attempt(client, "mallory", PASSWORD)).status_code == 200


async def test_other_accounts_are_not_affected(client: AsyncTestClient) -> None:
    await register(client, "mallory")
    await register(client, "alice")
    await fail_times(client, "mallory", 5)

    assert (await attempt(client, "alice", PASSWORD)).status_code == 200


async def test_failed_attempts_for_unknown_users_stay_plain_failures(
    client: AsyncTestClient,
) -> None:
    for _ in range(6):
        response = await attempt(client, "nobody", WRONG)
        assert response.status_code == 401
