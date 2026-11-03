"""双引擎基线迁移：与 legacy core/db.py init() 建出的库完全等价（对拍测试把守）。

DDL 逐字移植自 git show fce2645:server/core/db.py：
- sqlite 分支 = SCHEMA 的 17 条 + init() 对新库执行的轻迁移 3 条（users 补
  password_hash / phone 两列 + idx_users_phone 部分唯一索引）。顺序必须一致：
  SQLite 会把 ALTER ADD COLUMN 追加进原建表文本，乱序则 sqlite_master 存储的
  CREATE 文本与 legacy 不再逐字节相同。
- mysql 分支 = SCHEMA_MYSQL 的 14 条（users 建表已内联 password_hash/phone
  与 UNIQUE KEY ux_users_phone / INDEX 内联写法）。

约定（全局约束的唯一例外）：versions/*.py 按 op.get_bind().dialect.name 写双引擎
分支；每条 DDL 独立一个 op.execute，禁止两条 CREATE 共用一个 execute 字符串。

Revision ID: 0001_baseline
Revises:
Create Date: 2026-11-03
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

SQLITE_DDL: list[str] = [
    """CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)""",
    """CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  symptom TEXT NOT NULL,
  resolution TEXT NOT NULL,
  key_error TEXT,
  timeline TEXT,
  lessons TEXT NOT NULL DEFAULT '[]',
  stack_tags TEXT NOT NULL DEFAULT '[]',
  domain_hint TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
)""",
    """CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  submission_id TEXT,
  author_id TEXT,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  layer TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
)""",
    """CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  layer TEXT NOT NULL,
  domain TEXT NOT NULL,
  steps TEXT NOT NULL,
  lessons TEXT NOT NULL DEFAULT '[]',
  author TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
)""",
    """CREATE TABLE IF NOT EXISTS sms_codes (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)""",
    """CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)""",
    """CREATE TABLE IF NOT EXISTS meta (
  meta_key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)""",
    """CREATE TABLE IF NOT EXISTS ai_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_kind TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)""",
    """CREATE UNIQUE INDEX IF NOT EXISTS ux_ai ON ai_index(source_type, source_id, chunk_kind)""",
    """CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT,
  kind TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)""",
    """CREATE INDEX IF NOT EXISTS ix_ai_usage_created ON ai_usage(created_at)""",
    """CREATE TABLE IF NOT EXISTS user_activity (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, day)
)""",
    """CREATE TABLE IF NOT EXISTS ops_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  avg_ms INTEGER NOT NULL DEFAULT 0,
  rss_mb REAL NOT NULL DEFAULT 0,
  disk_free_mb REAL NOT NULL DEFAULT 0
)""",
    """CREATE TABLE IF NOT EXISTS settings (
  setting_key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
)""",
    """CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'misc',
  content_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)""",
    """CREATE INDEX IF NOT EXISTS ix_assets_category ON assets(category)""",
    """CREATE TABLE IF NOT EXISTS resource_slots (
  slot TEXT PRIMARY KEY,
  asset_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
)""",
    """ALTER TABLE users ADD COLUMN password_hash TEXT""",
    """ALTER TABLE users ADD COLUMN phone TEXT""",
    """CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL""",
]

MYSQL_DDL: list[str] = [
    """CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  login VARCHAR(191) UNIQUE NOT NULL,
  name VARCHAR(191),
  avatar VARCHAR(512),
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  password_hash VARCHAR(255),
  phone VARCHAR(32),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_users_phone (phone)
)""",
    """CREATE TABLE IF NOT EXISTS submissions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(191) NOT NULL,
  symptom MEDIUMTEXT NOT NULL,
  resolution MEDIUMTEXT NOT NULL,
  key_error MEDIUMTEXT,
  timeline VARCHAR(512),
  lessons MEDIUMTEXT NOT NULL DEFAULT ('[]'),
  stack_tags MEDIUMTEXT NOT NULL DEFAULT ('[]'),
  domain_hint VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  review_note VARCHAR(1024),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL
)""",
    """CREATE TABLE IF NOT EXISTS cases (
  id VARCHAR(64) PRIMARY KEY,
  submission_id VARCHAR(64),
  author_id VARCHAR(64),
  title VARCHAR(191) NOT NULL,
  domain VARCHAR(64) NOT NULL,
  layer VARCHAR(191) NOT NULL,
  difficulty INT NOT NULL,
  version INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'published',
  payload MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME NULL
)""",
    """CREATE TABLE IF NOT EXISTS articles (
  id VARCHAR(64) PRIMARY KEY,
  source_type VARCHAR(32) NOT NULL,
  source_id VARCHAR(64) NOT NULL,
  title VARCHAR(191) NOT NULL,
  layer VARCHAR(191) NOT NULL,
  domain VARCHAR(64) NOT NULL,
  steps MEDIUMTEXT NOT NULL,
  lessons MEDIUMTEXT NOT NULL,
  author VARCHAR(191) NOT NULL,
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)""",
    """CREATE TABLE IF NOT EXISTS sms_codes (
  phone VARCHAR(32) PRIMARY KEY,
  code VARCHAR(16) NOT NULL,
  expires_at BIGINT NOT NULL,
  used TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)""",
    """CREATE TABLE IF NOT EXISTS progress (
  user_id VARCHAR(64) PRIMARY KEY,
  payload MEDIUMTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)""",
    """CREATE TABLE IF NOT EXISTS meta (
  meta_key VARCHAR(64) PRIMARY KEY,
  value MEDIUMTEXT NOT NULL
)""",
    """CREATE TABLE IF NOT EXISTS ai_index (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_type VARCHAR(32) NOT NULL,
  source_id VARCHAR(64) NOT NULL,
  chunk_kind VARCHAR(32) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  embedding MEDIUMTEXT NOT NULL,
  model VARCHAR(128) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_ai (source_type, source_id, chunk_kind)
)""",
    """CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(64),
  kind VARCHAR(32) NOT NULL,
  prompt_tokens BIGINT NOT NULL DEFAULT 0,
  completion_tokens BIGINT NOT NULL DEFAULT 0,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  ok TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_ai_usage_created (created_at)
)""",
    """CREATE TABLE IF NOT EXISTS user_activity (
  user_id VARCHAR(64) NOT NULL,
  day VARCHAR(10) NOT NULL,
  hits BIGINT NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, day)
)""",
    """CREATE TABLE IF NOT EXISTS ops_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requests BIGINT NOT NULL DEFAULT 0,
  errors BIGINT NOT NULL DEFAULT 0,
  avg_ms BIGINT NOT NULL DEFAULT 0,
  rss_mb DOUBLE NOT NULL DEFAULT 0,
  disk_free_mb DOUBLE NOT NULL DEFAULT 0
)""",
    """CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  value MEDIUMTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(64)
)""",
    """CREATE TABLE IF NOT EXISTS assets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  object_key VARCHAR(512) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'misc',
  content_type VARCHAR(128) NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256 CHAR(64) NOT NULL DEFAULT '',
  note VARCHAR(512) NOT NULL DEFAULT '',
  uploaded_by VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_assets_object_key (object_key),
  INDEX ix_assets_category (category)
)""",
    """CREATE TABLE IF NOT EXISTS resource_slots (
  slot VARCHAR(64) PRIMARY KEY,
  asset_id BIGINT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(64)
)""",
]


def upgrade() -> None:
    """按引擎分支逐条执行基线 DDL（幂等：全部带 IF NOT EXISTS 或对全新库执行）。"""
    dialect = op.get_bind().dialect.name
    for stmt in MYSQL_DDL if dialect == "mysql" else SQLITE_DDL:
        op.execute(stmt)


def downgrade() -> None:
    """按 sqlite_master / information_schema 查现存业务表逐个 DROP（幂等，不删 alembic_version）。"""
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        rows = bind.execute(
            sa.text(
                "SELECT TABLE_NAME AS name FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME != 'alembic_version'"
            )
        ).fetchall()
        # 本基线无外键，但按表名查出的删除顺序不保证拓扑序，关检查更稳
        op.execute("SET FOREIGN_KEY_CHECKS=0")
        for row in rows:
            op.execute(f"DROP TABLE IF EXISTS `{row[0]}`")
        op.execute("SET FOREIGN_KEY_CHECKS=1")
        return
    rows = bind.execute(
        sa.text(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT IN ('alembic_version', 'sqlite_sequence', 'sqlite_stat1')"
        )
    ).fetchall()
    for row in rows:
        op.execute(f'DROP TABLE IF EXISTS "{row[0]}"')
