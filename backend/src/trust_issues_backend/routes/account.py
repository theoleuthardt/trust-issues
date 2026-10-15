import asyncio

from litestar import Request, post
from litestar.datastructures import State
from litestar.di import NamedDependency
from litestar.exceptions import ClientException
from litestar.security.jwt import Token
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from trust_issues_backend.models import BestRun, User
from trust_issues_backend.routes.auth import ensure_not_locked, register_failed_attempt
from trust_issues_backend.schemas import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    TokenResponse,
)
from trust_issues_backend.security import hash_password, verify_password


async def _confirmed_user(
    session: AsyncSession, request: Request[User, Token, State], state: State, password: str
) -> User:
    """
    Loads the caller and checks their password. A wrong password counts like a failed login,
    so a stolen token cannot be used to guess it.
    """
    user = await session.get(User, request.user.id)
    if user is None:
        raise ClientException(detail="account not found", status_code=404)
    now = state.clock()
    ensure_not_locked(user, now)
    if not await asyncio.to_thread(verify_password, user.password_hash, password):
        await register_failed_attempt(session, user, now)
        raise ClientException(detail="wrong password", status_code=403)
    return user


@post("/api/auth/logout-all", status_code=204)
async def logout_all(
    request: Request[User, Token, State], session: NamedDependency[AsyncSession]
) -> None:
    """Revokes every token of the caller, including the one used for this request."""
    user = await session.get(User, request.user.id)
    if user is not None:
        user.token_version += 1
        await session.commit()


@post("/api/auth/password", status_code=200)
async def change_password(
    data: ChangePasswordRequest,
    request: Request[User, Token, State],
    session: NamedDependency[AsyncSession],
    state: State,
) -> TokenResponse:
    """Changes the password, revokes all tokens and returns a fresh one for this session."""
    user = await _confirmed_user(session, request, state, data.current_password)
    user.password_hash = await asyncio.to_thread(hash_password, data.new_password)
    user.token_version += 1
    user.failed_logins = 0
    user.locked_until = None
    await session.commit()
    token = state.jwt_auth.create_token(
        identifier=str(user.id),
        token_expiration=state.token_lifetime,
        token_extras={"tv": user.token_version},
    )
    return TokenResponse(access_token=token)


@post("/api/auth/delete", status_code=204)
async def delete_account(
    data: DeleteAccountRequest,
    request: Request[User, Token, State],
    session: NamedDependency[AsyncSession],
    state: State,
) -> None:
    """Deletes the account and all its runs after confirming the password."""
    user = await _confirmed_user(session, request, state, data.password)
    await session.execute(delete(BestRun).where(BestRun.user_id == user.id))
    await session.delete(user)
    await session.commit()
