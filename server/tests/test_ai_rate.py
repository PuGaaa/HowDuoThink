"""ai 域·限流与配额：窗口限流读-判-写原子（TOCTOU 修复）+ 日配额硬顶。"""

import datetime
import threading

from fastapi.testclient import TestClient

import main  # noqa: F401
from tests.conftest import login_admin


class _FakeResp:
    content = "模拟回答"
    response_metadata = {"token_usage": {"prompt_tokens": 1, "completion_tokens": 1}}


class _FakeModel:
    def invoke(self, messages):
        return _FakeResp()


class _FakeEmbed:
    model = "fake-embed"

    def embed_query(self, q: str) -> list[float]:
        return [1.0, 0.0]


def _mock_ai(monkeypatch) -> None:
    from features.ai import client

    monkeypatch.setattr(client, "available", lambda: True)
    monkeypatch.setattr(client, "chat_model", lambda: _FakeModel())
    monkeypatch.setattr(client, "embed_available", lambda: True)
    monkeypatch.setattr(client, "embeddings_model", lambda: _FakeEmbed())


def test_rate_limit_holds_under_concurrency(monkeypatch):
    """同 uid 并发 20 次限流判定、阈值 5：放行数必须恰为 5（修复前读-判-写竞态会全放）。"""
    import db
    from core import settings as settings_mod
    from features.ai import service

    db.ex(
        "INSERT INTO settings(setting_key, value, updated_by) VALUES('ai.rate_limit','5','test') "
        "ON CONFLICT(setting_key) DO UPDATE SET value=excluded.value"
    )
    settings_mod.reset_cache()
    try:
        monkeypatch.setattr(service, "_RATE", {})
        results: list[bool] = []
        results_lock = threading.Lock()
        barrier = threading.Barrier(20)

        def hit():
            barrier.wait()  # 全部线程同时冲进判定，最大化交错
            ok = service._rate_ok("u-race")
            with results_lock:
                results.append(ok)

        threads = [threading.Thread(target=hit) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert sum(results) == 5
    finally:
        db.ex("DELETE FROM settings WHERE setting_key='ai.rate_limit'")
        settings_mod.reset_cache()


def test_daily_quota_blocks_after_limit(monkeypatch):
    """当日 chat 次数达到 ai.daily_limit：拒绝且不再产生新的模型调用。"""
    import db
    from core import settings as settings_mod
    from features.ai import service

    _mock_ai(monkeypatch)
    monkeypatch.setattr(service, "_RATE", {})
    db.ex("DELETE FROM ai_usage")
    db.ex(
        "INSERT INTO settings(setting_key, value, updated_by) VALUES('ai.daily_limit','2','test') "
        "ON CONFLICT(setting_key) DO UPDATE SET value=excluded.value"
    )
    settings_mod.reset_cache()
    try:
        today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        for _ in range(2):
            db.ex(
                "INSERT INTO ai_usage(uid, kind, prompt_tokens, completion_tokens, duration_ms, ok, created_at) "
                "VALUES('pw-admin','chat',1,1,1,1,?)",
                (today + " 00:00:00",),
            )
        with TestClient(main.app, raise_server_exceptions=False) as c:
            login_admin(c)
            r = c.post("/api/ai/chat", json={"question": "额度用完了还能问吗"})
            assert r.status_code == 200
            assert "上限" in r.json()["error"]
            rows = db.q("SELECT COUNT(*) AS n FROM ai_usage WHERE uid='pw-admin' AND kind='chat'")
            assert rows[0]["n"] == 2  # 未新增模型调用
    finally:
        db.ex("DELETE FROM settings WHERE setting_key='ai.daily_limit'")
        settings_mod.reset_cache()
        db.ex("DELETE FROM ai_usage")  # 清场，不影响同会话其他用例的口径
