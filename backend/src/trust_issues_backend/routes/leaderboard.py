from typing import Annotated

from litestar import Request, get
from litestar.datastructures import State
from litestar.di import NamedDependency
from litestar.params import Parameter
from litestar.security.jwt import Token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from trust_issues_backend.models import BestRun, User
from trust_issues_backend.schemas import LeaderboardEntry, ProgressEntry

LevelIdParam = Annotated[str, Parameter(pattern=r"^[a-z0-9-]{1,40}$")]


@get("/api/leaderboard/{level_id:str}")
async def leaderboard(
    level_id: LevelIdParam,
    session: NamedDependency[AsyncSession],
    limit: Annotated[int, Parameter(ge=1, le=100)] = 50,
) -> list[LeaderboardEntry]:
    """Fastest verified run per player, fastest first; ties go to the earlier submission."""
    rows = await session.execute(
        select(User.username, BestRun.frames, BestRun.deaths)
        .join(User, User.id == BestRun.user_id)
        .where(BestRun.level_id == level_id)
        .order_by(BestRun.frames, BestRun.submitted_at)
        .limit(limit)
    )
    return [
        LeaderboardEntry(rank=rank, username=username, frames=frames, deaths=deaths)
        for rank, (username, frames, deaths) in enumerate(rows, start=1)
    ]


@get("/api/progress")
async def progress(
    request: Request[User, Token, State], session: NamedDependency[AsyncSession]
) -> list[ProgressEntry]:
    """Levels the caller has completed, with their best verified run."""
    rows = await session.scalars(
        select(BestRun).where(BestRun.user_id == request.user.id).order_by(BestRun.level_id)
    )
    return [
        ProgressEntry(
            level_id=run.level_id,
            frames=run.frames,
            deaths=run.deaths,
            completed_at=run.submitted_at,
        )
        for run in rows
    ]
