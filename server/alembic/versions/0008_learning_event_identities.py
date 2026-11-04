"""学习事件游客档案的唯一账号归属。"""

import sqlalchemy as sa

from alembic import op

revision = "0008_learning_event_identities"
down_revision = "0007_case_previews"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learning_event_identities",
        sa.Column("anonymous_id", sa.String(191), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
    )


def downgrade() -> None:
    op.drop_table("learning_event_identities")
