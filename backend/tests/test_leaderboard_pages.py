from litestar.testing import AsyncTestClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from tests.conftest import RUN_VERSIONS, FakeVerifier, auth_headers
from trust_issues_backend.models import User
from trust_issues_backend.verifier import VerifiedRun

PAGE = "/api/leaderboard/trust-nothing/page"
AROUND = "/api/leaderboard/trust-nothing/around-me"


async def submit(
    client: AsyncTestClient, verifier: FakeVerifier, name: str, frames: int, score: int
) -> dict[str, str]:
    headers = await auth_headers(client, name)
    verifier.next = VerifiedRun(finished=True, frames=frames, deaths=0, score=score)
    response = await client.post(
        "/api/runs",
        json={"level_id": "trust-nothing", "replay": [2, 1], **RUN_VERSIONS},
        headers=headers,
    )
    assert response.status_code == 201
    return headers


async def fill(client: AsyncTestClient, verifier: FakeVerifier) -> dict[str, dict[str, str]]:
    people = {}
    for name, frames, score in [
        ("alice", 300, 1000),
        ("bob", 320, 900),
        ("carol", 340, 800),
        ("dave", 360, 700),
        ("erin", 380, 600),
    ]:
        people[name] = await submit(client, verifier, name, frames, score)
    return people


def names(body: dict) -> list[str]:
    return [entry["username"] for entry in body["entries"]]


async def test_pages_follow_each_other_without_gaps_or_repeats(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    await fill(client, verifier)

    first = (await client.get(f"{PAGE}?limit=2")).json()
    second = (await client.get(f"{PAGE}?limit=2&cursor={first['next_cursor']}")).json()
    third = (await client.get(f"{PAGE}?limit=2&cursor={second['next_cursor']}")).json()

    assert names(first) == ["alice", "bob"]
    assert names(second) == ["carol", "dave"]
    assert names(third) == ["erin"]
    assert [e["rank"] for e in first["entries"] + second["entries"] + third["entries"]] == [
        1,
        2,
        3,
        4,
        5,
    ]
    assert third["next_cursor"] is None


async def test_the_last_full_page_has_no_cursor_when_nothing_follows(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    await fill(client, verifier)

    body = (await client.get(f"{PAGE}?limit=5")).json()

    assert len(body["entries"]) == 5
    assert body["next_cursor"] is None


async def test_a_new_best_run_between_pages_does_not_repeat_or_skip_anyone(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    await fill(client, verifier)
    first = (await client.get(f"{PAGE}?limit=2")).json()

    await submit(client, verifier, "frank", 200, 1100)
    second = (await client.get(f"{PAGE}?limit=2&cursor={first['next_cursor']}")).json()

    assert names(second) == ["carol", "dave"]
    assert [e["rank"] for e in second["entries"]] == [4, 5]


async def test_ties_are_split_by_submission_order_across_a_page_boundary(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    for name in ["early", "middle", "late"]:
        await submit(client, verifier, name, 300, 900)

    first = (await client.get(f"{PAGE}?limit=1")).json()
    second = (await client.get(f"{PAGE}?limit=1&cursor={first['next_cursor']}")).json()
    third = (await client.get(f"{PAGE}?limit=1&cursor={second['next_cursor']}")).json()

    assert [names(first), names(second), names(third)] == [["early"], ["middle"], ["late"]]


async def test_hidden_runs_are_not_paged(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await fill(client, verifier)
    root = await auth_headers(client, "root")
    async with async_sessionmaker(engine)() as session:
        await session.execute(update(User).where(User.username_key == "root").values(is_admin=True))
        await session.commit()
    runs = (await client.get("/api/admin/runs", headers=root)).json()
    bob = next(run["id"] for run in runs if run["username"] == "bob")
    await client.post(f"/api/admin/runs/{bob}/hide", json={}, headers=root)

    body = (await client.get(f"{PAGE}?limit=10")).json()
    mine = (await client.get(f"{AROUND}?radius=1", headers=people["carol"])).json()

    assert names(body) == ["alice", "carol", "dave", "erin"]
    assert names(mine) == ["alice", "carol", "dave"]
    assert mine["rank"] == 2


async def test_rejects_a_cursor_that_is_not_one(client: AsyncTestClient) -> None:
    for cursor in ["nonsense", "e30", ""]:
        response = await client.get(f"{PAGE}?cursor={cursor}")
        assert response.status_code == 400, cursor


async def test_rejects_an_unreasonable_page_size(client: AsyncTestClient) -> None:
    assert (await client.get(f"{PAGE}?limit=0")).status_code == 400
    assert (await client.get(f"{PAGE}?limit=101")).status_code == 400


async def test_an_empty_level_has_an_empty_page(client: AsyncTestClient) -> None:
    body = (await client.get(PAGE)).json()

    assert body == {"entries": [], "next_cursor": None}


async def test_around_me_shows_the_neighbours_with_their_ranks(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    people = await fill(client, verifier)

    body = (await client.get(f"{AROUND}?radius=1", headers=people["carol"])).json()

    assert body["rank"] == 3
    assert names(body) == ["bob", "carol", "dave"]
    assert [e["rank"] for e in body["entries"]] == [2, 3, 4]


async def test_around_me_at_the_first_rank_has_nobody_above(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    people = await fill(client, verifier)

    body = (await client.get(f"{AROUND}?radius=2", headers=people["alice"])).json()

    assert body["rank"] == 1
    assert names(body) == ["alice", "bob", "carol"]


async def test_around_me_at_the_last_rank_has_nobody_below(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    people = await fill(client, verifier)

    body = (await client.get(f"{AROUND}?radius=2", headers=people["erin"])).json()

    assert body["rank"] == 5
    assert names(body) == ["carol", "dave", "erin"]


async def test_around_me_counts_ties_in_submission_order(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    first = await submit(client, verifier, "first", 300, 900)
    second = await submit(client, verifier, "second", 300, 900)

    one = (await client.get(f"{AROUND}?radius=1", headers=first)).json()
    two = (await client.get(f"{AROUND}?radius=1", headers=second)).json()

    assert (one["rank"], two["rank"]) == (1, 2)


async def test_around_me_needs_a_sign_in_and_a_run_on_the_level(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    await fill(client, verifier)
    stranger = await auth_headers(client, "stranger")

    assert (await client.get(AROUND)).status_code == 401
    assert (await client.get(AROUND, headers=stranger)).status_code == 404


async def test_around_me_rejects_an_unreasonable_radius(
    client: AsyncTestClient, verifier: FakeVerifier
) -> None:
    people = await fill(client, verifier)

    for radius in (0, 26):
        response = await client.get(f"{AROUND}?radius={radius}", headers=people["alice"])
        assert response.status_code == 400
