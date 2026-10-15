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
REVISION_COLUMNS: tuple[tuple[str, str, frozenset[str]], ...] = (
    ("0002", "users", frozenset({"failed_logins", "locked_until"})),
    ("0003", "best_runs", frozenset({"sim_version", "level_revision"})),
    ("0004", "best_runs", frozenset({"flags"})),
    (
        "0005",
        "audit_events",
        frozenset(
            {
                "id",
                "created_at",
                "kind",
                "user_id",
                "level_id",
                "reason",
                "replay_size",
                "request_id",
            }
        ),
    ),
)


def alembic_config(url: str) -> Config:
    """Alembic configuration for `url`; percent signs are doubled for the config parser."""
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def _adoptable_revision(sync: Connection) -> str | None:
    """
    The revision a database created from the models corresponds to: the newest one whose
    columns are all there while every later one has none of its columns. None when a
    revision is only partly there or a later one is applied without an earlier one.
    """
    inspector = inspect(sync)
    for table, columns in BASELINE_COLUMNS.items():
        if columns - {column["name"] for column in inspector.get_columns(table)}:
            return None
        indexes = {index["name"] for index in inspector.get_indexes(table)}
        if BASELINE_INDEXES.get(table, set()) - indexes:
            return None
        unique = {tuple(item["column_names"]) for item in inspector.get_unique_constraints(table)}
        unique |= {
            tuple(index["column_names"])
            for index in inspector.get_indexes(table)
            if index.get("unique")
        }
        if BASELINE_UNIQUE[table] - unique:
            return None
    adopted = "0001"
    gap = False
    tables = set(inspector.get_table_names())
    for revision, table, columns in REVISION_COLUMNS:
        actual = (
            {column["name"] for column in inspector.get_columns(table)}
            if table in tables
            else set()
        )
        present = columns & actual
        if present and present != columns:
            return None
        if present and gap:
            return None
        if present:
            adopted = revision
        else:
            gap = True
    return adopted


async def _state(url: str) -> tuple[str, str | None]:
    """`managed`, `empty`, `legacy` (with the revision it matches) or `outdated`."""
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:

            def inspect_schema(sync: Connection) -> tuple[str, str | None]:
                tables = set(inspect(sync).get_table_names())
                if "alembic_version" in tables:
                    return "managed", None
                if not tables & {"users", "best_runs"}:
                    return "empty", None
                if {"users", "best_runs"} <= tables:
                    revision = _adoptable_revision(sync)
                    if revision is not None:
                        return "legacy", revision
                return "outdated", None

            return await connection.run_sync(inspect_schema)
    finally:
        await engine.dispose()


def migrate(url: str) -> None:
    """
    Brings the database to the newest revision. A database that was created from the models
    before migrations existed is adopted by marking it as the baseline; one that does not
    match the baseline is refused instead of being touched.
    """
    state, revision = asyncio.run(_state(url))
    config = alembic_config(url)
    if state == "outdated":
        raise OutdatedDatabaseError(
            "the database has tables from before migrations that do not match the baseline; "
            "recreate it or migrate it by hand"
        )
    if state == "legacy" and revision is not None:
        command.stamp(config, revision)
    command.upgrade(config, "head")


def main() -> int:
    settings = Settings.from_env()
    asyncio.run(wait_for_database(settings.database_url))
    migrate(settings.database_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
