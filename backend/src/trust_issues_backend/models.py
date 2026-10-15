"""SQLAlchemy models."""

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(24))
    username_key: Mapped[str] = mapped_column(String(24), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    flagged: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BestRun(Base):
    """Best-scoring verified run of one user on one level; also the completion record."""

    __tablename__ = "best_runs"
    __table_args__ = (
        UniqueConstraint("user_id", "level_id", name="uq_best_runs_user_level"),
        Index("ix_best_runs_level_score", "level_id", "score"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    level_id: Mapped[str] = mapped_column(String(40))
    score: Mapped[int] = mapped_column(Integer)
    frames: Mapped[int] = mapped_column(Integer)
    deaths: Mapped[int] = mapped_column(Integer)
    replay: Mapped[list[int]] = mapped_column(JSON)
    sim_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    level_revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    flags: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditEvent(Base):
    """
    One thing worth knowing about what is thrown at the API, for example a rejected run. It
    holds a user id, a level id, a short reason and sizes, never a replay or a credential.
    """

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    kind: Mapped[str] = mapped_column(String(40))
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    level_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reason: Mapped[str] = mapped_column(String(200))
    replay_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
