"""SQLite（WAL）：小而硬。复杂结构存 JSON 列（schema 迭代期），索引列留给查询。"""
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from typing import Iterator

DB_PATH = Path(__file__).parent / "data.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'user',
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
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init() -> None:
    conn = connect()
    conn.executescript(SCHEMA)
    # 轻迁移：password_hash 列
    cols = [r[1] for r in conn.execute("PRAGMA table_info(users)")]
    if "password_hash" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
    conn.commit()
    conn.close()


def q(sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    conn = connect()
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return rows


def ex(sql: str, params: tuple = ()) -> int:
    conn = connect()
    cur = conn.execute(sql, params)
    conn.commit()
    last = cur.lastrowid
    cur.close()
    conn.close()
    return last  # type: ignore[return-value]


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    """多表写入的事务边界：BEGIN IMMEDIATE 取写锁，块内异常整体回滚。
    块内请用 conn.execute 而不是 q/ex（它们各自开连接，看不到未提交数据）。"""
    conn = connect()
    try:
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
    rows = q("SELECT value FROM meta WHERE key='casepack_version'")
    v = int(rows[0]["value"]) if rows else 0
    v += 1
    ex("INSERT INTO meta(key, value) VALUES('casepack_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(v),))
    return v


def current_version() -> int:
    rows = q("SELECT value FROM meta WHERE key='casepack_version'")
    return int(rows[0]["value"]) if rows else 0
