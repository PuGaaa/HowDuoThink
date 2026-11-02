"""ops 域：进程内请求计数、快照落库、健康端点。"""

from fastapi.testclient import TestClient

from tests.conftest import login_admin, make_client


def test_metrics_record_and_snapshot():
    from features.ops import metrics

    metrics.take_snapshot()  # 归零：前序测试的请求计数不归我管
    metrics.record(200, 10.0)
    metrics.record(200, 20.0)
    metrics.record(500, 30.0)
    snap = metrics.take_snapshot()
    assert snap["requests"] == 3
    assert snap["errors"] == 1
    assert snap["avgMs"] == 20
    import db

    row = db.q("SELECT * FROM ops_snapshots ORDER BY id DESC LIMIT 1")[0]
    assert row["requests"] == 3 and row["errors"] == 1
    # 归零后重新计数
    assert metrics.take_snapshot()["requests"] == 0


def test_snapshot_failure_does_not_raise(monkeypatch):
    import db
    from features.ops import metrics

    metrics.take_snapshot()  # 归零
    metrics.record(200, 5.0)
    monkeypatch.setattr(db, "ex", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("库挂了")))
    snap = metrics.take_snapshot()  # 快照写库失败也不抛
    assert snap["requests"] == 1


def test_ops_health_endpoint():
    from features.ops import metrics

    metrics.record(200, 8.0)
    with make_client() as c:
        login_admin(c)
        r = c.get("/api/admin/ops/health")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["db"]["ok"] is True
        assert body["db"]["casepackVersion"] >= 0
        assert body["process"]["rssMb"] > 0
        assert body["process"]["uptimeMin"] >= 0
        assert body["diskFreeMb"] > 0
        assert "recent" in body
        # 未登录 401/403
        assert make_client().get("/api/admin/ops/health").status_code in (401, 403)


def test_sentry_disabled_without_dsn():
    from core import config
    from main import create_app

    # 无 DSN：create_app 正常，不装 Sentry（运行时降级，环境同构）
    monkey_dsn = getattr(config, "SENTRY_DSN", None)
    assert monkey_dsn == "" or monkey_dsn is None
    app = create_app()
    assert app is not None
    with TestClient(app) as c:
        assert c.get("/api/health").status_code == 200
