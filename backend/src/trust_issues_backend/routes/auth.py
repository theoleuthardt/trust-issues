import asyncio

from litestar import Request, get, post
from litestar.datastructures import State
from litestar.di import NamedDependency
from litestar.exceptions import ClientException, NotAuthorizedException
from litestar.security.jwt import Token
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

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


@post("/api/auth/login", status_code=200)
async def login(
    data: LoginRequest, session: NamedDependency[AsyncSession], state: State
) -> TokenResponse:
    """Exchanges credentials for a bearer token; unknown users and wrong passwords look alike."""
    user = await session.scalar(select(User).where(User.username_key == data.username.lower()))
    password_hash = user.password_hash if user else DUMMY_HASH
    valid = await asyncio.to_thread(verify_password, password_hash, data.password)
    if user is None or not valid:
        raise NotAuthorizedException(detail="invalid username or password")

    token = state.jwt_auth.create_token(
        identifier=str(user.id),
        token_expiration=state.token_lifetime,
        token_extras={"tv": user.token_version},
    )
    return TokenResponse(access_token=token)


@get("/api/auth/me")
async def me(request: Request[User, Token, State]) -> UserResponse:
    return UserResponse(id=request.user.id, username=request.user.username)
