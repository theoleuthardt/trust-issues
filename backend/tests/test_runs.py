from litestar.testing import AsyncTestClient

from tests.conftest import FakeVerifier, auth_headers
from trust_issues_backend.verifier import (
    InvalidReplayError,
    UnknownLevelError,
    VerifiedRun,
    VerifierUnavailableError,
)

REPLAY = [2, 62, 6, 1, 2, 200]


def submission(level_id: str = "trust-nothing", replay: list[int] | None = None) -> dict:
    return {"level_id": level_id, "replay": REPLAY if replay is None else replay}


async def test_requires_authentication(client: AsyncTestClient) -> None:
    response = await client.post("/api/runs", json=submission())

    assert response.status_code == 401


async def test_stores_a_verified_run_and_ranks_it(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = VerifiedRun(finished=True, frames=290, deaths=3)

    response = await client.post("/api/runs", json=submission(), headers=headers)

    assert response.status_code == 201
    assert response.json() == {"frames": 290, "deaths": 3, "personal_best": True, "rank": 1}
    assert verifier.calls == [("trust-nothing", REPLAY)]


async def test_the_server_derived_time_is_stored_not_a_client_claim(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = VerifiedRun(finished=True, frames=777, deaths=0)

    body = {**submission(), "frames": 1, "deaths": 0}
    response = await client.post("/api/runs", json=body, headers=headers)

    assert response.status_code == 201
    assert response.json()["frames"] == 777


async def test_a_slower_run_does_not_replace_the_personal_best(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = VerifiedRun(finished=True, frames=300, deaths=0)
    await client.post("/api/runs", json=submission(), headers=headers)

    verifier.next = VerifiedRun(finished=True, frames=400, deaths=0)
    response = await client.post("/api/runs", json=submission(), headers=headers)

    assert response.status_code == 201
    assert response.json()["personal_best"] is False
    board = (await client.get("/api/leaderboard/trust-nothing")).json()
    assert board[0]["frames"] == 300


async def test_a_faster_run_replaces_the_personal_best(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = VerifiedRun(finished=True, frames=300, deaths=0)
    await client.post("/api/runs", json=submission(), headers=headers)

    verifier.next = VerifiedRun(finished=True, frames=250, deaths=1)
    response = await client.post("/api/runs", json=submission(), headers=headers)

    assert response.json()["personal_best"] is True
    board = (await client.get("/api/leaderboard/trust-nothing")).json()
    assert [(entry["username"], entry["frames"]) for entry in board] == [("mallory", 250)]


async def test_rejects_a_replay_that_does_not_finish_the_level(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = VerifiedRun(finished=False, frames=120, deaths=2)

    response = await client.post("/api/runs", json=submission(), headers=headers)

    assert response.status_code == 422
    assert (await client.get("/api/leaderboard/trust-nothing")).json() == []


async def test_maps_verifier_rejections(client: AsyncTestClient, verifier: FakeVerifier) -> None:
    headers = await auth_headers(client, "mallory")

    verifier.next = UnknownLevelError("unknown level")
    assert (await client.post("/api/runs", json=submission(), headers=headers)).status_code == 404

    verifier.next = InvalidReplayError("replay exceeds 3600 frames")
    assert (await client.post("/api/runs", json=submission(), headers=headers)).status_code == 422

    verifier.next = VerifierUnavailableError("connection refused")
    assert (await client.post("/api/runs", json=submission(), headers=headers)).status_code == 503


async def test_rejects_oversized_replays_before_calling_the_verifier(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")

    response = await client.post(
        "/api/runs", json=submission(replay=[0, 1] * 20001), headers=headers
    )

    assert response.status_code == 400
    assert verifier.calls == []


async def test_rejects_malformed_level_ids(client: AsyncTestClient, verifier: FakeVerifier) -> None:
    headers = await auth_headers(client, "mallory")

    response = await client.post(
        "/api/runs", json=submission(level_id="../etc/passwd"), headers=headers
    )

    assert response.status_code == 400
    assert verifier.calls == []


async def test_ranks_runs_of_different_players(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    alice = await auth_headers(client, "alice")
    bob = await auth_headers(client, "bob")

    verifier.next = VerifiedRun(finished=True, frames=400, deaths=0)
    first = await client.post("/api/runs", json=submission(), headers=alice)
    verifier.next = VerifiedRun(finished=True, frames=350, deaths=2)
    second = await client.post("/api/runs", json=submission(), headers=bob)

    assert first.json()["rank"] == 1
    assert second.json()["rank"] == 1
    again = await client.get("/api/leaderboard/trust-nothing")
    assert [entry["username"] for entry in again.json()] == ["bob", "alice"]
