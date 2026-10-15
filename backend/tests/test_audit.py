import asyncio
from dataclasses import replace
from datetime import timedelta
from pathlib import Path

import pytest
from litestar.testing import AsyncTestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from tests.conftest import (
    PASSWORD,
    RUN_VERSIONS,
    TEST_DATABASE_URL,
    FakeClock,
    FakeVerifier,
    auth_headers,
    require_test_database,
)
from trust_issues_backend import audit
from trust_issues_backend.app import create_app
from trust_issues_backend.models import AuditEvent, Base
from trust_issues_backend.settings import Settings
from trust_issues_backend.verifier import (
    InvalidReplayError,
    OutdatedVersionError,
    UnknownLevelError,
    VerifiedRun,
    VerifierUnavailableError,
)

REPLAY = [2, 62, 6, 1, 2, 200]


def body(level_id: str = "trust-nothing", **extra: object) -> dict:
    return {"level_id": level_id, "replay": REPLAY, **RUN_VERSIONS, **extra}


async def events(engine: AsyncEngine) -> list[AuditEvent]:
    async with async_sessionmaker(engine)() as session:
        return list((await session.scalars(select(AuditEvent).order_by(AuditEvent.id))).all())


async def test_records_a_replay_that_does_not_finish_the_level(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = VerifiedRun(finished=False, frames=30, deaths=0, score=0)

    response = await client.post("/api/runs", json=body(), headers=headers)

    (event,) = await events(engine)
    assert response.status_code == 422
    assert event.kind == "run_rejected"
    assert event.level_id == "trust-nothing"
    assert event.reason == "replay does not finish the level"
    assert event.replay_size == len(REPLAY)
    assert event.request_id == response.headers["x-request-id"]
    assert event.user_id is not None


async def test_a_failing_audit_write_does_not_change_the_answer(
    client: AsyncTestClient,
    verifier: FakeVerifier,
    engine: AsyncEngine,
    caplog: pytest.LogCaptureFixture,
) -> None:
    headers = await auth_headers(client, "mallory")
    async with engine.begin() as connection:
        await connection.exec_driver_sql("DROP TABLE audit_events")
    verifier.next = OutdatedVersionError("retired")

    with caplog.at_level("ERROR", logger="trust_issues.audit"):
        response = await client.post("/api/runs", json=body(), headers=headers)

    assert response.status_code == 409
    assert "reload" in response.json()["detail"]
    assert any("recording a rejected run failed" in r.getMessage() for r in caplog.records)


async def test_records_the_reason_of_the_verifier_for_an_invalid_replay(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = InvalidReplayError("invalid input mask 9")

    await client.post("/api/runs", json=body(), headers=headers)

    (event,) = await events(engine)
    assert event.reason == "invalid input mask 9"


async def test_records_an_unknown_level_and_an_outdated_version(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = UnknownLevelError("nope")
    await client.post("/api/runs", json=body("not-a-level"), headers=headers)
    verifier.next = OutdatedVersionError("retired")

    await client.post("/api/runs", json=body(sim_version=3, level_revision=2), headers=headers)

    unknown, outdated = await events(engine)
    assert (unknown.level_id, unknown.reason) == ("not-a-level", "unknown level")
    assert outdated.reason == "outdated version sim=3 level=2"


async def test_accepted_runs_and_verifier_outages_leave_no_events(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = VerifiedRun(finished=True, frames=300, deaths=0, score=1000)
    await client.post("/api/runs", json=body(), headers=headers)
    verifier.next = VerifierUnavailableError("down")
    await client.post("/api/runs", json=body(), headers=headers)

    assert await events(engine) == []


async def test_stores_neither_the_replay_nor_any_credential(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    headers = await auth_headers(client, "mallory")
    token = headers["Authorization"].removeprefix("Bearer ")
    verifier.next = InvalidReplayError("invalid run length 0")
    await client.post("/api/runs", json=body(), headers=headers)

    (event,) = await events(engine)

    stored = " ".join(str(getattr(event, column.name)) for column in AuditEvent.__table__.columns)
    assert token not in stored
    assert PASSWORD not in stored
    assert str(REPLAY) not in stored


async def test_deleting_an_account_keeps_its_events_without_the_user(
    client: AsyncTestClient, verifier: FakeVerifier, engine: AsyncEngine
) -> None:
    headers = await auth_headers(client, "mallory")
    verifier.next = InvalidReplayError("invalid run length 0")
    await client.post("/api/runs", json=body(), headers=headers)

    response = await client.post("/api/auth/delete", json={"password": PASSWORD}, headers=headers)

    (event,) = await events(engine)
    assert response.status_code == 204
    assert event.user_id is None


async def test_purges_only_events_older_than_the_retention(engine: AsyncEngine) -> None:
    clock = FakeClock()
    async with engine.begin() as connection:
        await connection.run_sync(AuditEvent.metadata.create_all)
    factory = async_sessionmaker(engine)
    async with factory() as session:
        for days_old in (91, 90, 10):
            session.add(
                AuditEvent(
                    kind="run_rejected",
                    reason=f"{days_old} days old",
                    created_at=clock() - timedelta(days=days_old, minutes=-1),
                )
            )
        await session.commit()

    removed = await audit.purge_expired(factory, timedelta(days=90), clock())

    assert removed == 1
    assert sorted(event.reason for event in await events(engine)) == [
        "10 days old",
        "90 days old",
    ]


async def test_the_running_app_purges_expired_events_at_start_and_afterwards(
    settings: Settings, verifier: FakeVerifier, clock: FakeClock, tmp_path: Path
) -> None:
    url = TEST_DATABASE_URL or f"sqlite+aiosqlite:///{tmp_path / 'purge.db'}"
    require_test_database(url)
    engine = create_async_engine(url, poolclass=NullPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine)

    async def add(reason: str, age: timedelta) -> None:
        async with factory() as session:
            session.add(AuditEvent(kind="run_rejected", reason=reason, created_at=clock() - age))
            await session.commit()

    await add("ancient at start", timedelta(days=400))
    fast = replace(settings, database_url=url, audit_purge_interval_seconds=0.05)
    app = create_app(fast, verifier=verifier, engine=engine, clock=clock)

    async with AsyncTestClient(app=app):
        await until_reasons(engine, [])
        await add("ancient later", timedelta(days=400))
        await add("recent", timedelta(days=1))
        await until_reasons(engine, ["recent"])


async def until_reasons(engine: AsyncEngine, wanted: list[str]) -> None:
    for _ in range(250):
        if [event.reason for event in await events(engine)] == wanted:
            return
        await asyncio.sleep(0.02)
    raise AssertionError(f"audit events never became {wanted}")
