from litestar import Request, post
from litestar.datastructures import State
from litestar.di import NamedDependency
from litestar.exceptions import (
    ClientException,
    NotFoundException,
    ServiceUnavailableException,
)
from litestar.security.jwt import Token
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from trust_issues_backend.models import BestRun, User, utcnow
from trust_issues_backend.schemas import RunResponse, RunSubmission
from trust_issues_backend.verifier import (
    InvalidReplayError,
    UnknownLevelError,
    VerifiedRun,
    VerifierUnavailableError,
)


async def _store_if_best(
    session: AsyncSession,
    user_id: int,
    level_id: str,
    replay: list[int],
    run: VerifiedRun,
) -> tuple[BestRun, bool]:
    """Keeps the fastest run per user and level; returns the stored best and whether it is new."""
    best = await session.scalar(
        select(BestRun).where(BestRun.user_id == user_id, BestRun.level_id == level_id)
    )
    if best is not None and best.frames <= run.frames:
        return best, False

    if best is None:
        best = BestRun(user_id=user_id, level_id=level_id)
        session.add(best)
    best.frames = run.frames
    best.deaths = run.deaths
    best.replay = replay
    best.submitted_at = utcnow()
    await session.commit()
    return best, True


@post("/api/runs", status_code=201)
async def submit_run(
    data: RunSubmission,
    request: Request[User, Token, State],
    session: NamedDependency[AsyncSession],
    state: State,
) -> RunResponse:
    """Replays the submission on the server; time and deaths come from that replay only."""
    try:
        run = await state.verifier.verify(data.level_id, data.replay)
    except UnknownLevelError as error:
        raise NotFoundException(detail="unknown level") from error
    except InvalidReplayError as error:
        raise ClientException(detail=str(error), status_code=422) from error
    except VerifierUnavailableError as error:
        raise ServiceUnavailableException(detail="run verification is unavailable") from error

    if not run.finished:
        raise ClientException(detail="replay does not finish the level", status_code=422)

    try:
        best, personal_best = await _store_if_best(
            session, request.user.id, data.level_id, data.replay, run
        )
    except IntegrityError:
        await session.rollback()
        best, personal_best = await _store_if_best(
            session, request.user.id, data.level_id, data.replay, run
        )

    faster = await session.scalar(
        select(func.count())
        .select_from(BestRun)
        .where(
            BestRun.level_id == data.level_id,
            or_(
                BestRun.frames < best.frames,
                and_(BestRun.frames == best.frames, BestRun.submitted_at < best.submitted_at),
            ),
        )
    )
    return RunResponse(
        frames=run.frames,
        deaths=run.deaths,
        personal_best=personal_best,
        rank=(faster or 0) + 1,
    )
