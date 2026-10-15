"""The order of a leaderboard and the comparisons built on it, in one place."""

import base64
import binascii
import json
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, and_, or_

from trust_issues_backend.models import BestRun

ORDER = (BestRun.score.desc(), BestRun.frames, BestRun.submitted_at, BestRun.id)


@dataclass(frozen=True, slots=True)
class Position:
    """Where a run sits in the order: enough to ask what comes before or after it."""

    score: int
    frames: int
    submitted_at: datetime
    id: int


class InvalidCursorError(Exception):
    """The cursor of a page request was not produced by this service."""


def before(position: Position) -> ColumnElement[bool]:
    """Runs that rank strictly higher than `position`."""
    return or_(
        BestRun.score > position.score,
        and_(BestRun.score == position.score, BestRun.frames < position.frames),
        and_(
            BestRun.score == position.score,
            BestRun.frames == position.frames,
            BestRun.submitted_at < position.submitted_at,
        ),
        and_(
            BestRun.score == position.score,
            BestRun.frames == position.frames,
            BestRun.submitted_at == position.submitted_at,
            BestRun.id < position.id,
        ),
    )


def after(position: Position) -> ColumnElement[bool]:
    """Runs that rank strictly lower than `position`."""
    return or_(
        BestRun.score < position.score,
        and_(BestRun.score == position.score, BestRun.frames > position.frames),
        and_(
            BestRun.score == position.score,
            BestRun.frames == position.frames,
            BestRun.submitted_at > position.submitted_at,
        ),
        and_(
            BestRun.score == position.score,
            BestRun.frames == position.frames,
            BestRun.submitted_at == position.submitted_at,
            BestRun.id > position.id,
        ),
    )


def encode_cursor(position: Position) -> str:
    """An opaque, URL-safe token for the position after which the next page starts."""
    raw = json.dumps(
        [position.score, position.frames, position.submitted_at.isoformat(), position.id]
    )
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> Position:
    """The position a cursor stands for; raises `InvalidCursorError` for anything else."""
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        score, frames, submitted_at, run_id = json.loads(raw)
        if not all(
            isinstance(value, int) and not isinstance(value, bool)
            for value in (score, frames, run_id)
        ):
            raise ValueError("numbers expected")
        return Position(score, frames, datetime.fromisoformat(submitted_at), run_id)
    except (ValueError, TypeError, binascii.Error, json.JSONDecodeError) as error:
        raise InvalidCursorError(cursor[:20]) from error
