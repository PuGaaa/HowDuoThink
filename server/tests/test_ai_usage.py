"""ai_usage 用量审计：真实调用落库、审计失败不影响主流程、汇总端点口径。"""
import datetime

from fastapi.testclient import TestClient

from tests.conftest import login_admin, make_client


class _FakeResp:
    content = "模拟回答"
    response_metadata = {"token_usage": {"prompt_tokens": 100, "completion_tokens": 50}}


class _FakeModel:
    def invoke(self, messages):
        return _FakeResp()


def test_chat_logs_token_usage(monkeypatch):
    from features.ai import client
    import main

    monkeypatch.setattr(client, "available", lambda: True)
    monkeypatch.setattr(client, "chat_model", lambda: _FakeModel())
    with TestClient(main.app) as c:
        login_admin(c)
        r = c.post("/api/ai/chat", json={"question": "连接池耗尽怎么排查"})
        assert r.status_code == 200, r.text
        import db

        rows = db.q("SELECT * FROM ai_usage WHERE kind='chat'")
        assert len(rows) == 1
        assert rows[0]["prompt_tokens"] == 100
        assert rows[0]["completion_tokens"] == 50
        assert rows[0]["uid"] == "pw-admin"
        assert rows[0]["ok"] == 1


def test_llm_failure_logged_as_not_ok(monkeypatch):
    from features.ai import client
    import main

    class Boom:
        def invoke(self, messages):
            raise RuntimeError("上游超时")

    monkeypatch.setattr(client, "available", lambda: True)
    monkeypatch.setattr(client, "chat_model", lambda: Boom())
    with TestClient(main.app, raise_server_exceptions=False) as c:
        login_admin(c)
        r = c.post("/api/ai/chat", json={"question": "会触发异常的问题"})
        assert r.status_code == 500  # 全局兜底
        import db

        rows = db.q("SELECT * FROM ai_usage WHERE kind='chat' AND ok=0")
        assert len(rows) == 1


def test_usage_log_failure_does_not_break_chat(monkeypatch):
    from features.ai import usage

    def boom(*a, **kw):
        raise RuntimeError("审计库炸了")

    import db

    monkeypatch.setattr(db, "ex", boom)
    # 审计是旁路：底层写入炸了也不许往外抛
    usage.log_usage("u", "chat", 1, 2, 3)


def test_usage_summary_endpoints():
    import db

    db.ex("DELETE FROM ai_usage")  # 清掉同会话前序测试的写入，保证窗口口径精确
    now = datetime.datetime.now(datetime.timezone.utc)
    for delta_days, pin, pout in ((0, 1000, 500), (1, 2000, 1000), (40, 9999, 9999)):
        created = (now - datetime.timedelta(days=delta_days)).strftime("%Y-%m-%d %H:%M:%S")
        db.ex(
            "INSERT INTO ai_usage(uid, kind, prompt_tokens, completion_tokens, duration_ms, ok, created_at) "
            "VALUES('pw-admin','chat',?,?,100,1,?)",
            (pin, pout, created),
        )
    with make_client() as c:
        login_admin(c)
        r = c.get("/api/admin/ai/usage", params={"days": 7})
        assert r.status_code == 200, r.text
        body = r.json()
        total_in = body["total"]["prompt_tokens"]
        assert total_in == 3000 + 9999 - 9999  # 40 天前的不在 7 天窗口
        assert body["total"]["completion_tokens"] == 1500
        assert len(body["days"]) == 2
        # 成本 = (in*2 + out*8) / 1e6（默认单价）
        assert abs(body["total"]["cost"] - (3000 * 2 + 1500 * 8) / 1e6) < 1e-6
        # 按用户 TOP
        r2 = c.get("/api/admin/ai/usage/users", params={"days": 7})
        assert r2.status_code == 200
        top = r2.json()["items"]
        assert top and top[0]["uid"] == "pw-admin"
        # 未登录 401/403
        assert make_client().get("/api/admin/ai/usage").status_code in (401, 403)
