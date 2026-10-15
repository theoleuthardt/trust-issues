from litestar.testing import AsyncTestClient

from tests.conftest import RUN_VERSIONS, FakeVerifier, auth_headers

SUBMISSION = {"level_id": "trust-nothing", "replay": [2, 60], **RUN_VERSIONS}


async def test_limits_login_attempts_per_address(client: AsyncTestClient) -> None:
    codes = []
    for _ in range(25):
        response = await client.post(
            "/api/auth/login", json={"username": "nobody", "password": "x" * 12}
        )
        codes.append(response.status_code)

    assert codes[:20] == [401] * 20
    assert set(codes[20:]) == {429}


async def test_limits_run_submissions_per_player(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    alice = await auth_headers(client, "alice")
    bob = await auth_headers(client, "bob")

    codes = [
        (await client.post("/api/runs", json=SUBMISSION, headers=alice)).status_code
        for _ in range(32)
    ]
    other = await client.post("/api/runs", json=SUBMISSION, headers=bob)

    assert codes[:30] == [201] * 30
    assert set(codes[30:]) == {429}
    assert other.status_code == 201


async def test_a_refused_submission_is_not_sent_to_the_verifier(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    alice = await auth_headers(client, "alice")
    for _ in range(30):
        await client.post("/api/runs", json=SUBMISSION, headers=alice)
    calls = len(verifier.calls)

    response = await client.post("/api/runs", json=SUBMISSION, headers=alice)

    assert response.status_code == 429
    assert len(verifier.calls) == calls
