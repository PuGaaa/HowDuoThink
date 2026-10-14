"""ai 域测试：bundle 索引存取/余弦排序/无 key 降级/起草合并。
遵循 conftest：临时库 + 无 dev 绕行；LangChain 调用在 service 层被 monkeypatch（不触网）。"""
import json

import pytest

from core import security
from fastapi.testclient import TestClient
import main


def make_user(client, login: str, role: str = "user") -> None:
    """测试库直接建号（bcrypt 密码），再走标准登录拿 cookie。"""
    import db
    db.ex(
        "INSERT INTO users(id, login, name, role, password_hash) VALUES(?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET role=excluded.role, password_hash=excluded.password_hash",
        (f"pw-{login}", login, login, role, security.hash_password("test-pw-123")),
    )


def login(c, login_name: str) -> None:
    r = c.post("/api/auth/login", json={"login": login_name, "password": "test-pw-123"})
    assert r.status_code == 200, r.text


def add_submission(sub_id: str, title: str) -> None:
    import db
    db.ex(
        "INSERT INTO submissions(id, user_id, title, symptom, resolution, key_error, timeline, lessons, stack_tags, domain_hint) "
        "VALUES(?,?,?,?,?,?,?,?,?,?)",
        (sub_id, "pw-editor", title, "素材症状描述足够长，供骨架引用", "解决过程第一行。解决过程第二行", "ERR-1", "tl",
         db.jdump(["素材教训"]), db.jdump(["mysql"]), "network"),
    )


def add_index_row(case_id: str, vec: list[float], content: str = "内容") -> None:
    import db
    db.ex(
        "INSERT INTO ai_index(source_type, source_id, chunk_kind, content, embedding, model) "
        "VALUES('case', ?, 'overview', ?, ?, 'fake')",
        (case_id, content, json.dumps(vec)),
    )


def _client() -> TestClient:
    return TestClient(main.app)


def test_chat_degrades_without_key(monkeypatch):
    """无 key：chat 返回降级提示（不做关键词兜底应答）。"""
    monkeypatch.setattr("features.ai.client.available", lambda: False)
    c = _client()
    make_user(c, "u1")
    login(c, "u1")
    r = c.post("/api/ai/chat", json={"question": "连接池耗尽怎么排查"})
    assert r.status_code == 200
    d = r.json()
    assert d["aiAvailable"] is False
    assert "未配置" in d["error"]


def test_search_degrades_to_keyword(monkeypatch):
    """向量供应商未就绪（zhipu 模式缺 key）：检索降级为 LIKE 关键词。"""
    import core.config as config
    monkeypatch.setattr("core.config.EMBED_PROVIDER", "zhipu")
    monkeypatch.setattr("core.config.ZHIPU_API_KEY", "")
    c = _client()
    from features.ai import client as ai_client
    ai_client.embeddings_model.cache_clear()
    try:
        make_user(c, "u2")
        login(c, "u2")
        add_index_row("case-kw", [0.0, 0.0], "缓存一致性窗口与回源策略")
        r = c.get("/api/ai/search", params={"q": "缓存一致性"})
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) == 1 and results[0]["caseId"] == "case-kw"
    finally:
        from features.ai import client as ai_client
        ai_client.embeddings_model.cache_clear()


def test_reindex_requires_editor():
    """普通用户（user 角色）触发管理端重建 → 403。"""
    c = _client()
    make_user(c, "plainuser", role="user")
    login(c, "plainuser")
    r = c.post("/api/admin/ai/reindex")
    assert r.status_code == 403


def test_reindex_embed_unavailable(monkeypatch):
    """向量供应商未就绪（zhipu 模式缺 key）：重建返回 ok=False + 原因。"""
    import core.config as config
    monkeypatch.setattr("core.config.EMBED_PROVIDER", "zhipu")
    monkeypatch.setattr("core.config.ZHIPU_API_KEY", "")
    c = _client()
    from features.ai import client as ai_client
    ai_client.embeddings_model.cache_clear()
    try:
        make_user(c, "editor2", role="editor")
        login(c, "editor2")
        r = c.post("/api/admin/ai/reindex")
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is False and "未就绪" in d["reason"]
    finally:
        from features.ai import client as ai_client
        ai_client.embeddings_model.cache_clear()


def test_cosine_ranking(monkeypatch):
    """余弦排序：同向排前（mock embedding 避免触网）。"""
    from features.ai import service
    monkeypatch.setattr("features.ai.client.available", lambda: True)

    class FakeEmbeddings:
        model = "fake"

        def embed_documents(self, texts):
            return [[1.0, 0.1], [0.7, 0.7], [-1.0, 0.0]]

        def embed_query(self, q):
            return [1.0, 0.1]

    monkeypatch.setattr("features.ai.client.embeddings_model", lambda: FakeEmbeddings())

    c = _client()
    add_index_row("case-a", [1.0, 0.1], "关于A")
    add_index_row("case-b", [0.7, 0.7], "关于B")
    add_index_row("case-c", [-1.0, 0.0], "关于C")

    results = service.node_retrieve("测试问题", k=3)
    # 负相关的 case-c 被阈值过滤——并集排序：同向 > 正交 > 反向
    assert [r["caseId"] for r in results] == ["case-a", "case-b"]
    assert results[0]["score"] > results[1]["score"] >= 0.0


def test_ai_draft_merges_generated(monkeypatch):
    """AI 起草：GLM 输出合法 JSON → 覆盖骨架重字段，素材与署名链路保留。"""
    from features.ai import service
    monkeypatch.setattr("features.ai.client.available", lambda: True)

    generated = {
        "title": "AI 生成的标题",
        "intro": "AI 生成的简介",
        "layer": "AI 生成的层契约",
        "difficulty": 2,
        "chapterId": "network",
        "scene": {"role": "r", "architecture": "a",
                  "symptoms": [{"type": "text", "title": "t", "text": "素材症状"}],
                  "timeline": "tl", "impactHint": "ih"},
        "hypotheses": [{"id": "h-1", "text": "h", "excludeActionId": "a-1"}],
        "actions": [{"id": f"a-{i}", "name": f"动作{i}", "desc": "d", "cost": 1, "gain": "high",
                     "danger": False, "tests": ["h-1"], "hypotheses": [{"id": "h-1", "status": "excluded"}],
                     "result": {"type": "text", "title": "t", "text": "x"}} for i in range(1, 9)],
        "rootCauses": [{"id": "rc-1", "text": "根因", "correct": True}],
        "expertChain": [{"thought": "t", "update": "u", "actionId": "a-1",
                         "why": "为什么这一步值这个成本", "conclusion": "c"}],
        "lessons": [{"text": "教训", "principle": "原理"}],
    }
    captured = {}

    def fake_node_draft(material, uid=None):
        captured.update(material)
        return generated, []

    monkeypatch.setattr("features.ai.service.node_draft", fake_node_draft)

    c = _client()
    make_user(c, "editor3", role="editor")
    login(c, "editor3")
    add_submission("s-testai01", "素材标题")

    from features.ai import service
    r = service.ai_draft_from_submission("pw-editor3", "s-testai01")
    assert r["aiGenerated"] is True
    assert captured["title"] == "素材标题"

    import db
    payload = db.jload(db.q("SELECT payload FROM cases WHERE id=?", (r["caseId"],))[0]["payload"], {})
    assert payload["title"] == "AI 生成的标题"
    assert payload["chapterId"] == "network" and payload["part"] == "master"
    assert len(payload["actions"]) == 8
    st = db.q("SELECT status FROM submissions WHERE id='s-testai01'")[0]["status"]
    assert st == "accepted"


def test_ai_draft_falls_back_without_json(monkeypatch):
    """GLM 输出非 JSON → 回退机械骨架，aiGenerated=False。"""
    from features.ai import service
    monkeypatch.setattr("features.ai.client.available", lambda: True)
    monkeypatch.setattr("features.ai.service.node_draft",
                        lambda m, uid=None: ({}, ["GLM 输出无法解析为 JSON，已回退机械骨架"]))

    c = _client()
    make_user(c, "editor4", role="editor")
    login(c, "editor4")
    add_submission("s-testai02", "另一个素材标题")

    from features.ai import service
    r = service.ai_draft_from_submission("pw-editor4", "s-testai02")
    assert r["aiGenerated"] is False
    import db
    payload = db.jload(db.q("SELECT payload FROM cases WHERE id=?", (r["caseId"],))[0]["payload"], {})
    assert payload["title"] == "另一个素材标题"
    assert payload["hypotheses"][0]["text"].startswith("（待补充")
