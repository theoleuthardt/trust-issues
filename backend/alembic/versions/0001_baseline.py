"""Baseline: users and best runs.

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(24), nullable=False),
        sa.Column("username_key", sa.String(24), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("username_key"),
    )
    op.create_table(
        "best_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("level_id", sa.String(40), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("frames", sa.Integer(), nullable=False),
        sa.Column("deaths", sa.Integer(), nullable=False),
        sa.Column("replay", sa.JSON(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "level_id", name="uq_best_runs_user_level"),
    )
    op.create_index("ix_best_runs_level_score", "best_runs", ["level_id", "score"])


def downgrade() -> None:
    op.drop_index("ix_best_runs_level_score", table_name="best_runs")
    op.drop_table("best_runs")
    op.drop_table("users")
