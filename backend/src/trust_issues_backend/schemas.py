"""Request and response bodies. msgspec validates every constraint at the boundary."""

from datetime import datetime
from typing import Annotated

from msgspec import Meta, Struct

MAX_REPLAY_VALUES = 20_000

Username = Annotated[str, Meta(min_length=3, max_length=24, pattern=r"^[A-Za-z0-9_]+$")]
Password = Annotated[str, Meta(min_length=12, max_length=128)]
LevelId = Annotated[str, Meta(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")]
Replay = Annotated[list[int], Meta(max_length=MAX_REPLAY_VALUES)]


class RegisterRequest(Struct):
    username: Username
    password: Password


class LoginRequest(Struct):
    username: Annotated[str, Meta(max_length=64)]
    password: Annotated[str, Meta(max_length=128)]


class TokenResponse(Struct):
    access_token: str
    token_type: str = "bearer"


class UserResponse(Struct):
    id: int
    username: str


class RunSubmission(Struct):
    level_id: LevelId
    replay: Replay


class RunResponse(Struct):
    frames: int
    deaths: int
    personal_best: bool
    rank: int


class LeaderboardEntry(Struct):
    rank: int
    username: str
    frames: int
    deaths: int


class ProgressEntry(Struct):
    level_id: str
    frames: int
    deaths: int
    completed_at: datetime
