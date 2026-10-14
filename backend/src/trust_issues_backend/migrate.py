"""Start-up step of the backend container: wait for the database, then migrate to head."""

import asyncio
import logging
import sys
from pathlib import Path

from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from trust_issues_backend.settings import Settings

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]


class DatabaseUnavailableError(Exception):
    """The database did not accept connections within the allowed attempts."""


async def wait_for_database(url: str, attempts: int = 30, delay: float = 1.0) -> None:
    """Returns once `SELECT 1` works; raises after `attempts` failed tries."""
    engine = create_async_engine(url)
    try:
        for attempt in range(1, attempts + 1):
            try:
                async with engine.connect() as connection:
                    await connection.execute(text("SELECT 1"))
            except Exception as error:
                if attempt == attempts:
                    raise DatabaseUnavailableError(str(error)) from error
                logger.warning("database not ready (%s), retrying", error)
                await asyncio.sleep(delay)
            else:
                return
    finally:
        await engine.dispose()


class OutdatedDatabaseError(Exception):
    """The database has tables from before migrations that do not match the baseline."""


BASELINE_COLUMNS = {
    "users": {"id", "username", "username_key", "password_hash", "token_version", "created_at"},
    "best_runs": {
        "id",
        "user_id",
        "level_id",
        "score",
        "frames",
        "deaths",
        "replay",
        "submitted_at",
    },
}
BASELINE_INDEXES = {"best_runs": {"ix_best_runs_level_score"}}
BASELINE_UNIQUE = {"users": {("username_key",)}, "best_runs": {("user_id", "level_id")}}


def alembic_config(url: str) -> Config:
    """Alembic configuration for `url`; percent signs are doubled for the config parser."""
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def _matches_baseline(sync: Connection) -> bool:
    inspector = inspect(sync)
    for table, columns in BASELINE_COLUMNS.items():
        if columns - {column["name"] for column in inspector.get_columns(table)}:
            return False
        indexes = {index["name"] for index in inspector.get_indexes(table)}
        if BASELINE_INDEXES.get(table, set()) - indexes:
            return False
        unique = {tuple(item["column_names"]) for item in inspector.get_unique_constraints(table)}
        unique |= {
            tuple(index["column_names"])
            for index in inspector.get_indexes(table)
            if index.get("unique")
        }
        if BASELINE_UNIQUE[table] - unique:
            return False
    return True


async def _state(url: str) -> str:
    """`managed`, `empty`, `legacy` (matches the baseline) or `outdated`."""
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:

            def inspect_schema(sync: Connection) -> str:
                tables = set(inspect(sync).get_table_names())
                if "alembic_version" in tables:
                    return "managed"
                if not tables & {"users", "best_runs"}:
                    return "empty"
                if {"users", "best_runs"} <= tables and _matches_baseline(sync):
                    return "legacy"
                return "outdated"

            return await connection.run_sync(inspect_schema)
    finally:
        await engine.dispose()


def migrate(url: str) -> None:
    """
    Brings the database to the newest revision. A database that was created from the models
    before migrations existed is adopted by marking it as the baseline; one that does not
    match the baseline is refused instead of being touched.
    """
    state = asyncio.run(_state(url))
    config = alembic_config(url)
    if state == "outdated":
        raise OutdatedDatabaseError(
            "the database has tables from before migrations that do not match the baseline; "
            "recreate it or migrate it by hand"
        )
    if state == "legacy":
        command.stamp(config, "0001")
    command.upgrade(config, "head")


def main() -> int:
    settings = Settings.from_env()
    asyncio.run(wait_for_database(settings.database_url))
    migrate(settings.database_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
