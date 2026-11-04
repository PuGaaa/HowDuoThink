"""进度事实操作账本与服务端投影版本。"""

from alembic import op

revision = "0003_progress_ops"
down_revision = "0002_case_revisions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.execute("ALTER TABLE progress ADD COLUMN revision INT NOT NULL DEFAULT 0")
        op.execute(
            """CREATE TABLE IF NOT EXISTS progress_ops (
              user_id VARCHAR(64) NOT NULL,
              op_id VARCHAR(191) NOT NULL,
              kind VARCHAR(32) NOT NULL,
              payload MEDIUMTEXT NOT NULL,
              occurred_at VARCHAR(64) NOT NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (user_id, op_id)
            )"""
        )
    else:
        op.execute("ALTER TABLE progress ADD COLUMN revision INTEGER NOT NULL DEFAULT 0")
        op.execute(
            """CREATE TABLE IF NOT EXISTS progress_ops (
              user_id TEXT NOT NULL,
              op_id TEXT NOT NULL,
              kind TEXT NOT NULL,
              payload TEXT NOT NULL,
              occurred_at TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              PRIMARY KEY (user_id, op_id)
            )"""
        )


def downgrade() -> None:
    op.drop_table("progress_ops")
    with op.batch_alter_table("progress") as batch:
        batch.drop_column("revision")
