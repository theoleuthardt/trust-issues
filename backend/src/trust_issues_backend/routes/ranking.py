"""The overall ranking: who finished every level of the game, and how fast in total."""

from datetime import datetime, timedelta
from typing import Annotated

from litestar import get
from litestar.datastructures import State
from litestar.di import NamedDependency
from litestar.exceptions import ServiceUnavailableException
from litestar.params import Parameter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from trust_issues_backend.models import BestRun, User
from trust_issues_backend.schemas import RankingEntry
from trust_issues_backend.verifier import VerifierUnavailableError

LEVEL_LIST_TTL = timedelta(minutes=5)


async def current_levels(state: State) -> list[str]:
    """The level ids of the game, asked from the verifier at most every few minutes."""
    now: datetime = state.clock()
    cached = state.level_cache
    if cached is not None and now - cached[0] < LEVEL_LIST_TTL:
        return cached[1]
    async with state.level_lock:
        now = state.clock()
        cached = state.level_cache
        if cached is not None and now - cached[0] < LEVEL_LIST_TTL:
            return cached[1]
        try:
            levels = await state.verifier.levels()
        except VerifierUnavailableError as error:
            raise ServiceUnavailableException(detail="the level list is unavailable") from error
        state.level_cache = (now, levels)
        return levels


@get("/api/ranking")
async def ranking(
    session: NamedDependency[AsyncSession],
    state: State,
    limit: Annotated[int, Parameter(ge=1, le=100)] = 50,
) -> list[RankingEntry]:
    """
    Players who have a visible run on every level of the game, fewest total frames first; equal
    totals go to whoever completed the last of those levels first.
    """
    levels = await current_levels(state)
    if not levels:
        return []
    total = func.sum(BestRun.frames)
    completed = func.max(BestRun.submitted_at)
    rows = await session.execute(
        select(User.username, total, completed)
        .join(User, User.id == BestRun.user_id)
        .where(BestRun.level_id.in_(levels), BestRun.hidden.is_(False))
        .group_by(BestRun.user_id, User.username)
        .having(func.count() == len(levels))
        .order_by(total, completed, BestRun.user_id)
        .limit(limit)
    )
    return [
        RankingEntry(rank=rank, username=username, total_frames=int(frames), completed_at=at)
        for rank, (username, frames, at) in enumerate(rows, start=1)
    ]
