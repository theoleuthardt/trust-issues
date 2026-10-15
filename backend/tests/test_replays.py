from litestar.testing import AsyncTestClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from tests.conftest import RUN_VERSIONS, FakeVerifier, auth_headers
from trust_issues_backend.models import BestRun
from trust_issues_backend.verifier import VerifiedRun

REPLAY = [2, 62, 6, 1, 2, 200]


async def submit(
    client: AsyncTestClient, verifier: FakeVerifier, name: str, frames: int, score: int
) -> None:
    headers = await auth_headers(client, name)
    verifier.next = VerifiedRun(finished=True, frames=frames, deaths=1, score=score)
    response = await client.post(
        "/api/runs",
        json={"level_id": "trust-nothing", "replay": REPLAY, **RUN_VERSIONS},
        headers=headers,
    )
    assert response.status_code == 201


async def test_the_leaderboard_names_the_run_of_every_entry(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    await submit(client, verifier, "alice", 300, 1000)
    await submit(client, verifier, "bob", 400, 800)

    entries = (await client.get("/api/leaderboard/trust-nothing")).json()

    assert [entry["username"] for entry in entries] == ["alice", "bob"]
    assert all(isinstance(entry["run_id"], int) for entry in entries)
    assert entries[0]["run_id"] != entries[1]["run_id"]


async def test_the_replay_of_a_run_is_public(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    await submit(client, verifier, "alice", 300, 1000)
    run_id = (await client.get("/api/leaderboard/trust-nothing")).json()[0]["run_id"]

    response = await client.get(f"/api/replays/{run_id}")

    assert response.status_code == 200
    assert response.json() == {
        "run_id": run_id,
        "level_id": "trust-nothing",
        "username": "alice",
        "score": 1000,
        "frames": 300,
        "deaths": 1,
        "replay": REPLAY,
        "sim_version": 1,
        "level_revision": 1,
    }


async def test_an_unknown_run_is_a_404(client: AsyncTestClient) -> None:
    assert (await client.get("/api/replays/12345")).status_code == 404


async def test_a_hidden_run_cannot_be_watched(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    await submit(client, verifier, "alice", 300, 1000)
    run_id = (await client.get("/api/leaderboard/trust-nothing")).json()[0]["run_id"]
    async with async_sessionmaker(engine)() as session:
        await session.execute(update(BestRun).values(hidden=True))
        await session.commit()

    assert (await client.get(f"/api/replays/{run_id}")).status_code == 404


async def test_rejects_ids_that_cannot_exist(client: AsyncTestClient) -> None:
    for run_id in ["0", "99999999999"]:
        assert (await client.get(f"/api/replays/{run_id}")).status_code == 400, run_id
    assert (await client.get("/api/replays/abc")).status_code == 404


async def test_limits_replay_downloads_per_address(client: AsyncTestClient) -> None:
    statuses = [(await client.get("/api/replays/1")).status_code for _ in range(61)]

    assert statuses[:60] == [404] * 60
    assert statuses[60] == 429
