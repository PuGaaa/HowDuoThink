"""Alembic 基线迁移：快照把守 + 重放 + 配置/cwd 把守（legacy db.init 已退役）。"""

import sqlite3
from pathlib import Path

import pytest

import db as dbmod
from alembic import command as alembic_command
from core import config, migrate
from core import db as coredb

FIXTURE = Path(__file__).parent / "fixtures" / "schema_baseline.sql"

# 基线的全部业务表（重放/快照断言用；不含 sqlite 内部表与 alembic_version）
BUSINESS_TABLES = {
    "users",
    "submissions",
    "cases",
    "articles",
    "sms_codes",
    "progress",
    "meta",
    "ai_index",
    "ai_usage",
    "user_activity",
    "ops_snapshots",
    "settings",
    "assets",
    "resource_slots",
}


def _use_db(monkeypatch, path: Path) -> None:
    """沿用 conftest 惯例：core.db.DB_PATH 是函数实际读取处，shim 同步指。
    本文件全部用例断言 sqlite 分支语义（sqlite_master / 库文件存在性）——
    MySQL 测试轮（DB_PROVIDER=mysql）下 config 会指向共享隔离库，这里强制
    sqlite provider，保证 migrate/env.py 走 DB_PATH 的 URL 分支。"""
    monkeypatch.setattr(coredb, "DB_PATH", path)
    monkeypatch.setattr(dbmod, "DB_PATH", path)
    monkeypatch.setattr(config, "DB_PROVIDER", "sqlite")


def _master_rows(path: Path, exclude_alembic: bool = True) -> list[tuple[str, str, str]]:
    """sqlite_master 中带 SQL 文本的对象（表+索引），按 (type, name) 排序。"""
    conn = sqlite3.connect(path)
    try:
        return [
            (t, n, s)
            for t, n, s in conn.execute(
                "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name"
            )
            if not (exclude_alembic and n.startswith("alembic_version"))
        ]
    finally:
        conn.close()


def test_replay_sqlite(monkeypatch, tmp_path):
    """空库 upgrade_head() → 调 baseline downgrade（经 alembic command.downgrade(cfg, "base")
    或等价编程式调用）→ 业务表全消失 → 再 upgrade_head() → current_version()=="0001_baseline"。"""
    path = tmp_path / "replay.db"
    _use_db(monkeypatch, path)

    migrate.upgrade_head()
    assert migrate.current_version() == "0001_baseline"

    alembic_command.downgrade(migrate._cfg(), "base")
    remaining = {n for _, n, _ in _master_rows(path)}
    assert not (remaining & BUSINESS_TABLES), remaining

    migrate.upgrade_head()
    assert migrate.current_version() == "0001_baseline"


def test_downgrade_to_base_sqlite(monkeypatch, tmp_path):
    """downgrade_to_base() 编程式入口：upgrade 后回滚到 base → 业务表全消失 +
    current_version() is None（与 test_replay_sqlite 直调 alembic_command 互为入口对拍）。"""
    path = tmp_path / "down.db"
    _use_db(monkeypatch, path)

    migrate.upgrade_head()
    assert migrate.current_version() == "0001_baseline"

    migrate.downgrade_to_base()
    remaining = {n for _, n, _ in _master_rows(path)}
    assert not (remaining & BUSINESS_TABLES), remaining
    assert migrate.current_version() is None


def test_upgrade_uses_current_config(monkeypatch, tmp_path):
    """连做两个库：第一库 upgrade 后，把 DB_PATH 换到第二个路径再 upgrade——
    第二个文件被建成库而第一个不受影响（证明 URL 无缓存）。"""
    first = tmp_path / "one.db"
    second = tmp_path / "two.db"

    _use_db(monkeypatch, first)
    migrate.upgrade_head()
    _use_db(monkeypatch, second)
    migrate.upgrade_head()

    # 第二个文件确已建成库（含 alembic_version，此处不过滤）
    assert second.exists()
    names_second = {n for _, n, _ in _master_rows(second, exclude_alembic=False)}
    assert "users" in names_second and "alembic_version" in names_second
    # 第一个库不受影响：schema 完整、版本仍 stamped
    names_first = {n for _, n, _ in _master_rows(first)}
    assert names_first >= BUSINESS_TABLES
    conn = sqlite3.connect(first)
    try:
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "0001_baseline"
    finally:
        conn.close()


def test_mysql_url_keeps_special_characters_in_credentials(monkeypatch):
    """URL 使用结构化字段，密码特殊字符不能改变连接目标或参数。"""
    monkeypatch.setattr(config, "MYSQL_USER", "user@name")
    monkeypatch.setattr(config, "MYSQL_PASSWORD", "p@ss:/?#[]")
    monkeypatch.setattr(config, "MYSQL_HOST", "127.0.0.1")
    monkeypatch.setattr(config, "MYSQL_PORT", 3306)
    monkeypatch.setattr(config, "MYSQL_DATABASE", "hdt_test")

    url = config.mysql_database_url()

    assert url.username == "user@name"
    assert url.password == "p@ss:/?#[]"
    assert url.host == "127.0.0.1"
    assert url.port == 3306
    assert url.database == "hdt_test"
    assert url.query["charset"] == "utf8mb4"


@pytest.mark.skipif(not FIXTURE.exists(), reason="快照在对拍测试通过后生成（任务步骤 6）")
def test_baseline_matches_fixture(monkeypatch, tmp_path):
    """upgrade 后的库：sqlite_master 中全部 table/index SQL 按名称排序拼接 ==
    tests/fixtures/schema_baseline.sql 内容（剔除 alembic_version）。"""
    path = tmp_path / "snapshot.db"
    _use_db(monkeypatch, path)
    migrate.upgrade_head()

    rows = sorted(_master_rows(path))
    rendered = "".join(repr(row) + "\n" for row in rows)
    assert rendered == FIXTURE.read_text()


def test_head_and_stamp(monkeypatch, tmp_path):
    """head_version 报基线链头；stamp_head 只打版本戳不建业务表（存量库收编入口）。"""
    assert migrate.head_version() == "0001_baseline"

    path = tmp_path / "stamped.db"
    _use_db(monkeypatch, path)
    migrate.stamp_head()
    assert migrate.current_version() == "0001_baseline"
    # stamp 只写 alembic_version，不执行 DDL：业务表不应出现
    names = {n for _, n, _ in _master_rows(path, exclude_alembic=False)}
    assert "alembic_version" in names
    assert not (names & BUSINESS_TABLES)


def test_upgrade_head_cwd_independent(monkeypatch, tmp_path):
    """编程式唯一入口必须 cwd 无关：从非 server/ 的工作目录调 upgrade_head 也要能
    解析 script 目录（alembic 对 ini 里的相对 script_location 按进程 cwd 解析，
    入口若依赖 cwd，任务 2 把启动建表切过来后从任意启动目录都会炸）。"""
    path = tmp_path / "cwd-free.db"
    _use_db(monkeypatch, path)
    monkeypatch.chdir(tmp_path)

    migrate.upgrade_head()
    assert migrate.current_version() == "0001_baseline"
    assert {n for _, n, _ in _master_rows(path)} >= BUSINESS_TABLES
