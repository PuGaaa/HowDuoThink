"""学习事件明细：结束局由进度事实操作唯一产生。"""

from alembic import op

revision = "0004_learning_events"
down_revision = "0003_progress_ops"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.execute(
            """CREATE TABLE IF NOT EXISTS learning_events (
              id VARCHAR(191) PRIMARY KEY,
              user_id VARCHAR(64) NOT NULL,
              anonymous_id VARCHAR(191),
              kind VARCHAR(64) NOT NULL,
              occurred_at VARCHAR(64) NOT NULL,
              payload MEDIUMTEXT NOT NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX ix_learning_events_kind_time (kind, occurred_at),
              INDEX ix_learning_events_user_time (user_id, occurred_at)
            )"""
        )
    else:
        op.execute(
            """CREATE TABLE IF NOT EXISTS learning_events (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              anonymous_id TEXT,
              kind TEXT NOT NULL,
              occurred_at TEXT NOT NULL,
              payload TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )"""
        )
        op.execute("CREATE INDEX IF NOT EXISTS ix_learning_events_kind_time ON learning_events(kind, occurred_at)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_learning_events_user_time ON learning_events(user_id, occurred_at)")


def downgrade() -> None:
    op.drop_table("learning_events")
