from litestar.testing import AsyncTestClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from tests.conftest import RUN_VERSIONS, FakeVerifier, auth_headers
from trust_issues_backend.models import BestRun
from trust_issues_backend.verifier import VerifiedRun


async def play(
    client: AsyncTestClient,
    verifier: FakeVerifier,
    headers: dict[str, str],
    level_id: str,
    frames: int,
    deaths: int = 0,
    score: int = 900,
) -> None:
    verifier.next = VerifiedRun(finished=True, frames=frames, deaths=deaths, score=score)
    response = await client.post(
        "/api/runs",
        json={"level_id": level_id, "replay": [2, 1], **RUN_VERSIONS},
        headers=headers,
    )
    assert response.status_code == 201


async def test_a_profile_lists_the_best_run_of_every_completed_level(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "Mallory")
    await play(client, verifier, headers, "trust-nothing", 400, deaths=2, score=850)
    await play(client, verifier, headers, "ground-rules", 500, deaths=0, score=950)

    response = await client.get("/api/players/mallory")

    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "Mallory"
    assert [
        (run["level_id"], run["frames"], run["deaths"], run["score"]) for run in body["runs"]
    ] == [
        ("ground-rules", 500, 0, 950),
        ("trust-nothing", 400, 2, 850),
    ]
    assert all(isinstance(run["run_id"], int) for run in body["runs"])
    assert all("completed_at" in run for run in body["runs"])


async def test_a_profile_is_found_by_any_spelling_of_the_name(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    await auth_headers(client, "Mallory")

    for spelling in ["Mallory", "mallory", "MALLORY"]:
        assert (await client.get(f"/api/players/{spelling}")).status_code == 200


async def test_an_unknown_player_is_a_404(client: AsyncTestClient) -> None:
    assert (await client.get("/api/players/nobody")).status_code == 404


async def test_a_profile_shows_nothing_that_is_not_on_the_leaderboards(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    headers = await auth_headers(client, "mallory")
    await play(client, verifier, headers, "trust-nothing", 400)

    body = (await client.get("/api/players/mallory")).json()

    assert set(body) == {"username", "runs"}
    assert set(body["runs"][0]) == {
        "run_id",
        "level_id",
        "score",
        "frames",
        "deaths",
        "completed_at",
    }


async def test_hidden_runs_are_left_out(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    headers = await auth_headers(client, "mallory")
    await play(client, verifier, headers, "trust-nothing", 400)
    await play(client, verifier, headers, "ground-rules", 500)
    async with async_sessionmaker(engine)() as session:
        await session.execute(
            update(BestRun).where(BestRun.level_id == "ground-rules").values(hidden=True)
        )
        await session.commit()

    body = (await client.get("/api/players/mallory")).json()

    assert [run["level_id"] for run in body["runs"]] == ["trust-nothing"]


async def test_a_player_without_runs_has_an_empty_profile(client: AsyncTestClient) -> None:
    await auth_headers(client, "newcomer")

    body = (await client.get("/api/players/newcomer")).json()

    assert body == {"username": "newcomer", "runs": []}


async def test_rejects_names_that_cannot_exist(client: AsyncTestClient) -> None:
    for name in ["a", "x" * 25, "bad!name"]:
        assert (await client.get(f"/api/players/{name}")).status_code == 400, name
