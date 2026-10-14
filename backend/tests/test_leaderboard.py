from litestar.testing import AsyncTestClient

from tests.conftest import FakeVerifier, auth_headers
from trust_issues_backend.verifier import VerifiedRun


async def _submit(
    client: AsyncTestClient, verifier: FakeVerifier, headers, frames: int, score: int
) -> None:
    verifier.next = VerifiedRun(finished=True, frames=frames, deaths=0, score=score)
    response = await client.post(
        "/api/runs", json={"level_id": "trust-nothing", "replay": [2, 1]}, headers=headers
    )
    assert response.status_code == 201


async def test_leaderboard_is_public_and_sorted_by_score(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    for name, frames, score in [("carol", 500, 600), ("alice", 300, 1000), ("bob", 400, 750)]:
        await _submit(client, verifier, await auth_headers(client, name), frames, score)

    response = await client.get("/api/leaderboard/trust-nothing")

    assert response.status_code == 200
    assert [(e["rank"], e["username"], e["score"], e["frames"]) for e in response.json()] == [
        (1, "alice", 1000, 300),
        (2, "bob", 750, 400),
        (3, "carol", 600, 500),
    ]


async def test_equal_scores_are_ordered_by_time_then_by_submission(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    for name, frames in [("first", 320), ("slow", 330), ("fast", 310)]:
        await _submit(client, verifier, await auth_headers(client, name), frames, 800)

    response = await client.get("/api/leaderboard/trust-nothing")

    assert [e["username"] for e in response.json()] == ["fast", "first", "slow"]


async def test_leaderboard_respects_the_limit(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    for name, frames, score in [("alice", 300, 1000), ("bob", 400, 750), ("carol", 500, 600)]:
        await _submit(client, verifier, await auth_headers(client, name), frames, score)

    response = await client.get("/api/leaderboard/trust-nothing?limit=2")

    assert [e["username"] for e in response.json()] == ["alice", "bob"]


async def test_leaderboard_rejects_an_unreasonable_limit(client: AsyncTestClient) -> None:
    response = await client.get("/api/leaderboard/trust-nothing?limit=100000")

    assert response.status_code == 400


async def test_leaderboard_of_an_unplayed_level_is_empty(client: AsyncTestClient) -> None:
    response = await client.get("/api/leaderboard/other-level")

    assert response.status_code == 200
    assert response.json() == []


async def test_progress_lists_only_the_callers_completed_levels(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    alice = await auth_headers(client, "alice")
    bob = await auth_headers(client, "bob")
    await _submit(client, verifier, alice, 300, 1000)

    mine = await client.get("/api/progress", headers=alice)
    theirs = await client.get("/api/progress", headers=bob)

    assert [(e["level_id"], e["frames"], e["score"]) for e in mine.json()] == [
        ("trust-nothing", 300, 1000)
    ]
    assert theirs.json() == []


async def test_progress_requires_authentication(client: AsyncTestClient) -> None:
    response = await client.get("/api/progress")

    assert response.status_code == 401
