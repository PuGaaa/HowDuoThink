"""案例单题修订、来源元数据与索引任务。

Revision ID: 0002_case_revisions
Revises: 0001_baseline
"""

import sqlalchemy as sa

from alembic import op

revision = "0002_case_revisions"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cases", sa.Column("content_revision", sa.Integer(), nullable=True))
    op.add_column("cases", sa.Column("source_type", sa.String(length=32), nullable=True))
    op.add_column("cases", sa.Column("source_commit", sa.String(length=191), nullable=True))
    op.execute("UPDATE cases SET content_revision=1 WHERE status='published' AND content_revision IS NULL")
    op.create_table(
        "index_tasks",
        sa.Column("id", sa.String(length=191), primary_key=True),
        sa.Column("case_id", sa.String(length=64), nullable=False),
        sa.Column("content_revision", sa.Integer(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("case_id", "content_revision", name="ux_index_tasks_case_revision"),
    )


def downgrade() -> None:
    op.drop_table("index_tasks")
    op.drop_column("cases", "source_commit")
    op.drop_column("cases", "source_type")
    op.drop_column("cases", "content_revision")
