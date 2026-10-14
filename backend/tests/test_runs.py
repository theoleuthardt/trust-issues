import asyncio

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


def run(frames: int, deaths: int, score: int) -> VerifiedRun:
    return VerifiedRun(finished=True, frames=frames, deaths=deaths, score=score)


async def test_requires_authentication(client: AsyncTestClient) -> None:
    response = await client.post("/api/runs", json=submission())

    assert response.status_code == 401


async def test_stores_a_verified_run_and_ranks_it(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = run(frames=290, deaths=3, score=925)

    response = await client.post("/api/runs", json=submission(), headers=headers)

    assert response.status_code == 201
    assert response.json() == {
        "frames": 290,
        "deaths": 3,
        "score": 925,
        "personal_best": True,
        "rank": 1,
    }
    assert verifier.calls == [("trust-nothing", REPLAY)]


async def test_time_and_score_come_from_the_verifier_not_from_the_client(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = run(frames=777, deaths=0, score=400)

    body = {**submission(), "frames": 1, "deaths": 0, "score": 99999}
    response = await client.post("/api/runs", json=body, headers=headers)

    assert response.status_code == 201
    assert response.json()["frames"] == 777
    assert response.json()["score"] == 400


async def test_a_lower_score_does_not_replace_the_personal_best(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = run(frames=300, deaths=0, score=1000)
    await client.post("/api/runs", json=submission(), headers=headers)

    verifier.next = run(frames=400, deaths=0, score=750)
    response = await client.post("/api/runs", json=submission(), headers=headers)

    assert response.status_code == 201
    assert response.json()["personal_best"] is False
    board = (await client.get("/api/leaderboard/trust-nothing")).json()
    assert [(entry["frames"], entry["score"]) for entry in board] == [(300, 1000)]


async def test_a_higher_score_replaces_the_personal_best(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = run(frames=300, deaths=0, score=1000)
    await client.post("/api/runs", json=submission(), headers=headers)

    verifier.next = run(frames=250, deaths=1, score=1175)
    response = await client.post("/api/runs", json=submission(), headers=headers)

    assert response.json()["personal_best"] is True
    board = (await client.get("/api/leaderboard/trust-nothing")).json()
    assert [(entry["username"], entry["score"]) for entry in board] == [("mallory", 1175)]


async def test_a_faster_run_with_a_lower_score_does_not_replace_the_best(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = run(frames=300, deaths=0, score=1000)
    await client.post("/api/runs", json=submission(), headers=headers)

    verifier.next = run(frames=250, deaths=12, score=900)
    response = await client.post("/api/runs", json=submission(), headers=headers)

    assert response.json()["personal_best"] is False
    board = (await client.get("/api/leaderboard/trust-nothing")).json()
    assert [(entry["frames"], entry["score"]) for entry in board] == [(300, 1000)]


async def test_a_slower_run_with_a_higher_score_replaces_the_best(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = run(frames=250, deaths=12, score=900)
    await client.post("/api/runs", json=submission(), headers=headers)

    verifier.next = run(frames=300, deaths=0, score=1000)
    response = await client.post("/api/runs", json=submission(), headers=headers)

    assert response.json()["personal_best"] is True
    board = (await client.get("/api/leaderboard/trust-nothing")).json()
    assert [(entry["frames"], entry["score"]) for entry in board] == [(300, 1000)]


async def test_an_identical_result_keeps_the_earlier_submission(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = run(frames=300, deaths=0, score=1000)
    first = await client.post("/api/runs", json=submission(), headers=headers)

    second = await client.post("/api/runs", json=submission(), headers=headers)

    assert first.json()["personal_best"] is True
    assert second.json()["personal_best"] is False


async def test_with_an_equal_score_the_faster_run_wins(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = run(frames=320, deaths=0, score=900)
    await client.post("/api/runs", json=submission(), headers=headers)

    verifier.next = run(frames=300, deaths=1, score=900)
    response = await client.post("/api/runs", json=submission(), headers=headers)

    assert response.json()["personal_best"] is True
    board = (await client.get("/api/leaderboard/trust-nothing")).json()
    assert board[0]["frames"] == 300


async def test_rejects_a_replay_that_does_not_finish_the_level(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = VerifiedRun(finished=False, frames=120, deaths=2, score=0)

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


async def test_ranks_by_score_not_by_time(client: AsyncTestClient, verifier: FakeVerifier) -> None:
    alice = await auth_headers(client, "alice")
    bob = await auth_headers(client, "bob")

    verifier.next = run(frames=300, deaths=0, score=1000)
    first = await client.post("/api/runs", json=submission(), headers=alice)
    verifier.next = run(frames=280, deaths=6, score=900)
    second = await client.post("/api/runs", json=submission(), headers=bob)

    assert first.json()["rank"] == 1
    assert second.json()["rank"] == 2
    board = await client.get("/api/leaderboard/trust-nothing")
    assert [entry["username"] for entry in board.json()] == ["alice", "bob"]


async def test_concurrent_submissions_of_one_player_keep_the_best(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.compute = lambda _level, replay: run(
        frames=replay[1], deaths=0, score=2000 - replay[1]
    )

    responses = await asyncio.gather(
        *(
            client.post("/api/runs", json=submission(replay=[2, 100 + n]), headers=headers)
            for n in (7, 3, 0, 11, 5, 9, 1, 8, 4, 10, 2, 6)
        )
    )

    assert [response.status_code for response in responses] == [201] * 12
    board = (await client.get("/api/leaderboard/trust-nothing")).json()
    assert [(entry["username"], entry["score"]) for entry in board] == [("mallory", 1900)]
