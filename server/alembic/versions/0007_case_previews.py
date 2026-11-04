"""不可变案例预览快照。"""

import sqlalchemy as sa

from alembic import op

revision = "0007_case_previews"
down_revision = "0006_submission_review"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "case_previews",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("case_id", sa.String(64), nullable=False),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Index("ix_case_previews_case", "case_id"),
        sa.Index("ix_case_previews_expiry", "expires_at"),
    )


def downgrade() -> None:
    op.drop_table("case_previews")
