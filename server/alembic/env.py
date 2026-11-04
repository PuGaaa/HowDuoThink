"""Alembic 迁移环境：各环境统一 MySQL 8，连接配置运行时读取。"""

import sys
from pathlib import Path

from sqlalchemy import create_engine, pool

from alembic import context

# server/ 入 sys.path：从任意 cwd 执行 alembic 命令都能 import core.*
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import core.config as core_config  # noqa: E402

cfg = context.config

# 本项目手写迁移（versions/*.py 双引擎分支），不用 autogenerate
target_metadata = None


def database_url() -> str:
    """运行时组装（每次命令执行时现读，绝不缓存）。"""
    return core_config.mysql_database_url()


def run_migrations_offline() -> None:
    """离线模式：只按 URL 的方言生成 SQL 脚本，不连库。"""
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在线模式：现组装 URL 连库执行（禁止任何模块级缓存）。"""
    engine = create_engine(database_url(), poolclass=pool.NullPool)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
