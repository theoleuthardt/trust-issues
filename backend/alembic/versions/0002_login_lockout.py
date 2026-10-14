"""Count failed logins and lock accounts.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as table:
        table.add_column(
            sa.Column("failed_logins", sa.Integer(), nullable=False, server_default="0")
        )
        table.add_column(sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as table:
        table.drop_column("locked_until")
        table.drop_column("failed_logins")
