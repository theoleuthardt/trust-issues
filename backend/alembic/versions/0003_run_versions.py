"""Record the simulation version and level revision a best run was verified against.

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("best_runs") as table:
        table.add_column(sa.Column("sim_version", sa.Integer(), nullable=False, server_default="1"))
        table.add_column(
            sa.Column("level_revision", sa.Integer(), nullable=False, server_default="1")
        )


def downgrade() -> None:
    with op.batch_alter_table("best_runs") as table:
        table.drop_column("level_revision")
        table.drop_column("sim_version")
