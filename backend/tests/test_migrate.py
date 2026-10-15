import asyncio
from pathlib import Path

import pytest
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from tests.conftest import TEST_DATABASE_URL, require_test_database
from trust_issues_backend.migrate import (
    DatabaseUnavailableError,
    OutdatedDatabaseError,
    alembic_config,
    migrate,
    wait_for_database,
)
from trust_issues_backend.models import Base

HEAD = ScriptDirectory.from_config(alembic_config("sqlite://")).get_current_head()


async def fresh_url(tmp_path: Path) -> str:
    url = TEST_DATABASE_URL or f"sqlite+aiosqlite:///{tmp_path / 'fresh.db'}"
    require_test_database(url)
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
            await connection.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    finally:
        await engine.dispose()
    return url


async def scalar(url: str, statement: str) -> object:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            return (await connection.execute(text(statement))).scalar()
    finally:
        await engine.dispose()


async def run_migrate(url: str) -> None:
    await asyncio.to_thread(migrate, url)


async def test_returns_as_soon_as_the_database_answers() -> None:
    await wait_for_database("sqlite+aiosqlite://", attempts=3, delay=0)


async def test_gives_up_after_the_given_attempts() -> None:
    with pytest.raises(DatabaseUnavailableError):
        await wait_for_database(
            "postgresql+asyncpg://nobody:nopass@127.0.0.1:1/none", attempts=2, delay=0
        )


async def test_migrates_an_empty_database_to_head(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)

    await run_migrate(url)

    assert await scalar(url, "SELECT version_num FROM alembic_version") == HEAD
    assert await scalar(url, "SELECT count(*) FROM users") == 0


async def test_running_it_again_changes_nothing(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)
    await run_migrate(url)

    await run_migrate(url)

    assert await scalar(url, "SELECT version_num FROM alembic_version") == HEAD


async def test_adopts_a_database_that_was_created_from_the_models(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            await connection.execute(
                text(
                    "INSERT INTO users (username, username_key, password_hash, token_version, "
                    "created_at) VALUES ('Old', 'old', 'x', 0, CURRENT_TIMESTAMP)"
                )
            )
    finally:
        await engine.dispose()

    await run_migrate(url)

    assert await scalar(url, "SELECT version_num FROM alembic_version") == HEAD
    assert await scalar(url, "SELECT username FROM users") == "Old"


async def test_adopts_a_database_from_the_baseline_era_and_upgrades_it(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)
    await asyncio.to_thread(command.upgrade, alembic_config(url), "0001")
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql(
                "INSERT INTO users (username, username_key, password_hash, token_version, "
                "created_at) VALUES ('Old', 'old', 'x', 0, CURRENT_TIMESTAMP)"
            )
            await connection.exec_driver_sql("DROP TABLE alembic_version")
    finally:
        await engine.dispose()

    await run_migrate(url)

    assert await scalar(url, "SELECT version_num FROM alembic_version") == HEAD
    assert await scalar(url, "SELECT failed_logins FROM users WHERE username_key = 'old'") == 0
    assert await scalar(url, "SELECT locked_until FROM users WHERE username_key = 'old'") is None


async def test_adopts_a_database_from_before_the_versions_and_marks_old_runs_as_version_1(
    tmp_path: Path,
) -> None:
    url = await fresh_url(tmp_path)
    await asyncio.to_thread(command.upgrade, alembic_config(url), "0002")
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql(
                "INSERT INTO users (id, username, username_key, password_hash, token_version, "
                "created_at, failed_logins) VALUES (1, 'Old', 'old', 'x', 0, CURRENT_TIMESTAMP, 0)"
            )
            await connection.exec_driver_sql(
                "INSERT INTO best_runs (user_id, level_id, score, frames, deaths, replay, "
                "submitted_at) VALUES (1, 'trust-nothing', 900, 300, 2, '[2, 60]', "
                "CURRENT_TIMESTAMP)"
            )
            await connection.exec_driver_sql("DROP TABLE alembic_version")
    finally:
        await engine.dispose()

    await run_migrate(url)

    assert await scalar(url, "SELECT version_num FROM alembic_version") == HEAD
    assert await scalar(url, "SELECT sim_version FROM best_runs") == 1
    assert await scalar(url, "SELECT level_revision FROM best_runs") == 1


async def test_adopts_a_database_from_the_versions_era_and_gives_old_runs_no_flags(
    tmp_path: Path,
) -> None:
    url = await fresh_url(tmp_path)
    await asyncio.to_thread(command.upgrade, alembic_config(url), "0003")
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql(
                "INSERT INTO users (id, username, username_key, password_hash, token_version, "
                "created_at, failed_logins) VALUES (1, 'Old', 'old', 'x', 0, CURRENT_TIMESTAMP, 0)"
            )
            await connection.exec_driver_sql(
                "INSERT INTO best_runs (user_id, level_id, score, frames, deaths, replay, "
                "sim_version, level_revision, submitted_at) VALUES (1, 'trust-nothing', 900, "
                "300, 2, '[2, 60]', 1, 1, CURRENT_TIMESTAMP)"
            )
            await connection.exec_driver_sql("DROP TABLE alembic_version")
    finally:
        await engine.dispose()

    await run_migrate(url)

    assert await scalar(url, "SELECT version_num FROM alembic_version") == HEAD
    assert str(await scalar(url, "SELECT flags FROM best_runs")).replace(" ", "") == "[]"


async def test_adopts_a_database_from_before_the_audit_log(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)
    await asyncio.to_thread(command.upgrade, alembic_config(url), "0004")
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql("DROP TABLE alembic_version")
    finally:
        await engine.dispose()

    await run_migrate(url)

    assert await scalar(url, "SELECT version_num FROM alembic_version") == HEAD
    assert await scalar(url, "SELECT count(*) FROM audit_events") == 0


async def test_adopts_a_database_from_before_moderation_with_nobody_flagged(
    tmp_path: Path,
) -> None:
    url = await fresh_url(tmp_path)
    await asyncio.to_thread(command.upgrade, alembic_config(url), "0005")
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql(
                "INSERT INTO users (id, username, username_key, password_hash, token_version, "
                "created_at, failed_logins) VALUES (1, 'Old', 'old', 'x', 0, CURRENT_TIMESTAMP, 0)"
            )
            await connection.exec_driver_sql("DROP TABLE alembic_version")
    finally:
        await engine.dispose()

    await run_migrate(url)

    assert await scalar(url, "SELECT version_num FROM alembic_version") == HEAD
    assert not await scalar(url, "SELECT is_admin FROM users")
    assert not await scalar(url, "SELECT flagged FROM users")


async def test_refuses_a_database_with_half_of_the_moderation_columns(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)
    await asyncio.to_thread(command.upgrade, alembic_config(url), "0005")
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false"
            )
            await connection.exec_driver_sql("DROP TABLE alembic_version")
    finally:
        await engine.dispose()

    with pytest.raises(OutdatedDatabaseError):
        await run_migrate(url)


async def test_refuses_a_database_with_a_partial_audit_table(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)
    await asyncio.to_thread(command.upgrade, alembic_config(url), "0004")
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql("CREATE TABLE audit_events (id INTEGER PRIMARY KEY)")
            await connection.exec_driver_sql("DROP TABLE alembic_version")
    finally:
        await engine.dispose()

    with pytest.raises(OutdatedDatabaseError):
        await run_migrate(url)


async def test_refuses_a_database_with_flags_but_without_the_versions(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)
    await asyncio.to_thread(command.upgrade, alembic_config(url), "0002")
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql("ALTER TABLE best_runs ADD COLUMN flags JSON")
            await connection.exec_driver_sql("DROP TABLE alembic_version")
    finally:
        await engine.dispose()

    with pytest.raises(OutdatedDatabaseError):
        await run_migrate(url)


async def test_refuses_a_database_with_only_one_of_the_version_columns(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)
    await asyncio.to_thread(command.upgrade, alembic_config(url), "0002")
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql(
                "ALTER TABLE best_runs ADD COLUMN sim_version INTEGER NOT NULL DEFAULT 1"
            )
            await connection.exec_driver_sql("DROP TABLE alembic_version")
    finally:
        await engine.dispose()

    with pytest.raises(OutdatedDatabaseError):
        await run_migrate(url)


async def test_refuses_a_database_from_before_the_score_column(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
            await connection.exec_driver_sql(
                "CREATE TABLE best_runs (id INTEGER PRIMARY KEY, user_id INTEGER, level_id "
                "VARCHAR(40), frames INTEGER, deaths INTEGER)"
            )
    finally:
        await engine.dispose()

    with pytest.raises(OutdatedDatabaseError):
        await run_migrate(url)


async def test_refuses_a_database_that_lacks_part_of_the_baseline(tmp_path: Path) -> None:
    url = await fresh_url(tmp_path)
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            await connection.exec_driver_sql("DROP INDEX ix_best_runs_level_score")
    finally:
        await engine.dispose()

    with pytest.raises(OutdatedDatabaseError):
        await run_migrate(url)


def test_keeps_percent_signs_of_the_database_url_intact() -> None:
    url = "postgresql+asyncpg://trust:p%40ss%25word@localhost/trusttest"

    assert alembic_config(url).get_main_option("sqlalchemy.url") == url
