from typing import Annotated, Any

from litestar import Request, get
from litestar.datastructures import State
from litestar.di import NamedDependency
from litestar.exceptions import ClientException, NotFoundException, TooManyRequestsException
from litestar.params import Parameter
from litestar.security.jwt import Token
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from trust_issues_backend.client_ip import client_ip
from trust_issues_backend.models import BestRun, User
from trust_issues_backend.ranking import (
    ORDER,
    InvalidCursorError,
    Position,
    after,
    before,
    decode_cursor,
    encode_cursor,
)
from trust_issues_backend.schemas import (
    AroundMe,
    LeaderboardEntry,
    LeaderboardPage,
    Profile,
    ProfileRun,
    ProgressEntry,
    ReplayResponse,
)

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
        .order_by(*ORDER)
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


@get("/api/players/{username:str}")
async def profile(
    username: Annotated[str, Parameter(min_length=3, max_length=24, pattern=r"^[A-Za-z0-9_]+$")],
    request: Request[Any, Any, State],
    session: NamedDependency[AsyncSession],
    state: State,
) -> Profile:
    """A player's best visible run on every level they completed; only what the boards show."""
    peer = request.client.host if request.client else None
    wait = state.replay_limiter.hit(client_ip(peer, request.headers, state.trusted_proxies))
    if wait is not None:
        raise TooManyRequestsException(
            detail="too many requests, please try again later",
            headers={"Retry-After": str(max(1, wait))},
        )
    user = await session.scalar(select(User).where(User.username_key == username.lower()))
    if user is None:
        raise NotFoundException(detail="unknown player")
    runs = await session.scalars(
        select(BestRun)
        .where(BestRun.user_id == user.id, BestRun.hidden.is_(False))
        .order_by(BestRun.level_id)
    )
    return Profile(
        username=user.username,
        runs=[
            ProfileRun(
                run_id=run.id,
                level_id=run.level_id,
                score=run.score,
                frames=run.frames,
                deaths=run.deaths,
                completed_at=run.submitted_at,
            )
            for run in runs
        ],
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


def _entry(rank: int, row) -> LeaderboardEntry:
    return LeaderboardEntry(
        rank=rank,
        run_id=row.id,
        username=row.username,
        score=row.score,
        frames=row.frames,
        deaths=row.deaths,
    )


def _position(row) -> Position:
    return Position(row.score, row.frames, row.submitted_at, row.id)


def _visible(level_id: str):
    return (
        select(
            BestRun.id,
            User.username,
            BestRun.score,
            BestRun.frames,
            BestRun.deaths,
            BestRun.submitted_at,
        )
        .join(User, User.id == BestRun.user_id)
        .where(BestRun.level_id == level_id, BestRun.hidden.is_(False))
    )


async def _count_up_to(
    session: AsyncSession, level_id: str, position: Position, include_run: bool
) -> int:
    """Visible runs ranking above `position`, plus the run with its id when `include_run`."""
    condition = before(position)
    if include_run:
        condition = or_(condition, BestRun.id == position.id)
    return (
        await session.scalar(
            select(func.count())
            .select_from(BestRun)
            .where(BestRun.level_id == level_id, BestRun.hidden.is_(False), condition)
        )
        or 0
    )


@get("/api/leaderboard/{level_id:str}/page")
async def leaderboard_page(
    level_id: LevelIdParam,
    session: NamedDependency[AsyncSession],
    limit: Annotated[int, Parameter(ge=1, le=100)] = 25,
    cursor: str | None = None,
) -> LeaderboardPage:
    """
    One page of the leaderboard. `next_cursor` continues right after the last entry, so
    nobody is repeated, and everyone who stays below the cursor is returned exactly once.
    A run that improves past the cursor while paging belongs to the part already shown and
    is not returned again; ranks are computed fresh for every page.
    """
    query = _visible(level_id)
    first_rank = 1
    if cursor is not None:
        try:
            position = decode_cursor(cursor)
        except InvalidCursorError as error:
            raise ClientException(detail="invalid cursor", status_code=400) from error
        query = query.where(after(position))
        first_rank = await _count_up_to(session, level_id, position, include_run=True) + 1
    rows = list((await session.execute(query.order_by(*ORDER).limit(limit + 1))).all())
    page = rows[:limit]
    return LeaderboardPage(
        entries=[_entry(first_rank + index, row) for index, row in enumerate(page)],
        next_cursor=encode_cursor(_position(page[-1])) if len(rows) > limit else None,
    )


@get("/api/leaderboard/{level_id:str}/around-me")
async def around_me(
    level_id: LevelIdParam,
    request: Request[User, Token, State],
    session: NamedDependency[AsyncSession],
    radius: Annotated[int, Parameter(ge=1, le=25)] = 5,
) -> AroundMe:
    """The caller's run with `radius` runs above and below it, each with its rank."""
    mine = (
        await session.execute(_visible(level_id).where(BestRun.user_id == request.user.id))
    ).first()
    if mine is None:
        raise NotFoundException(detail="no run on this level")
    position = _position(mine)
    rank = await _count_up_to(session, level_id, position, include_run=False) + 1

    above = list(
        (
            await session.execute(
                _visible(level_id)
                .where(before(position))
                .order_by(
                    BestRun.score.asc(),
                    BestRun.frames.desc(),
                    BestRun.submitted_at.desc(),
                    BestRun.id.desc(),
                )
                .limit(radius)
            )
        ).all()
    )[::-1]
    below = list(
        (
            await session.execute(
                _visible(level_id).where(after(position)).order_by(*ORDER).limit(radius)
            )
        ).all()
    )
    entries = [_entry(rank - len(above) + index, row) for index, row in enumerate(above)]
    entries.append(_entry(rank, mine))
    entries.extend(_entry(rank + 1 + index, row) for index, row in enumerate(below))
    return AroundMe(rank=rank, entries=entries)
