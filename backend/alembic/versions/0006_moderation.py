"""Admin flag, user flag, hidden runs and the actor of audit events.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as table:
        table.add_column(
            sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        table.add_column(
            sa.Column("flagged", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    with op.batch_alter_table("best_runs") as table:
        table.add_column(
            sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    with op.batch_alter_table("audit_events") as table:
        table.add_column(sa.Column("actor_id", sa.Integer(), nullable=True))
        table.create_foreign_key(
            "fk_audit_events_actor_id_users", "users", ["actor_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    with op.batch_alter_table("audit_events") as table:
        table.drop_constraint("fk_audit_events_actor_id_users", type_="foreignkey")
        table.drop_column("actor_id")
    with op.batch_alter_table("best_runs") as table:
        table.drop_column("hidden")
    with op.batch_alter_table("users") as table:
        table.drop_column("flagged")
        table.drop_column("is_admin")
