"""Alembic 迁移环境：URL 运行时组装，禁止 import 时缓存（测试会 monkeypatch DB_PATH）。

sqlite 用 core.db.DB_PATH（与 core/db.py 的 connect() 同一读取点，monkeypatch 生效）；
mysql 用 core.config 的 MYSQL_*。与 core/migrate.py 的 _database_url() 保持一致，
对拍/重放测试把守两处不漂移。
"""

import sys
from pathlib import Path

from sqlalchemy import create_engine, pool

from alembic import context

# server/ 入 sys.path：从任意 cwd 执行 alembic 命令都能 import core.*
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import core.config as core_config  # noqa: E402
from core import db as coredb  # noqa: E402

cfg = context.config

# 本项目手写迁移（versions/*.py 双引擎分支），不用 autogenerate
target_metadata = None


def database_url() -> str:
    """运行时组装（每次命令执行时现读，绝不缓存）。"""
    if core_config.DB_PROVIDER == "mysql":
        return core_config.mysql_database_url()
    return f"sqlite:///{coredb.DB_PATH.resolve()}"


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
