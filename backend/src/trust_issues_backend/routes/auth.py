import asyncio
from datetime import UTC, datetime, timedelta

from litestar import Request, get, post
from litestar.datastructures import State
from litestar.di import NamedDependency
from litestar.exceptions import (
    ClientException,
    NotAuthorizedException,
    TooManyRequestsException,
)
from litestar.security.jwt import Token
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from trust_issues_backend.client_ip import client_ip
from trust_issues_backend.models import User
from trust_issues_backend.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from trust_issues_backend.security import DUMMY_HASH, hash_password, verify_password


@post("/api/auth/register", status_code=201)
async def register(data: RegisterRequest, session: NamedDependency[AsyncSession]) -> UserResponse:
    """Creates an account; usernames are unique case-insensitively."""
    key = data.username.lower()
    if await session.scalar(select(User.id).where(User.username_key == key)) is not None:
        raise ClientException(detail="username already taken", status_code=409)

    user = User(
        username=data.username,
        username_key=key,
        password_hash=await asyncio.to_thread(hash_password, data.password),
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ClientException(detail="username already taken", status_code=409) from error
    return UserResponse(id=user.id, username=user.username)


MAX_FAILED_LOGINS = 5
LOCKOUT = timedelta(minutes=15)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _too_many(seconds: int) -> TooManyRequestsException:
    return TooManyRequestsException(
        detail="too many attempts, please try again later",
        headers={"Retry-After": str(max(1, seconds))},
    )


def ensure_not_locked(user: User, now: datetime) -> None:
    """Raises 429 while the account is locked."""
    if user.locked_until is None:
        return
    remaining = (_aware(user.locked_until) - now).total_seconds()
    if remaining > 0:
        raise _too_many(int(remaining) + 1)


async def register_failed_attempt(session: AsyncSession, user: User, now: datetime) -> None:
    """Counts a wrong password and locks the account after too many."""
    user.failed_logins += 1
    if user.failed_logins >= MAX_FAILED_LOGINS:
        user.locked_until = now + LOCKOUT
        user.failed_logins = 0
    await session.commit()


@post("/api/auth/login", status_code=200)
async def login(
    data: LoginRequest, request: Request, session: NamedDependency[AsyncSession], state: State
) -> TokenResponse:
    """
    Exchanges credentials for a bearer token. Unknown users and wrong passwords look alike;
    five wrong passwords lock the account for fifteen minutes and every address is limited.
    """
    peer = request.client.host if request.client else None
    address = client_ip(peer, request.headers, state.trusted_proxies)
    wait = state.login_limiter.hit(address)
    if wait is not None:
        raise _too_many(wait)

    now: datetime = state.clock()
    user = await session.scalar(select(User).where(User.username_key == data.username.lower()))
    if user is not None:
        ensure_not_locked(user, now)

    password_hash = user.password_hash if user else DUMMY_HASH
    valid = await asyncio.to_thread(verify_password, password_hash, data.password)
    if user is None or not valid:
        if user is not None:
            await register_failed_attempt(session, user, now)
        raise NotAuthorizedException(detail="invalid username or password")

    if user.failed_logins or user.locked_until is not None:
        user.failed_logins = 0
        user.locked_until = None
        await session.commit()

    token = state.jwt_auth.create_token(
        identifier=str(user.id),
        token_expiration=state.token_lifetime,
        token_extras={"tv": user.token_version},
    )
    return TokenResponse(access_token=token)


@get("/api/auth/me")
async def me(request: Request[User, Token, State]) -> UserResponse:
    return UserResponse(id=request.user.id, username=request.user.username)
