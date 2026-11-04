"""编程式 Alembic 的唯一入口：upgrade_head / current_version / head_version / stamp_head。

MySQL连接配置在调用时读取，禁止 import 时缓存 URL。
"""

from pathlib import Path

import alembic.command
import sqlalchemy
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

from core import config

_BASE_DIR = Path(__file__).resolve().parent.parent  # server/


def _cfg() -> Config:
    """alembic 配置（server/alembic.ini；script_location 由其相对解析）。"""
    return Config(str(_BASE_DIR / "alembic.ini"))


def _database_url() -> str:
    """与 alembic/env.py 的 database_url() 保持一致；测试把守两处不漂移。"""
    return config.mysql_database_url()


def upgrade_head() -> None:
    alembic.command.upgrade(_cfg(), "head")


def current_version() -> str | None:
    """库中当前的 alembic 版本（无 alembic_version 表 / 空表 → None）。"""
    engine = sqlalchemy.create_engine(_database_url())
    try:
        with engine.connect() as conn:
            return MigrationContext.configure(conn).get_current_revision()
    finally:
        engine.dispose()


def head_version() -> str:
    """script 目录 revisions 中无 down_revision 指向的链头；出现多头即配置错误。"""
    heads = ScriptDirectory.from_config(_cfg()).get_heads()
    if len(heads) != 1:
        raise RuntimeError(f"期望单一 head，实际: {heads}")
    return heads[0]


def stamp_head() -> None:
    alembic.command.stamp(_cfg(), "head")


def downgrade_to_base() -> None:
    """回滚到 base（DROP 全部业务表）——调用前必须先完成备份（docs/备份与恢复.md）。"""
    alembic.command.downgrade(_cfg(), "base")
