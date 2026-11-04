"""启动 fail-fast 四项：JWT / SMS 通道 / MySQL 连通 / schema 版本。
create_app 每次调用都重复执行全部检查（boot-migrate 幂等），测试直接反复调用，无需重建客户端。
monkeypatch 目标一律是 core.config / core.sms / core.migrate 的模块属性。"""

import pymysql
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
    """DB_PROVIDER=mysql 且 MYSQL_HOST=127.0.0.1 MYSQL_PORT=1（必拒）：抛 RuntimeError 含 'MySQL'。
    探针必须真实拨号（评审 I-1）：sqlite 导入环境下 core.db 的 _mysql_conn/_MySqlConn 未定义
    （仅 _provider=="mysql" 时创建），只 patch config 会 NameError 被 ③ 包装成目标文案的假阳性；
    故 patch _mysql_conn 直连必拒端口（真实 pymysql 拨号），并补 _MySqlConn 占位
    （CPython 先解析可调用名再求值实参，不补则拨号前就 NameError），随后断言 __cause__
    是 pymysql 连接异常，锁死"真拨号"语义。"""
    monkeypatch.setattr(config, "DB_PROVIDER", "mysql")
    monkeypatch.setattr(config, "MYSQL_HOST", "127.0.0.1")
    monkeypatch.setattr(config, "MYSQL_PORT", 1)
    monkeypatch.setattr(
        coredb,
        "_mysql_conn",
        lambda: pymysql.connect(host="127.0.0.1", port=1, user="x", password="x", database="x"),
        raising=False,
    )
    monkeypatch.setattr(coredb, "_MySqlConn", lambda conn: conn, raising=False)
    with pytest.raises(RuntimeError, match="MySQL") as excinfo:
        main.create_app()
    assert isinstance(excinfo.value.__cause__, pymysql.err.OperationalError)


def test_refuse_when_schema_behind(monkeypatch):
    """schema 版本断言：upgrade_head 被 no-op 且 current_version() 读到 None
    （模拟从未迁移/被清空版本表的老库，None != head）→ 抛 RuntimeError 含 'schema'。
    机制必须 provider 无关：MySQL 测试轮下 core.config 指向共享隔离库，
    不能靠 DB_PATH 造空库来制造 None（那是 sqlite 分支专属机制）。"""
    monkeypatch.setattr(migrate, "upgrade_head", lambda: None)
    monkeypatch.setattr(migrate, "current_version", lambda: None)
    with pytest.raises(RuntimeError, match="schema"):
        main.create_app()


def test_unhandled_exception_counts_one_500_and_returns_request_id():
    from fastapi.testclient import TestClient

    from features.ops import metrics

    def explode():
        raise RuntimeError("boom")

    main.app.add_api_route("/api/test-unhandled", explode)
    with metrics._lock:
        metrics._requests = 0
        metrics._errors = 0
        metrics._latency_ms_sum = 0.0

    response = TestClient(main.app, raise_server_exceptions=False).get("/api/test-unhandled")

    assert response.status_code == 500
    assert response.headers["X-Request-Id"]
    assert metrics.current()["requests"] == 1
    assert metrics.current()["errors"] == 1
