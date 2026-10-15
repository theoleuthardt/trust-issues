"""Request and response bodies. msgspec validates every constraint at the boundary."""

from datetime import datetime
from typing import Annotated

from msgspec import Meta, Struct

MAX_REPLAY_VALUES = 20_000

Username = Annotated[str, Meta(min_length=3, max_length=24, pattern=r"^[A-Za-z0-9_]+$")]
Password = Annotated[str, Meta(min_length=12, max_length=128)]
LevelId = Annotated[str, Meta(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")]
Replay = Annotated[list[int], Meta(max_length=MAX_REPLAY_VALUES)]
Version = Annotated[int, Meta(ge=1, le=1_000_000)]


class RegisterRequest(Struct):
    username: Username
    password: Password


class LoginRequest(Struct):
    username: Annotated[str, Meta(max_length=64)]
    password: Annotated[str, Meta(max_length=128)]


class ChangePasswordRequest(Struct):
    current_password: Annotated[str, Meta(max_length=128)]
    new_password: Password


class DeleteAccountRequest(Struct):
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
    sim_version: Version
    level_revision: Version


class ModerationNote(Struct):
    reason: Annotated[str, Meta(max_length=200)] = ""


class AdminRun(Struct):
    id: int
    user_id: int
    username: str
    level_id: str
    score: int
    frames: int
    deaths: int
    flags: list[str]
    hidden: bool
    sim_version: int
    level_revision: int
    submitted_at: datetime


class AdminUser(Struct):
    id: int
    username: str
    is_admin: bool
    flagged: bool
    created_at: datetime


class RunResponse(Struct):
    frames: int
    deaths: int
    score: int
    personal_best: bool
    rank: int


class LeaderboardEntry(Struct):
    rank: int
    run_id: int
    username: str
    score: int
    frames: int
    deaths: int


class LeaderboardPage(Struct):
    entries: list[LeaderboardEntry]
    next_cursor: str | None


class RankingEntry(Struct):
    rank: int
    username: str
    total_frames: int
    completed_at: datetime


class ProfileRun(Struct):
    run_id: int
    level_id: str
    score: int
    frames: int
    deaths: int
    completed_at: datetime


class Profile(Struct):
    username: str
    runs: list[ProfileRun]


class AroundMe(Struct):
    rank: int
    entries: list[LeaderboardEntry]


class ReplayResponse(Struct):
    run_id: int
    level_id: str
    username: str
    score: int
    frames: int
    deaths: int
    replay: list[int]
    sim_version: int
    level_revision: int


class ProgressEntry(Struct):
    level_id: str
    score: int
    frames: int
    deaths: int
    completed_at: datetime
