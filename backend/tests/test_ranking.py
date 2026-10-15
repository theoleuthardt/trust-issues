from litestar.testing import AsyncTestClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from tests.conftest import RUN_VERSIONS, FakeClock, FakeVerifier, auth_headers
from trust_issues_backend.models import BestRun, User
from trust_issues_backend.verifier import VerifiedRun, VerifierUnavailableError

RANKING = "/api/ranking"


async def play(
    client: AsyncTestClient,
    verifier: FakeVerifier,
    headers: dict[str, str],
    level_id: str,
    frames: int,
    score: int = 900,
) -> None:
    verifier.next = VerifiedRun(finished=True, frames=frames, deaths=0, score=score)
    response = await client.post(
        "/api/runs",
        json={"level_id": level_id, "replay": [2, 1], **RUN_VERSIONS},
        headers=headers,
    )
    assert response.status_code == 201


def names(body: list[dict]) -> list[str]:
    return [entry["username"] for entry in body]


async def test_ranks_players_who_finished_every_level_by_their_total_frames(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    verifier.levels_list = ["trust-nothing", "ground-rules"]
    for name, first, second in [("slow", 500, 600), ("fast", 300, 350), ("middle", 400, 420)]:
        headers = await auth_headers(client, name)
        await play(client, verifier, headers, "trust-nothing", first)
        await play(client, verifier, headers, "ground-rules", second)

    body = (await client.get(RANKING)).json()

    assert names(body) == ["fast", "middle", "slow"]
    assert [entry["rank"] for entry in body] == [1, 2, 3]
    assert [entry["total_frames"] for entry in body] == [650, 820, 1100]


async def test_leaves_out_players_who_miss_a_level(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    verifier.levels_list = ["trust-nothing", "ground-rules"]
    whole = await auth_headers(client, "whole")
    partial = await auth_headers(client, "partial")
    await play(client, verifier, whole, "trust-nothing", 500)
    await play(client, verifier, whole, "ground-rules", 500)
    await play(client, verifier, partial, "trust-nothing", 100)

    body = (await client.get(RANKING)).json()

    assert names(body) == ["whole"]


async def test_ignores_levels_that_are_no_longer_in_the_game(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    verifier.levels_list = ["trust-nothing"]
    headers = await auth_headers(client, "mallory")
    await play(client, verifier, headers, "trust-nothing", 400)
    await play(client, verifier, headers, "retired-level", 10)

    body = (await client.get(RANKING)).json()

    assert body[0]["total_frames"] == 400


async def test_equal_totals_go_to_who_completed_first(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    verifier.levels_list = ["trust-nothing"]
    for name in ["early", "late"]:
        await play(client, verifier, await auth_headers(client, name), "trust-nothing", 400)

    body = (await client.get(RANKING)).json()

    assert names(body) == ["early", "late"]


async def test_a_hidden_run_takes_a_player_out_of_the_ranking(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    verifier.levels_list = ["trust-nothing"]
    await play(client, verifier, await auth_headers(client, "visible"), "trust-nothing", 500)
    await play(client, verifier, await auth_headers(client, "hidden"), "trust-nothing", 300)
    async with async_sessionmaker(engine)() as session:
        user = await session.scalar(select(User).where(User.username_key == "hidden"))
        assert user is not None
        await session.execute(update(BestRun).where(BestRun.user_id == user.id).values(hidden=True))
        await session.commit()

    body = (await client.get(RANKING)).json()

    assert names(body) == ["visible"]


async def test_respects_the_limit(client: AsyncTestClient, verifier: FakeVerifier) -> None:
    verifier.levels_list = ["trust-nothing"]
    for name, frames in [("first", 300), ("second", 400), ("third", 500)]:
        await play(client, verifier, await auth_headers(client, name), "trust-nothing", frames)

    body = (await client.get(f"{RANKING}?limit=2")).json()

    assert names(body) == ["first", "second"]
    assert (await client.get(f"{RANKING}?limit=0")).status_code == 400
    assert (await client.get(f"{RANKING}?limit=101")).status_code == 400


async def test_is_empty_without_levels_or_players(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    verifier.levels_list = []

    assert (await client.get(RANKING)).json() == []


async def test_asks_the_verifier_for_the_levels_only_once_in_a_while(
    client: AsyncTestClient, verifier: FakeVerifier, clock: FakeClock
) -> None:
    verifier.levels_list = ["trust-nothing"]

    await client.get(RANKING)
    await client.get(RANKING)
    assert verifier.level_calls == 1

    clock.advance(minutes=10)
    await client.get(RANKING)

    assert verifier.level_calls == 2


async def test_answers_503_when_the_levels_cannot_be_fetched(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    verifier.levels_error = VerifierUnavailableError("down")

    response = await client.get(RANKING)

    assert response.status_code == 503
