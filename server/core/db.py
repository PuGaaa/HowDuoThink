"""数据库访问层：MySQL 8（只做连接与查询，建库建表归 Alembic）。

开发、测试与生产均连接 MySQL 8，只允许连接配置和容量不同。
feature 层 SQL 一律用 SQLite 方言书写（? 占位、datetime('now')、ON CONFLICT ... DO UPDATE SET
col=excluded.col），MySQL 引擎在执行前统一翻译——方言规则集中在本文件，features 不感知。
表结构由 server/alembic/ 基线迁移定义，入口统一 core.migrate.upgrade_head()（boot-migrate）。

翻译规则（MySQL 引擎）：
  ?                          → %s
  datetime('now')            → NOW()
  ON CONFLICT (cols) DO UPDATE SET col=excluded.col, ...
                             → ON DUPLICATE KEY UPDATE col=VALUES(col), ...
  meta 表的 key 列           → meta_key（KEY 是 MySQL 保留字，基线迁移即改名）
"""

import datetime
import json
import re
from contextlib import contextmanager
from functools import lru_cache
from typing import Iterator

import pymysql
import pymysql.cursors
from sqlalchemy.dialects.mysql.pymysql import MySQLDialect_pymysql
from sqlalchemy.pool import QueuePool

import core.config as config


def _translate(sql: str) -> str:
    """SQLite 方言 → MySQL 方言（仅 mysql 引擎调用）。

    ON CONFLICT 的赋值子句均为 col=excluded.col 的简单形态（本仓库约定），
    逐个改写为 col=VALUES(col)；时间函数与占位符做全文替换。
    """
    sql = sql.replace("/* FOR UPDATE */", "FOR UPDATE")
    sql = sql.replace("datetime('now')", "NOW()")

    def _dup(m: re.Match) -> str:
        assigns = re.sub(r"excluded\.(\w+)", lambda a: "VALUES(%s)" % a.group(1), m.group(2))
        return "ON DUPLICATE KEY UPDATE " + assigns

    sql = re.sub(r"ON CONFLICT\s*\(([^)]+)\)\s*DO UPDATE SET\s+([^;]+)", _dup, sql)

    def _nothing(m: re.Match) -> str:
        key = m.group(1).split(",", 1)[0].strip()
        return "ON DUPLICATE KEY UPDATE " + key + "=" + key

    sql = re.sub(r"ON CONFLICT\s*\(([^)]+)\)\s*DO NOTHING", _nothing, sql)

    # datetime('now', '±N unit') 修饰符 → NOW() ± INTERVAL N unit
    _UNITS = {
        "SECONDS": "SECOND",
        "MINUTES": "MINUTE",
        "HOURS": "HOUR",
        "DAYS": "DAY",
        "MONTHS": "MONTH",
        "YEARS": "YEAR",
    }

    def _dtmod(m: re.Match) -> str:
        sign, n, unit = m.group(1), m.group(2), m.group(3).upper()
        op = "-" if sign == "-" else "+"
        return "NOW() %s INTERVAL %s %s" % (op, n, _UNITS.get(unit, unit))

    sql = re.sub(
        r"datetime\('now',\s*'([+-])(\d+)\s+(seconds?|minutes?|hours?|days?|months?|years?)'\)",
        _dtmod,
        sql,
        flags=re.IGNORECASE,
    )
    return sql.replace("?", "%s")


def _mysql_connect_kwargs() -> dict:
    """MySQL 连接参数（纯函数便于测试）。init_command 固定会话时区为 UTC：
    SQLite 的 datetime('now') 是 UTC，翻译后的 NOW()/CURRENT_TIMESTAMP 若随
    服务器本地时区漂移，短信限频/日分组/用量窗口会在两引擎下行为分叉。"""
    return dict(
        host=config.MYSQL_HOST,
        port=config.MYSQL_PORT,
        user=config.MYSQL_USER,
        password=config.MYSQL_PASSWORD,
        database=config.MYSQL_DATABASE,
        charset="utf8mb4",
        autocommit=False,
        init_command="SET time_zone='+00:00'",
    )




def _mysql_conn():
    return pymysql.connect(cursorclass=pymysql.cursors.DictCursor, **_mysql_connect_kwargs())


@lru_cache(maxsize=1)
def _mysql_pool(connection_settings: tuple, size: int, overflow: int, timeout: float) -> QueuePool:
    """每个进程惰性建池；配置键防止测试/启动切库复用另一配置的连接。

    close 归还连接并回滚未提交事务；checkout 检查闲置断连。
    同时占用上限=size+overflow，耗尽时最多等待 timeout 秒。
    """
    return QueuePool(
        _mysql_conn,
        pool_size=size,
        max_overflow=overflow,
        timeout=timeout,
        pre_ping=True,
        dialect=MySQLDialect_pymysql(dbapi=pymysql),
    )


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
        # pymysql 对非 None 参数做 % 格式化插值：SQL 文本含字面 %（如 LIKE 'x-%'）
        # 且无参执行时会被误当格式符——空参传 None 跳过插值（DB-API 语义；sqlite 分支无此问题）
        self._cur.execute(_translate(sql), params or None)
        return self

    def fetchall(self) -> list[dict]:
        return [_stringify_row(dict(r)) for r in (self._cur.fetchall() or [])]

    def fetchone(self):
        row = self._cur.fetchone()
        return _stringify_row(dict(row)) if row is not None else None

    @property
    def lastrowid(self):
        return self._cur.lastrowid

    @property
    def rowcount(self):
        return self._cur.rowcount


class _MySqlConn:
    def __init__(self, conn):
        self._conn = conn

    def cursor(self):
        return _MySqlCursor(self._conn.cursor())

    def execute(self, sql: str, params: tuple = ()):
        cur = self.cursor()
        cur.execute(_translate(sql), params or None)
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
    """MySQL 连接池连接；配置变化使用独立池。"""
    pool = _mysql_pool(
        tuple(_mysql_connect_kwargs().items()),
        config.MYSQL_POOL_SIZE,
        config.MYSQL_POOL_MAX_OVERFLOW,
        config.MYSQL_POOL_TIMEOUT,
    )
    return _MySqlConn(pool.connect())


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
        conn.begin()
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
    ex(
        "INSERT INTO meta(meta_key, value) VALUES('casepack_version', ?) ON CONFLICT(meta_key) DO UPDATE SET value=excluded.value",
        (str(v),),
    )
    return v


def current_version() -> int:
    rows = q("SELECT value FROM meta WHERE meta_key='casepack_version'")
    return int(rows[0]["value"]) if rows else 0
