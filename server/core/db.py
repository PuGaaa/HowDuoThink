"""数据库访问层：双引擎。

默认 SQLite（WAL，零部署，dev/测试/单机）；DB_PROVIDER=mysql 时切 MySQL 8（生产多用户）。
feature 层 SQL 一律用 SQLite 方言书写（? 占位、datetime('now')、ON CONFLICT ... DO UPDATE SET
col=excluded.col），MySQL 引擎在执行前统一翻译——方言规则集中在本文件，features 不感知。

翻译规则（MySQL 引擎）：
  ?                          → %s
  datetime('now')            → NOW()
  ON CONFLICT (cols) DO UPDATE SET col=excluded.col, ...
                             → ON DUPLICATE KEY UPDATE col=VALUES(col), ...
  meta 表的 key 列           → meta_key（KEY 是 MySQL 保留字，建库时即改名）
"""
import datetime
import json
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from typing import Iterator

import core.config as config

DB_PATH = Path(__file__).parent.parent / "data.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS submissions (
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
);
CREATE TABLE IF NOT EXISTS cases (
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
);
CREATE TABLE IF NOT EXISTS articles (
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
);
CREATE TABLE IF NOT EXISTS sms_codes (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meta (
  meta_key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_kind TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai ON ai_index(source_type, source_id, chunk_kind);
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT,
  kind TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_ai_usage_created ON ai_usage(created_at);
"""

# MySQL 建库脚本：key 是保留字 → meta 主键列名为 meta_key；日期列用 DATETIME（默认 CURRENT_TIMESTAMP）
SCHEMA_MYSQL = """
CREATE TABLE IF NOT EXISTS users (
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
);
CREATE TABLE IF NOT EXISTS submissions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(191) NOT NULL,
  symptom MEDIUMTEXT NOT NULL,
  resolution MEDIUMTEXT NOT NULL,
  key_error MEDIUMTEXT,
  timeline VARCHAR(512),
  lessons MEDIUMTEXT NOT NULL,
  stack_tags MEDIUMTEXT NOT NULL,
  domain_hint VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  review_note VARCHAR(1024),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL
);
CREATE TABLE IF NOT EXISTS cases (
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
);
CREATE TABLE IF NOT EXISTS articles (
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
);
CREATE TABLE IF NOT EXISTS sms_codes (
  phone VARCHAR(32) PRIMARY KEY,
  code VARCHAR(16) NOT NULL,
  expires_at BIGINT NOT NULL,
  used TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS progress (
  user_id VARCHAR(64) PRIMARY KEY,
  payload MEDIUMTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS meta (
  meta_key VARCHAR(64) PRIMARY KEY,
  value MEDIUMTEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_index (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_type VARCHAR(32) NOT NULL,
  source_id VARCHAR(64) NOT NULL,
  chunk_kind VARCHAR(32) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  embedding MEDIUMTEXT NOT NULL,
  model VARCHAR(128) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_ai (source_type, source_id, chunk_kind)
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(64),
  kind VARCHAR(32) NOT NULL,
  prompt_tokens BIGINT NOT NULL DEFAULT 0,
  completion_tokens BIGINT NOT NULL DEFAULT 0,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  ok TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_ai_usage_created (created_at)
);
"""

_provider = config.DB_PROVIDER


def _translate(sql: str) -> str:
    """SQLite 方言 → MySQL 方言（仅 mysql 引擎调用）。

    ON CONFLICT 的赋值子句均为 col=excluded.col 的简单形态（本仓库约定），
    逐个改写为 col=VALUES(col)；时间函数与占位符做全文替换。
    """
    sql = sql.replace("datetime('now')", "NOW()")

    def _dup(m: re.Match) -> str:
        assigns = re.sub(r"excluded\.(\w+)", lambda a: "VALUES(%s)" % a.group(1), m.group(2))
        return "ON DUPLICATE KEY UPDATE " + assigns

    sql = re.sub(r"ON CONFLICT\s*\(([^)]+)\)\s*DO UPDATE SET\s+([^;]+)", _dup, sql)

    # datetime('now', '±N unit') 修饰符 → NOW() ± INTERVAL N unit
    _UNITS = {"SECONDS": "SECOND", "MINUTES": "MINUTE", "HOURS": "HOUR",
              "DAYS": "DAY", "MONTHS": "MONTH", "YEARS": "YEAR"}

    def _dtmod(m: re.Match) -> str:
        sign, n, unit = m.group(1), m.group(2), m.group(3).upper()
        op = "-" if sign == "-" else "+"
        return "NOW() %s INTERVAL %s %s" % (op, n, _UNITS.get(unit, unit))

    sql = re.sub(
        r"datetime\('now',\s*'([+-])(\d+)\s+(seconds|minutes|hours|days|months|years)'\)",
        _dtmod,
        sql,
        flags=re.IGNORECASE,
    )
    return sql.replace("?", "%s")


if _provider == "mysql":
    import pymysql
    import pymysql.cursors

    def _mysql_conn():
        return pymysql.connect(
            host=config.MYSQL_HOST,
            port=config.MYSQL_PORT,
            user=config.MYSQL_USER,
            password=config.MYSQL_PASSWORD,
            database=config.MYSQL_DATABASE,
            charset="utf8mb4",
            autocommit=False,
            cursorclass=pymysql.cursors.DictCursor,
        )

    def connect():
        """当前引擎的连接（MySQL：行按列名访问，DATETIME 字符串化）。"""
        return _MySqlConn(_mysql_conn())

    def _stringify_row(row: dict) -> dict:
        """DATETIME → 与 SQLite 同形的字符串（"YYYY-MM-DD HH:MM:SS"），
        保证两引擎对上层暴露的行结构一致（auth 限频按字符串做时间差）。"""
        for k, v in row.items():
            if isinstance(v, datetime.datetime):
                row[k] = v.strftime("%Y-%m-%d %H:%M:%S")
            elif isinstance(v, datetime.date):
                row[k] = v.isoformat()
        return row

    class _MySqlCursor:
        def __init__(self, cur):
            self._cur = cur

        def execute(self, sql: str, params: tuple = ()):
            self._cur.execute(_translate(sql), params)
            return self

        def fetchall(self) -> list[dict]:
            return [_stringify_row(dict(r)) for r in (self._cur.fetchall() or [])]

        def fetchone(self):
            row = self._cur.fetchone()
            return _stringify_row(dict(row)) if row is not None else None

        @property
        def lastrowid(self):
            return self._cur.lastrowid

    class _MySqlConn:
        def __init__(self, conn):
            self._conn = conn

        def cursor(self):
            return _MySqlCursor(self._conn.cursor())

        def execute(self, sql: str, params: tuple = ()):
            cur = self.cursor()
            cur.execute(_translate(sql), params)
            return cur

        def commit(self):
            self._conn.commit()

        def rollback(self):
            self._conn.rollback()

        def close(self):
            self._conn.close()

        def begin(self):
            self._conn.begin()


def connect():
    """当前引擎的连接：SQLite（Row 行工厂 + WAL）/ MySQL（Dict 行 + DATETIME 字符串化）。"""
    if _provider == "mysql":
        return _MySqlConn(_mysql_conn())
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init() -> None:
    if _provider == "mysql":
        conn = _mysql_conn()
        cur = conn.cursor()
        for stmt in SCHEMA_MYSQL.split(";\n"):
            if stmt.strip():
                cur.execute(stmt)
        # 轻迁移（存量库补列；MySQL 8 无 ADD COLUMN IF NOT EXISTS，查 information_schema 判断）
        cur.execute(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='status'"
        )
        if cur.fetchone()[0] == 0:
            cur.execute("ALTER TABLE users ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'active'")
        conn.commit()
        conn.close()
        return
    conn = connect()
    conn.executescript(SCHEMA)
    # 轻迁移：password_hash 列 + phone 列（多身份绑定：密码/GitHub/手机号同行共存）
    cols = [r[1] for r in conn.execute("PRAGMA table_info(users)")]
    if "password_hash" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
    if "phone" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN phone TEXT")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL")
    # 轻迁移：meta.key 是 MySQL 保留字 → 改名 meta_key（老 data.db 一次性迁移）
    meta_cols = [r[1] for r in conn.execute("PRAGMA table_info(meta)")]
    if "key" in meta_cols:
        conn.execute("ALTER TABLE meta RENAME COLUMN key TO meta_key")
    # 轻迁移：users.status（封禁，管理端引入）
    if "status" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
    conn.commit()
    conn.close()


def q(sql: str, params: tuple = ()) -> list:
    conn = connect()
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def ex(sql: str, params: tuple = ()) -> int:
    conn = connect()
    try:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur.lastrowid
    finally:
        # 异常路径也必须释放连接：失败语句未回滚会持有写锁，阻塞后续所有写入
        conn.close()


@contextmanager
def tx() -> Iterator:
    """多表写入的事务边界：块内异常整体回滚。
    块内请用 conn.execute 而不是 q/ex（它们各自开连接，看不到未提交数据）。"""
    conn = connect()
    try:
        if _provider == "mysql":
            conn.begin()
        else:
            conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def jload(s: str | None, default):
    if not s:
        return default
    return json.loads(s)


def jdump(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def next_version() -> int:
    rows = q("SELECT value FROM meta WHERE meta_key='casepack_version'")
    v = int(rows[0]["value"]) if rows else 0
    v += 1
    ex("INSERT INTO meta(meta_key, value) VALUES('casepack_version', ?) ON CONFLICT(meta_key) DO UPDATE SET value=excluded.value", (str(v),))
    return v


def current_version() -> int:
    rows = q("SELECT value FROM meta WHERE meta_key='casepack_version'")
    return int(rows[0]["value"]) if rows else 0
