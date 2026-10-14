import asyncio
from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from tests.conftest import TEST_DATABASE_URL, require_test_database
from trust_issues_backend.migrate import alembic_config
from trust_issues_backend.models import Base

BACKEND = Path(__file__).resolve().parents[1]


def config_for(url: str) -> Config:
    return alembic_config(url)


async def reset(url: str) -> None:
    engine = create_async_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
            await connection.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    finally:
        await engine.dispose()


async def upgraded_url(tmp_path: Path) -> str:
    url = TEST_DATABASE_URL or f"sqlite+aiosqlite:///{tmp_path / 'migrated.db'}"
    if TEST_DATABASE_URL:
        require_test_database(url)
        await reset(url)
    await asyncio.to_thread(command.upgrade, config_for(url), "head")
    return url


async def test_migrations_create_exactly_the_schema_of_the_models(tmp_path: Path) -> None:
    url = await upgraded_url(tmp_path)

    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            differences = await connection.run_sync(
                lambda sync: compare_metadata(MigrationContext.configure(sync), Base.metadata)
            )
    finally:
        await engine.dispose()

    assert differences == []


async def test_upgrade_creates_the_tables_and_records_the_revision(tmp_path: Path) -> None:
    url = await upgraded_url(tmp_path)

    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            tables = await connection.run_sync(lambda sync: set(inspect(sync).get_table_names()))
    finally:
        await engine.dispose()

    assert {"users", "best_runs", "alembic_version"} <= tables


async def test_downgrade_removes_the_tables(tmp_path: Path) -> None:
    url = await upgraded_url(tmp_path)

    await asyncio.to_thread(command.downgrade, config_for(url), "base")

    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            tables = await connection.run_sync(lambda sync: set(inspect(sync).get_table_names()))
    finally:
        await engine.dispose()
    assert "users" not in tables
    assert "best_runs" not in tables
