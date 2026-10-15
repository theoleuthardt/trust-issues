from typing import Annotated, Any

from litestar import Request, get
from litestar.datastructures import State
from litestar.di import NamedDependency
from litestar.exceptions import NotFoundException, TooManyRequestsException
from litestar.params import Parameter
from litestar.security.jwt import Token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from trust_issues_backend.client_ip import client_ip
from trust_issues_backend.models import BestRun, User
from trust_issues_backend.schemas import LeaderboardEntry, ProgressEntry, ReplayResponse

LevelIdParam = Annotated[str, Parameter(pattern=r"^[a-z0-9-]{1,40}$")]


@get("/api/leaderboard/{level_id:str}")
async def leaderboard(
    level_id: LevelIdParam,
    session: NamedDependency[AsyncSession],
    limit: Annotated[int, Parameter(ge=1, le=100)] = 50,
) -> list[LeaderboardEntry]:
    """Best verified run per player, highest score first, then fastest, then earliest."""
    rows = await session.execute(
        select(BestRun.id, User.username, BestRun.score, BestRun.frames, BestRun.deaths)
        .join(User, User.id == BestRun.user_id)
        .where(BestRun.level_id == level_id, BestRun.hidden.is_(False))
        .order_by(BestRun.score.desc(), BestRun.frames, BestRun.submitted_at)
        .limit(limit)
    )
    return [
        LeaderboardEntry(
            rank=rank,
            run_id=run_id,
            username=username,
            score=score,
            frames=frames,
            deaths=deaths,
        )
        for rank, (run_id, username, score, frames, deaths) in enumerate(rows, start=1)
    ]


@get("/api/replays/{run_id:int}")
async def replay(
    run_id: Annotated[int, Parameter(ge=1, le=2_147_483_647)],
    request: Request[Any, Any, State],
    session: NamedDependency[AsyncSession],
    state: State,
) -> ReplayResponse:
    """The stored replay of a run that is on the leaderboard; public, so anyone can check it."""
    peer = request.client.host if request.client else None
    wait = state.replay_limiter.hit(client_ip(peer, request.headers, state.trusted_proxies))
    if wait is not None:
        raise TooManyRequestsException(
            detail="too many requests, please try again later",
            headers={"Retry-After": str(max(1, wait))},
        )
    row = (
        await session.execute(
            select(BestRun, User.username)
            .join(User, User.id == BestRun.user_id)
            .where(BestRun.id == run_id, BestRun.hidden.is_(False))
        )
    ).first()
    if row is None:
        raise NotFoundException(detail="unknown run")
    run, username = row
    return ReplayResponse(
        run_id=run.id,
        level_id=run.level_id,
        username=username,
        score=run.score,
        frames=run.frames,
        deaths=run.deaths,
        replay=list(run.replay),
        sim_version=run.sim_version,
        level_revision=run.level_revision,
    )


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
            score=run.score,
            frames=run.frames,
            deaths=run.deaths,
            completed_at=run.submitted_at,
        )
        for run in rows
    ]
