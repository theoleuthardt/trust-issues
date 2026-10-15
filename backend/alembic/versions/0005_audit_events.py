"""Audit log of rejected submissions.

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("level_id", sa.String(40)),
        sa.Column("reason", sa.String(200), nullable=False),
        sa.Column("replay_size", sa.Integer()),
        sa.Column("request_id", sa.String(64)),
    )
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_created_at", table_name="audit_events")
    op.drop_table("audit_events")
