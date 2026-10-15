"""Mark best runs the verifier found suspicious.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("best_runs") as table:
        table.add_column(sa.Column("flags", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    with op.batch_alter_table("best_runs") as table:
        table.drop_column("flags")
