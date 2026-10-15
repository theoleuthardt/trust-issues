"""Audit log of rejected submissions, with a retention that is enforced by a background task."""

import asyncio
import logging
from collections.abc import Callable
from datetime import datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from trust_issues_backend.models import AuditEvent

logger = logging.getLogger("trust_issues.audit")

REJECTED_RUN = "run_rejected"
MAX_REASON_LENGTH = 200


async def record_rejected_run(
    session: AsyncSession,
    *,
    user_id: int,
    level_id: str,
    reason: str,
    replay_size: int,
    request_id: str,
) -> None:
    """
    Stores why a submission was refused; only sizes and the reason, never the replay. The log
    is a side record: a failed write is logged and never changes the answer to the player.
    """
    try:
        session.add(
            AuditEvent(
                kind=REJECTED_RUN,
                user_id=user_id,
                level_id=level_id,
                reason=reason[:MAX_REASON_LENGTH],
                replay_size=replay_size,
                request_id=request_id,
            )
        )
        await session.commit()
    except Exception:
        await session.rollback()
        logger.exception("recording a rejected run failed")


async def purge_expired(
    session_factory: async_sessionmaker[AsyncSession], retention: timedelta, now: datetime
) -> int:
    """Deletes events older than `retention`; returns how many were removed."""
    async with session_factory() as session:
        result = await session.execute(
            delete(AuditEvent).where(AuditEvent.created_at < now - retention)
        )
        await session.commit()
        return result.rowcount or 0


async def enforce_retention(
    session_factory: async_sessionmaker[AsyncSession],
    retention: timedelta,
    clock: Callable[[], datetime],
) -> None:
    """Purges once; a failure is logged and never stops the service."""
    try:
        removed = await purge_expired(session_factory, retention, clock())
    except Exception:
        logger.exception("purging the audit log failed")
        return
    if removed:
        logger.info("removed %s audit events past the retention", removed)


async def purge_forever(
    session_factory: async_sessionmaker[AsyncSession],
    retention: timedelta,
    interval_seconds: float,
    clock: Callable[[], datetime],
) -> None:
    """Enforces the retention every `interval_seconds` until cancelled."""
    while True:
        await asyncio.sleep(interval_seconds)
        await enforce_retention(session_factory, retention, clock)
