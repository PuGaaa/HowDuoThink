"""articles 增加 detail 列：三段式社区文章（问题/根因/层契约）投影。"""

import sqlalchemy as sa

from alembic import op

revision = "0012_article_detail"
down_revision = "0011_app_docs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("articles", sa.Column("detail", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("articles", "detail")
