import logging

from litestar import Request, post
from litestar.datastructures import State
from litestar.di import NamedDependency
from litestar.exceptions import (
    ClientException,
    NotFoundException,
    ServiceUnavailableException,
    TooManyRequestsException,
)
from litestar.security.jwt import Token
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from trust_issues_backend import audit
from trust_issues_backend.models import BestRun, User, utcnow
from trust_issues_backend.observability import request_id_for
from trust_issues_backend.schemas import RunResponse, RunSubmission
from trust_issues_backend.verifier import (
    InvalidReplayError,
    OutdatedVersionError,
    UnknownLevelError,
    VerifiedRun,
    VerifierUnavailableError,
)

logger = logging.getLogger("trust_issues.runs")


async def _store_if_best(
    session: AsyncSession,
    user_id: int,
    submission: RunSubmission,
    run: VerifiedRun,
) -> tuple[BestRun, bool]:
    """Keeps the best-scoring run per user and level; returns it and whether it is new."""
    best = await session.scalar(
        select(BestRun).where(BestRun.user_id == user_id, BestRun.level_id == submission.level_id)
    )
    if best is not None and (best.score, -best.frames) >= (run.score, -run.frames):
        return best, False

    if best is None:
        best = BestRun(user_id=user_id, level_id=submission.level_id)
        session.add(best)
    best.score = run.score
    best.frames = run.frames
    best.deaths = run.deaths
    best.replay = submission.replay
    best.sim_version = submission.sim_version
    best.level_revision = submission.level_revision
    best.flags = list(run.flags)
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
    """Replays the submission on the server; time and score come from that replay only."""
    wait = state.run_limiter.hit(str(request.user.id))
    if wait is not None:
        raise TooManyRequestsException(
            detail="too many runs, please try again later",
            headers={"Retry-After": str(wait)},
        )
    request_id = request_id_for(request.scope)

    async def reject(reason: str) -> None:
        await audit.record_rejected_run(
            session,
            user_id=request.user.id,
            level_id=data.level_id,
            reason=reason,
            replay_size=len(data.replay),
            request_id=request_id,
        )

    try:
        run = await state.verifier.verify(
            data.level_id,
            data.replay,
            data.sim_version,
            data.level_revision,
            request_id=request_id,
        )
    except UnknownLevelError as error:
        await reject("unknown level")
        raise NotFoundException(detail="unknown level") from error
    except OutdatedVersionError as error:
        await reject(f"outdated version sim={data.sim_version} level={data.level_revision}")
        raise ClientException(
            detail="this version of the game is outdated, please reload the page",
            status_code=409,
        ) from error
    except InvalidReplayError as error:
        await reject(str(error))
        raise ClientException(detail=str(error), status_code=422) from error
    except VerifierUnavailableError as error:
        raise ServiceUnavailableException(detail="run verification is unavailable") from error

    if not run.finished:
        await reject("replay does not finish the level")
        raise ClientException(detail="replay does not finish the level", status_code=422)

    try:
        best, personal_best = await _store_if_best(session, request.user.id, data, run)
    except IntegrityError:
        await session.rollback()
        best, personal_best = await _store_if_best(session, request.user.id, data, run)

    if personal_best and run.flags:
        logger.warning(
            "flagged run: user=%s level=%s flags=%s frames=%s",
            request.user.id,
            data.level_id,
            ",".join(run.flags),
            run.frames,
        )

    faster = await session.scalar(
        select(func.count())
        .select_from(BestRun)
        .where(
            BestRun.level_id == data.level_id,
            BestRun.hidden.is_(False),
            or_(
                BestRun.score > best.score,
                and_(BestRun.score == best.score, BestRun.frames < best.frames),
                and_(
                    BestRun.score == best.score,
                    BestRun.frames == best.frames,
                    BestRun.submitted_at < best.submitted_at,
                ),
            ),
        )
    )
    return RunResponse(
        frames=run.frames,
        deaths=run.deaths,
        score=run.score,
        personal_best=personal_best,
        rank=(faster or 0) + 1,
    )
