"""Moderation: list runs and users, hide, delete and flag. Every action is audited."""

from typing import Annotated

from litestar import Request, get, post
from litestar.connection import ASGIConnection
from litestar.datastructures import State
from litestar.di import NamedDependency
from litestar.exceptions import NotFoundException, PermissionDeniedException
from litestar.handlers import BaseRouteHandler
from litestar.params import Parameter
from litestar.security.jwt import Token
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from trust_issues_backend.models import AuditEvent, BestRun, User
from trust_issues_backend.schemas import AdminRun, AdminUser, ModerationNote

MODERATION = "moderation_"
RowId = Annotated[int, Parameter(ge=1, le=2_147_483_647)]


def admin_only(connection: ASGIConnection, _: BaseRouteHandler) -> None:
    """Guard: the user of the request must carry the admin flag, read fresh for every request."""
    if not getattr(connection.user, "is_admin", False):
        raise PermissionDeniedException(detail="admin only")


def _record(
    session: AsyncSession,
    actor: User,
    action: str,
    target_user_id: int,
    level_id: str | None,
    note: ModerationNote,
) -> None:
    session.add(
        AuditEvent(
            kind=f"{MODERATION}{action}",
            actor_id=actor.id,
            user_id=target_user_id,
            level_id=level_id,
            reason=note.reason,
        )
    )


@get("/api/admin/runs", guards=[admin_only])
async def list_runs(
    session: NamedDependency[AsyncSession],
    level_id: Annotated[str | None, Parameter(pattern=r"^[a-z0-9-]{1,40}$")] = None,
    flagged: bool = False,
    limit: Annotated[int, Parameter(ge=1, le=500)] = 100,
) -> list[AdminRun]:
    """Best runs, newest first; `flagged=true` keeps only runs the verifier flagged."""
    query = (
        select(BestRun, User.username)
        .join(User, User.id == BestRun.user_id)
        .order_by(BestRun.submitted_at.desc(), BestRun.id.desc())
        .limit(limit)
    )
    if level_id is not None:
        query = query.where(BestRun.level_id == level_id)
    if flagged:
        query = query.where(func.json_array_length(BestRun.flags) > 0)
    rows = await session.execute(query)
    return [
        AdminRun(
            id=run.id,
            user_id=run.user_id,
            username=username,
            level_id=run.level_id,
            score=run.score,
            frames=run.frames,
            deaths=run.deaths,
            flags=list(run.flags),
            hidden=run.hidden,
            sim_version=run.sim_version,
            level_revision=run.level_revision,
            submitted_at=run.submitted_at,
        )
        for run, username in rows
    ]


@get("/api/admin/users", guards=[admin_only])
async def list_users(
    session: NamedDependency[AsyncSession],
    flagged: bool = False,
    limit: Annotated[int, Parameter(ge=1, le=500)] = 100,
) -> list[AdminUser]:
    """Users, newest first; `flagged=true` keeps only the ones a moderator flagged."""
    query = select(User).order_by(User.id.desc()).limit(limit)
    if flagged:
        query = query.where(User.flagged.is_(True))
    return [
        AdminUser(
            id=user.id,
            username=user.username,
            is_admin=user.is_admin,
            flagged=user.flagged,
            created_at=user.created_at,
        )
        for user in await session.scalars(query)
    ]


async def _run_or_404(session: AsyncSession, run_id: int) -> BestRun:
    run = await session.get(BestRun, run_id)
    if run is None:
        raise NotFoundException(detail="unknown run")
    return run


async def _user_or_404(session: AsyncSession, user_id: int) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundException(detail="unknown user")
    return user


@post("/api/admin/runs/{run_id:int}/hide", status_code=204, guards=[admin_only])
async def hide_run(
    run_id: RowId,
    data: ModerationNote,
    request: Request[User, Token, State],
    session: NamedDependency[AsyncSession],
) -> None:
    """Takes a run off the leaderboard; the player keeps the level as completed."""
    run = await _run_or_404(session, run_id)
    run.hidden = True
    _record(session, request.user, "hide", run.user_id, run.level_id, data)
    await session.commit()


@post("/api/admin/runs/{run_id:int}/unhide", status_code=204, guards=[admin_only])
async def unhide_run(
    run_id: RowId,
    data: ModerationNote,
    request: Request[User, Token, State],
    session: NamedDependency[AsyncSession],
) -> None:
    """Puts a hidden run back on the leaderboard."""
    run = await _run_or_404(session, run_id)
    run.hidden = False
    _record(session, request.user, "unhide", run.user_id, run.level_id, data)
    await session.commit()


@post("/api/admin/runs/{run_id:int}/delete", status_code=204, guards=[admin_only])
async def delete_run(
    run_id: RowId,
    data: ModerationNote,
    request: Request[User, Token, State],
    session: NamedDependency[AsyncSession],
) -> None:
    """Removes a run for good; the player has to complete the level again."""
    run = await _run_or_404(session, run_id)
    _record(session, request.user, "delete", run.user_id, run.level_id, data)
    await session.delete(run)
    await session.commit()


@post("/api/admin/users/{user_id:int}/flag", status_code=204, guards=[admin_only])
async def flag_user(
    user_id: RowId,
    data: ModerationNote,
    request: Request[User, Token, State],
    session: NamedDependency[AsyncSession],
) -> None:
    """Marks a user for review; it changes nothing for the player."""
    user = await _user_or_404(session, user_id)
    user.flagged = True
    _record(session, request.user, "flag_user", user.id, None, data)
    await session.commit()


@post("/api/admin/users/{user_id:int}/unflag", status_code=204, guards=[admin_only])
async def unflag_user(
    user_id: RowId,
    data: ModerationNote,
    request: Request[User, Token, State],
    session: NamedDependency[AsyncSession],
) -> None:
    """Clears the review mark of a user."""
    user = await _user_or_404(session, user_id)
    user.flagged = False
    _record(session, request.user, "unflag_user", user.id, None, data)
    await session.commit()
