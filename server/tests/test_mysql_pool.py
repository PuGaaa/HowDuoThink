"""真实MySQL连接池契约：复用、事务清理、容量和闲置断连。"""

import time

import pymysql
import pytest
from sqlalchemy.exc import TimeoutError as PoolTimeout

from core import config
from core import db as coredb


@pytest.fixture()
def pool(monkeypatch):
    monkeypatch.setattr(config, "MYSQL_POOL_SIZE", 1)
    monkeypatch.setattr(config, "MYSQL_POOL_MAX_OVERFLOW", 1)
    monkeypatch.setattr(config, "MYSQL_POOL_TIMEOUT", 0.05)
    pool = coredb._mysql_pool(tuple(coredb._mysql_connect_kwargs().items()), 1, 1, 0.05)
    yield pool
    pool.dispose()
    coredb._mysql_pool.cache_clear()


def connection_id(conn) -> int:
    return conn.execute("SELECT CONNECTION_ID() AS id").fetchone()["id"]


def test_checkout_reuses_connection_and_retains_utc_session(pool):
    first = coredb.connect()
    identity = connection_id(first)
    first.close()
    second = coredb.connect()
    try:
        assert connection_id(second) == identity
        assert second.execute("SELECT @@session.time_zone AS zone").fetchone()["zone"] == "+00:00"
    finally:
        second.close()


def test_return_rolls_back_uncommitted_write(pool):
    conn = coredb.connect()
    try:
        conn.execute("INSERT INTO settings(setting_key,value) VALUES(?,?)", ("pool.uncommitted", "not-saved"))
    finally:
        conn.close()
    assert coredb.q("SELECT value FROM settings WHERE setting_key=?", ("pool.uncommitted",)) == []


def test_failed_transaction_releases_connection_and_rolls_back(pool):
    with pytest.raises(pymysql.err.ProgrammingError):
        with coredb.tx() as conn:
            conn.execute("INSERT INTO settings(setting_key,value) VALUES(?,?)", ("pool.failed", "not-saved"))
            conn.execute("SELECT value FROM definitely_missing_pool_table")
    assert coredb.q("SELECT value FROM settings WHERE setting_key=?", ("pool.failed",)) == []
    assert coredb.q("SELECT 1 AS ready") == [{"ready": 1}]


def test_capacity_is_bounded_and_wait_has_timeout(pool):
    first = coredb.connect()
    second = coredb.connect()
    try:
        assert connection_id(first) != connection_id(second)
        start = time.monotonic()
        with pytest.raises(PoolTimeout):
            coredb.connect()
        assert time.monotonic() - start >= 0.04
    finally:
        first.close()
        second.close()
    assert coredb.q("SELECT 1 AS released") == [{"released": 1}]


def test_idle_disconnect_gets_new_connection_on_checkout(pool):
    conn = coredb.connect()
    old_identity = connection_id(conn)
    conn.close()
    killer = pymysql.connect(**coredb._mysql_connect_kwargs())
    try:
        with killer.cursor() as cursor:
            cursor.execute("KILL %s", (old_identity,))
    finally:
        killer.close()
    conn = coredb.connect()
    try:
        assert connection_id(conn) != old_identity
        assert conn.execute("SELECT 1 AS ready").fetchone()["ready"] == 1
    finally:
        conn.close()
