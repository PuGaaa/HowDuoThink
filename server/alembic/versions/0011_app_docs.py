"""应用文档表：隐私政策等长文本（管理端可编辑，未自定义时服务端回退内置默认）。

列名用 doc_key：KEY 是 MySQL 保留字，与 meta 表改列名同一原因。
"""

import sqlalchemy as sa

from alembic import op

revision = "0011_app_docs"
down_revision = "0010_pnvs_sms_challenges"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_docs",
        sa.Column("doc_key", sa.String(64), primary_key=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("updated_by", sa.String(64)),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
    )


def downgrade() -> None:
    op.drop_table("app_docs")
