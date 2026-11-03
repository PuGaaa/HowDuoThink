"""启动 fail-fast 四项：JWT / SMS 通道 / MySQL 连通 / schema 版本。
create_app 每次调用都重复执行全部检查（boot-migrate 幂等），测试直接反复调用，无需重建客户端。
monkeypatch 目标一律是 core.config / core.sms / core.migrate 的模块属性。"""

import pytest

import main  # noqa: F401  (conftest 已先行建库并导入)
from core import config, migrate
from core import db as coredb
from core import sms as sms_core


def test_refuse_ephemeral_jwt_secret_in_prod(monkeypatch):
    """JWT_SECRET 为进程内随机且非 dev：create_app 抛 RuntimeError 且文案含 'JWT_SECRET'。"""
    monkeypatch.setattr(config, "JWT_SECRET_EPHEMERAL", True)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        main.create_app()


def test_refuse_dev_sms_channel_when_env_set(monkeypatch):
    """ENV=staging 且 SMS_PROVIDER=dev：拒绝（文案含 'SMS_PROVIDER'）；ENV 缺省与 ENV=dev 不拒。"""
    monkeypatch.setattr(sms_core, "PROVIDER", "dev")
    # staging：dev 回显通道当场拒绝
    monkeypatch.setenv("ENV", "staging")
    with pytest.raises(RuntimeError, match="SMS_PROVIDER"):
        main.create_app()
    # ENV 缺省（本地默认形态）：不拒
    monkeypatch.delenv("ENV", raising=False)
    main.create_app()
    # ENV=dev（联调形态）：不拒
    monkeypatch.setenv("ENV", "dev")
    main.create_app()


def test_refuse_when_mysql_unreachable(monkeypatch):
    """DB_PROVIDER=mysql 且 MYSQL_HOST=127.0.0.1 MYSQL_PORT=1（必拒）：抛 RuntimeError 含 'MySQL'。"""
    monkeypatch.setattr(config, "DB_PROVIDER", "mysql")
    monkeypatch.setattr(config, "MYSQL_HOST", "127.0.0.1")
    monkeypatch.setattr(config, "MYSQL_PORT", 1)
    with pytest.raises(RuntimeError, match="MySQL"):
        main.create_app()


def test_refuse_when_schema_behind(monkeypatch, tmp_path):
    """schema 版本断言：upgrade_head 被 no-op 且 DB 指向从未迁移的空 tmp 库
    （current_version() 为 None != head）→ 抛 RuntimeError 含 'schema'。"""
    monkeypatch.setattr(migrate, "upgrade_head", lambda: None)
    monkeypatch.setattr(coredb, "DB_PATH", tmp_path / "empty.db")
    with pytest.raises(RuntimeError, match="schema"):
        main.create_app()
