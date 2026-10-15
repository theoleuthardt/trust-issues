from litestar.testing import AsyncTestClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from tests.conftest import RUN_VERSIONS, FakeVerifier, auth_headers
from trust_issues_backend.admin_cli import set_admin
from trust_issues_backend.models import AuditEvent, User
from trust_issues_backend.verifier import VerifiedRun


async def make_admin(engine: AsyncEngine, username_key: str, value: bool = True) -> None:
    async with async_sessionmaker(engine)() as session:
        await session.execute(
            update(User).where(User.username_key == username_key).values(is_admin=value)
        )
        await session.commit()


async def submit(
    client: AsyncTestClient,
    verifier: FakeVerifier,
    headers: dict[str, str],
    frames: int,
    score: int,
    flags: tuple[str, ...] = (),
) -> None:
    verifier.next = VerifiedRun(finished=True, frames=frames, deaths=0, score=score, flags=flags)
    response = await client.post(
        "/api/runs",
        json={"level_id": "trust-nothing", "replay": [2, 1], **RUN_VERSIONS},
        headers=headers,
    )
    assert response.status_code == 201


async def board(client: AsyncTestClient) -> list[str]:
    response = await client.get("/api/leaderboard/trust-nothing")
    return [entry["username"] for entry in response.json()]


async def run_id_of(client: AsyncTestClient, admin: dict[str, str], username: str) -> int:
    response = await client.get("/api/admin/runs", headers=admin)
    return next(run["id"] for run in response.json() if run["username"] == username)


async def events(engine: AsyncEngine) -> list[AuditEvent]:
    async with async_sessionmaker(engine)() as session:
        return list((await session.scalars(select(AuditEvent).order_by(AuditEvent.id))).all())


async def setup_board(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> dict[str, dict[str, str]]:
    people = {name: await auth_headers(client, name) for name in ["root", "alice", "bob"]}
    await make_admin(engine, "root")
    await submit(client, verifier, people["alice"], 300, 1000, flags=("faster-than-possible",))
    await submit(client, verifier, people["bob"], 400, 800)
    return people


async def test_requires_authentication_and_the_admin_flag(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)

    assert (await client.get("/api/admin/runs")).status_code == 401
    assert (await client.get("/api/admin/runs", headers=people["alice"])).status_code == 403
    assert (await client.get("/api/admin/runs", headers=people["root"])).status_code == 200
    assert (
        await client.post("/api/admin/runs/1/hide", json={}, headers=people["alice"])
    ).status_code == 403


async def test_taking_the_flag_away_works_for_tokens_already_issued(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    await make_admin(engine, "root", False)

    response = await client.get("/api/admin/runs", headers=people["root"])

    assert response.status_code == 403


async def test_lists_runs_with_flags_and_filters_by_flagged(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)

    everything = (await client.get("/api/admin/runs", headers=people["root"])).json()
    flagged = (await client.get("/api/admin/runs?flagged=true", headers=people["root"])).json()

    assert sorted(run["username"] for run in everything) == ["alice", "bob"]
    assert [run["username"] for run in flagged] == ["alice"]
    assert flagged[0]["flags"] == ["faster-than-possible"]
    assert flagged[0]["hidden"] is False
    assert "replay" not in flagged[0]


async def test_the_flagged_filter_is_applied_before_the_limit(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    for name in ["carol", "dave"]:
        await submit(client, verifier, await auth_headers(client, name), 500, 600)

    response = await client.get("/api/admin/runs?flagged=true&limit=1", headers=people["root"])

    assert [run["username"] for run in response.json()] == ["alice"]


async def test_hiding_removes_the_run_from_the_board_but_not_from_progress(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    run_id = await run_id_of(client, people["root"], "alice")

    response = await client.post(
        f"/api/admin/runs/{run_id}/hide", json={"reason": "bot"}, headers=people["root"]
    )

    assert response.status_code == 204
    assert await board(client) == ["bob"]
    progress = await client.get("/api/progress", headers=people["alice"])
    assert [entry["level_id"] for entry in progress.json()] == ["trust-nothing"]


async def test_unhiding_puts_the_run_back(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    run_id = await run_id_of(client, people["root"], "alice")
    await client.post(f"/api/admin/runs/{run_id}/hide", json={}, headers=people["root"])

    response = await client.post(
        f"/api/admin/runs/{run_id}/unhide", json={}, headers=people["root"]
    )

    assert response.status_code == 204
    assert await board(client) == ["alice", "bob"]


async def test_a_hidden_run_does_not_count_for_the_rank_of_others(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    run_id = await run_id_of(client, people["root"], "alice")
    await client.post(f"/api/admin/runs/{run_id}/hide", json={}, headers=people["root"])

    verifier.next = VerifiedRun(finished=True, frames=350, deaths=0, score=900)
    response = await client.post(
        "/api/runs",
        json={"level_id": "trust-nothing", "replay": [2, 1], **RUN_VERSIONS},
        headers=await auth_headers(client, "carol"),
    )

    assert response.json()["rank"] == 1


async def test_a_better_run_of_a_hidden_player_stays_hidden(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    run_id = await run_id_of(client, people["root"], "alice")
    await client.post(f"/api/admin/runs/{run_id}/hide", json={}, headers=people["root"])

    await submit(client, verifier, people["alice"], 250, 1200)

    assert await board(client) == ["bob"]


async def test_deleting_removes_the_run_everywhere(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    run_id = await run_id_of(client, people["root"], "alice")

    response = await client.post(
        f"/api/admin/runs/{run_id}/delete", json={"reason": "cheat"}, headers=people["root"]
    )

    assert response.status_code == 204
    assert await board(client) == ["bob"]
    assert (await client.get("/api/progress", headers=people["alice"])).json() == []
    again = await client.post(f"/api/admin/runs/{run_id}/delete", json={}, headers=people["root"])
    assert again.status_code == 404


async def test_unknown_runs_and_users_are_404(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)

    for path in ["/api/admin/runs/9999/hide", "/api/admin/users/9999/flag"]:
        response = await client.post(path, json={}, headers=people["root"])
        assert response.status_code == 404, path


async def test_rejects_ids_that_cannot_exist(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)

    for path in ["/api/admin/runs/0/hide", "/api/admin/runs/99999999999/hide"]:
        response = await client.post(path, json={}, headers=people["root"])
        assert response.status_code == 400, path


async def test_flagging_a_user_shows_in_the_user_list_and_can_be_undone(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    users = (await client.get("/api/admin/users", headers=people["root"])).json()
    alice = next(user["id"] for user in users if user["username"] == "alice")

    flag = await client.post(
        f"/api/admin/users/{alice}/flag", json={"reason": "many odd runs"}, headers=people["root"]
    )
    flagged = (await client.get("/api/admin/users?flagged=true", headers=people["root"])).json()
    unflag = await client.post(f"/api/admin/users/{alice}/unflag", json={}, headers=people["root"])
    after = (await client.get("/api/admin/users?flagged=true", headers=people["root"])).json()

    assert (flag.status_code, unflag.status_code) == (204, 204)
    assert [user["username"] for user in flagged] == ["alice"]
    assert after == []


async def test_every_action_is_recorded_with_actor_target_and_note(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    run_id = await run_id_of(client, people["root"], "alice")
    users = (await client.get("/api/admin/users", headers=people["root"])).json()
    ids = {user["username"]: user["id"] for user in users}
    root = people["root"]

    await client.post(f"/api/admin/runs/{run_id}/hide", json={"reason": "bot"}, headers=root)
    await client.post(f"/api/admin/runs/{run_id}/unhide", json={}, headers=root)
    await client.post(f"/api/admin/users/{ids['alice']}/flag", json={"reason": "x"}, headers=root)
    await client.post(f"/api/admin/users/{ids['alice']}/unflag", json={}, headers=root)
    await client.post(f"/api/admin/runs/{run_id}/delete", json={"reason": "cheat"}, headers=root)

    recorded = [
        (event.kind, event.actor_id, event.user_id, event.level_id, event.reason)
        for event in await events(engine)
    ]
    assert recorded == [
        ("moderation_hide", ids["root"], ids["alice"], "trust-nothing", "bot"),
        ("moderation_unhide", ids["root"], ids["alice"], "trust-nothing", ""),
        ("moderation_flag_user", ids["root"], ids["alice"], None, "x"),
        ("moderation_unflag_user", ids["root"], ids["alice"], None, ""),
        ("moderation_delete", ids["root"], ids["alice"], "trust-nothing", "cheat"),
    ]


async def test_a_failed_moderation_action_is_not_recorded(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)

    await client.post("/api/admin/runs/9999/hide", json={}, headers=people["root"])
    await client.post("/api/admin/runs/1/hide", json={}, headers=people["alice"])

    assert await events(engine) == []


async def test_rejects_a_reason_over_200_characters(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    run_id = await run_id_of(client, people["root"], "alice")

    response = await client.post(
        f"/api/admin/runs/{run_id}/hide", json={"reason": "x" * 201}, headers=people["root"]
    )

    assert response.status_code == 400


async def test_the_command_line_grants_and_revokes_the_admin_flag(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    factory = async_sessionmaker(engine)

    assert await set_admin(factory, "Alice", True) is True
    assert (await client.get("/api/admin/runs", headers=people["alice"])).status_code == 200
    assert await set_admin(factory, "alice", False) is True
    assert (await client.get("/api/admin/runs", headers=people["alice"])).status_code == 403
    assert await set_admin(factory, "nobody", True) is False


async def test_deleting_an_admin_account_detaches_the_actor_of_its_events(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    people = await setup_board(client, verifier, engine)
    run_id = await run_id_of(client, people["root"], "alice")
    await client.post(f"/api/admin/runs/{run_id}/hide", json={}, headers=people["root"])

    response = await client.post(
        "/api/auth/delete", json={"password": "correct-horse-battery"}, headers=people["root"]
    )

    (event,) = await events(engine)
    assert response.status_code == 204
    assert event.actor_id is None
    assert event.user_id is not None
