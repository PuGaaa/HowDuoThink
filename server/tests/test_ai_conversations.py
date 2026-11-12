"""AI 会话历史：repo 层直接 import db 造数据；service 层 monkeypatch LangChain（不触网）。

会话按 updated_at 倒序是排序契约，而同一秒内批量创建的 updated_at 并列，
排序相关用例先把 updated_at 拨到分明的过去时刻，保证断言确定。
"""

import json

import pytest
from fastapi import HTTPException

import db
from features.ai import repo, service


def test_create_and_get_owned():
    uid = "u-owner"
    conv_id = repo.create_conversation(uid, "连接池耗尽排查")
    conv = repo.get_conversation(conv_id, uid)
    assert conv is not None
    assert conv["id"] == conv_id
    assert conv["uid"] == uid
    assert conv["title"] == "连接池耗尽排查"
    assert conv["created_at"] and conv["updated_at"]
    # uid 不符视同不存在
    assert repo.get_conversation(conv_id, "u-stranger") is None


def test_list_order_and_fields():
    uid = "u-list"
    first = repo.create_conversation(uid, "最早")
    second = repo.create_conversation(uid, "居中")
    third = repo.create_conversation(uid, "最新")
    # 同秒并列会让倒序不确定：拨成分明的过去时刻
    for cid, ts in [(first, "2026-01-01 00:00:01"), (second, "2026-01-01 00:00:02"), (third, "2026-01-01 00:00:03")]:
        db.ex("UPDATE ai_conversations SET updated_at=? WHERE id=?", (ts, cid))
    rows = repo.list_conversations(uid, 10, 0)
    assert [r["title"] for r in rows] == ["最新", "居中", "最早"]
    assert rows[0]["id"] == third
    # 字段名钉死为 id/title/updatedAt（camelCase 出参）
    assert set(rows[0].keys()) == {"id", "title", "updatedAt"}
    assert rows[0]["updatedAt"] == "2026-01-01 00:00:03"
    # 分页：offset 跳过最新 1 条
    paged = repo.list_conversations(uid, 1, 1)
    assert [r["title"] for r in paged] == ["居中"]


def test_append_and_recent():
    uid = "u-msgs"
    conv_id = repo.create_conversation(uid, "多轮排错")
    msgs = []
    for i in range(8):
        role = "user" if i % 2 == 0 else "assistant"
        msgs.append({"role": role, "content": f"消息{i}", "sources": None if role == "user" else [f"case-{i}-片段"]})
    db.ex("UPDATE ai_conversations SET updated_at='2020-01-01 00:00:00' WHERE id=?", (conv_id,))
    repo.append_messages(conv_id, msgs)
    # 同一事务内 updated_at 被拨回当前
    conv = repo.get_conversation(conv_id, uid)
    assert conv["updated_at"] > "2020-01-01 00:00:00"
    # 最后 6 条按 id 升序返回，sources 已还原
    recent = repo.recent_messages(conv_id, 6)
    assert [m["content"] for m in recent] == [f"消息{i}" for i in range(2, 8)]
    assert [m["role"] for m in recent] == ["user", "assistant", "user", "assistant", "user", "assistant"]
    assert recent[0]["sources"] == []
    assert recent[1]["sources"] == ["case-3-片段"]
    assert recent[-1]["sources"] == ["case-7-片段"]


def test_delete_scoped():
    uid = "u-del"
    conv_id = repo.create_conversation(uid, "要删的会话")
    repo.append_messages(conv_id, [{"role": "user", "content": "接口 500 了", "sources": None}])
    # 他人删除返回 False 且两表不动
    assert repo.delete_conversation(conv_id, "u-stranger") is False
    assert repo.get_conversation(conv_id, uid) is not None
    assert len(db.q("SELECT * FROM ai_messages WHERE conversation_id=?", (conv_id,))) == 1
    # 属主删除返回 True，两表皆空
    assert repo.delete_conversation(conv_id, uid) is True
    assert repo.get_conversation(conv_id, uid) is None
    assert db.q("SELECT * FROM ai_messages WHERE conversation_id=?", (conv_id,)) == []
    assert db.q("SELECT * FROM ai_conversations WHERE id=?", (conv_id,)) == []


def test_prune_keeps_latest():
    uid = "u-prune"
    ids = [repo.create_conversation(uid, f"会话{i}") for i in range(105)]
    for cid in ids[:5]:
        repo.append_messages(cid, [{"role": "user", "content": f"旧消息{cid}", "sources": None}])
    # 最旧 5 个拨回过去，避免与其余 100 个同秒并列
    for cid in ids[:5]:
        db.ex("UPDATE ai_conversations SET updated_at='2020-01-01 00:00:00' WHERE id=?", (cid,))
    repo.prune_conversations(uid, 100)
    assert repo.count_conversations(uid) == 100
    remaining = {r["id"] for r in repo.list_conversations(uid, 500, 0)}
    assert not (set(ids[:5]) & remaining)
    assert set(ids[5:]) <= remaining
    # 被裁剪会话的消息同事务连删
    for cid in ids[:5]:
        assert db.q("SELECT * FROM ai_messages WHERE conversation_id=?", (cid,)) == []


# ────────────── service 层：chat 接入会话历史（LangChain 调用 monkeypatch，不触网） ──────────────


class _FakeResp:
    content = "模拟回答"
    response_metadata = {"token_usage": {"prompt_tokens": 1, "completion_tokens": 1}}


class _FakeEmbed:
    model = "fake-embed"

    def embed_query(self, q: str) -> list[float]:
        return [1.0, 0.0]


def _mock_ai(monkeypatch, capture: list | None = None, invoke=None) -> None:
    """patch service.client 三件套；capture 收集 invoke 的 messages，invoke 可注入失败。"""
    from features.ai import client

    class _FakeModel:
        def invoke(self, messages):
            if capture is not None:
                capture.append(list(messages))
            if invoke is not None:
                invoke(messages)
            return _FakeResp()

    monkeypatch.setattr(client, "available", lambda: True)
    monkeypatch.setattr(client, "chat_model", lambda: _FakeModel())
    monkeypatch.setattr(client, "embed_available", lambda: True)
    monkeypatch.setattr(client, "embeddings_model", lambda: _FakeEmbed())


def test_chat_creates_conversation(monkeypatch):
    """无 id 提问：创建会话，出参带 conversationId；落 user+assistant 两条，标题取问题前 30 字。"""
    _mock_ai(monkeypatch)
    uid = "u-svc-create"
    question = "连接池耗尽导致接口大面积超时应该怎么排查，请给出可执行的检查单"
    r = service.chat(question, uid)
    assert r["aiAvailable"] is True
    conv_id = r["conversationId"]
    conv = repo.get_conversation(conv_id, uid)
    assert conv is not None
    assert conv["title"] == question[:30]
    msgs = repo.recent_messages(conv_id, 10)
    assert [(m["role"], m["content"]) for m in msgs] == [("user", question), ("assistant", "模拟回答")]
    assert msgs[1]["sources"] == []


def test_chat_continuation_passes_history(monkeypatch):
    """同会话第二问：invoke 的 messages 在最终 human 之前带第一问的 human/ai 对，历史至多 6 条。"""
    captured: list[list] = []
    _mock_ai(monkeypatch, capture=captured)
    uid = "u-svc-hist"
    r1 = service.chat("第一问：什么是缓存雪崩", uid)
    r2 = service.chat("第二问：怎么预防雪崩", uid, conversation_id=r1["conversationId"])
    assert r2["answer"] == "模拟回答"
    assert len(captured) == 2
    msgs = captured[1]
    assert msgs[0][0] == "system"
    assert msgs[-1][0] == "human" and "第二问" in msgs[-1][1]
    middle = msgs[1:-1]
    assert len(middle) <= 6  # HISTORY_ROUNDS=3 → 历史至多 3 对
    assert ("human", "第一问：什么是缓存雪崩") in middle
    assert ("ai", "模拟回答") in middle


def test_chat_retrieval_query_concatenates_prev(monkeypatch):
    """同会话第二问：检索词 = 上一问 + 当前问；首问仍只用当前问。"""
    queries: list[str] = []

    def fake_retrieve(q, k=4):
        queries.append(q)
        return []

    _mock_ai(monkeypatch)
    monkeypatch.setattr(service, "node_retrieve", fake_retrieve)
    uid = "u-svc-query"
    r1 = service.chat("什么是缓存雪崩", uid)
    service.chat("怎么预防雪崩", uid, conversation_id=r1["conversationId"])
    assert queries[0] == "什么是缓存雪崩"
    assert "什么是缓存雪崩" in queries[1] and "怎么预防雪崩" in queries[1]


def test_chat_foreign_conversation_404(monkeypatch):
    """B 用户拿 A 的 conversationId 提问 → 404，B 不产生新会话，A 会话完好。"""
    _mock_ai(monkeypatch)
    uid_a, uid_b = "u-svc-a", "u-svc-b"
    r = service.chat("A 的问题", uid_a)
    with pytest.raises(HTTPException) as ei:
        service.chat("B 借会话提问", uid_b, conversation_id=r["conversationId"])
    assert ei.value.status_code == 404
    assert repo.count_conversations(uid_b) == 0
    assert repo.get_conversation(r["conversationId"], uid_a) is not None


def test_chat_model_failure_leaves_no_trace(monkeypatch):
    """模型调用失败：返回固定文案（不泄露异常细节），该 uid 不产生任何会话。"""

    def boom(messages):
        raise RuntimeError("网络中断")

    _mock_ai(monkeypatch, invoke=boom)
    uid = "u-svc-fail"
    r = service.chat("这个问题会失败", uid)
    assert r["error"] == "服务暂时不可用，请稍后再试"
    assert "RuntimeError" not in json.dumps(r, ensure_ascii=False)
    assert r["aiAvailable"] is True
    assert repo.count_conversations(uid) == 0


def test_prune_on_chat(monkeypatch):
    """已有 100 个会话时提问：创建新会话后淘汰最旧，总数仍 100 且新会话存活。"""
    _mock_ai(monkeypatch)
    uid = "u-svc-prune"
    ids = {repo.create_conversation(uid, f"旧会话{i}") for i in range(100)}
    # 旧会话整体拨回过去，避免与本次提问产生的会话同秒并列导致淘汰不确定
    db.ex("UPDATE ai_conversations SET updated_at='2020-01-01 00:00:00' WHERE uid=?", (uid,))
    r = service.chat("触发淘汰的提问", uid)
    assert repo.count_conversations(uid) == 100
    remaining = {row["id"] for row in repo.list_conversations(uid, 500, 0)}
    assert r["conversationId"] in remaining
    assert len(remaining & ids) == 99
