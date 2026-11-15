"""AI 对话流式化测试：事件序列/审计/契约迁移。"""

import json

import pytest
from langchain_core.messages import AIMessageChunk

import db


def test_reasoner_model_binds_deepseek_streaming():
    """对话模型：默认 deepseek-reasoner，流式带用量（审计不丢），300s 超时容纳长思考。"""
    from core import config
    from features.ai import client

    m = client.reasoner_model()
    assert config.AI_REASONER_MODEL == "deepseek-reasoner"
    assert m.model_name == "deepseek-reasoner"
    assert m.stream_usage is True
    assert m.request_timeout == 300


# ────────────── service 层：chat_stream 事件生成器（模型流 monkeypatch，不触网） ──────────────


def _rc(text):  # reasoning 增量块
    return AIMessageChunk(content="", additional_kwargs={"reasoning_content": text})


def _ans(text, usage=None):  # answer 增量块；末块带 usage_metadata
    kw = {"usage_metadata": usage} if usage else {}
    return AIMessageChunk(content=text, **kw)


class _FakeStreamModel:
    """按预设 chunk 序列逐个吐出；capture 收 stream() 收到的 messages；error 注入失败。"""

    def __init__(self, chunks, capture=None, error=None):
        self._chunks, self._capture, self._error = chunks, capture, error

    def stream(self, messages):
        if self._capture is not None:
            self._capture.append(list(messages))
        yield from self._chunks
        if self._error is not None:
            raise self._error


def _mock_stream(monkeypatch, chunks, capture=None, error=None):
    from features.ai import client

    class _FakeEmbed:
        model = "fake-embed"

        def embed_query(self, q):
            return [1.0, 0.0]

    monkeypatch.setattr(client, "available", lambda: True)
    monkeypatch.setattr(client, "reasoner_model", lambda: _FakeStreamModel(chunks, capture, error))
    monkeypatch.setattr(client, "embed_available", lambda: True)
    monkeypatch.setattr(client, "embeddings_model", lambda: _FakeEmbed())


def test_stream_event_sequence_and_persistence(monkeypatch):
    """全链路：事件顺序 status×2→reasoning→answer→sources→done；落库只有完整答案、无思维链。"""
    import db
    from features.ai import repo, service

    # langchain UsageMetadata 必含 total_tokens（库 schema 钉死），其余取值与计划一致
    usage_md = {"input_tokens": 11, "output_tokens": 7, "total_tokens": 18}
    _mock_stream(
        monkeypatch,
        [_rc("先想"), _rc("后想"), _ans("答"), _ans("案"), _ans("", usage_md)],
    )
    monkeypatch.setattr(service, "node_retrieve", lambda q, k=4: [
        {"caseId": "case-src", "kind": "overview", "content": "c", "score": 0.9}])
    db.ex("INSERT INTO cases(id,title,domain,layer,difficulty,version,content_revision,status,payload) "
          "VALUES('case-src','引用案例','runtime','运行时',1,1,1,'published','{}')")
    try:
        uid = "u-stream-seq"
        evs = list(service.chat_stream("连接池耗尽导致接口大面积超时怎么排查", uid))
        assert [(e["type"]) for e in evs][:2] == ["status", "status"]
        assert evs[0]["phase"] == "retrieving"
        assert evs[1]["phase"] == "thinking" and evs[1]["hits"] == 1
        assert [e["text"] for e in evs if e["type"] == "reasoning"] == ["先想", "后想"]
        assert "".join(e["text"] for e in evs if e["type"] == "answer") == "答案"
        src = next(e for e in evs if e["type"] == "sources")
        assert src["sources"] == [{"caseId": "case-src", "title": "引用案例"}]
        assert len(src["conversationId"]) == 32  # repo.create_conversation = uuid4().hex（32 位，非带连字符 36 位）
        assert evs[-1] == {"type": "done"}
        # 落库：两条消息，content 是完整答案；思维链文本不进任何消息内容
        msgs = repo.recent_messages(src["conversationId"], 10)
        assert [(m["role"], m["content"]) for m in msgs] == [
            ("user", "连接池耗尽导致接口大面积超时怎么排查"), ("assistant", "答案")]
        all_content = json.dumps([dict(m) for m in repo.all_messages(src["conversationId"])], ensure_ascii=False)
        assert "先想" not in all_content
        # usage 审计：末块 usage_metadata 进台账（kind='chat'，ok=1）
        row = db.q("SELECT prompt_tokens, completion_tokens, ok FROM ai_usage WHERE uid=? AND kind='chat'", (uid,))[-1]
        assert (row["prompt_tokens"], row["completion_tokens"], row["ok"]) == (11, 7, 1)
    finally:
        db.ex("DELETE FROM cases WHERE id='case-src'")
        db.ex("DELETE FROM ai_usage WHERE uid='u-stream-seq'")
        db.ex("DELETE FROM ai_conversations WHERE uid='u-stream-seq'")


def test_stream_without_reasoning_still_answers(monkeypatch):
    """模型不吐 reasoning_content：无 reasoning 帧，answer 完整，done 照常（评审聚焦点 2）。"""
    from features.ai import service

    _mock_stream(monkeypatch, [_ans("只"), _ans("回答")])
    monkeypatch.setattr(service, "node_retrieve", lambda q, k=4: [])
    evs = list(service.chat_stream("这个问题足够长了吧", "u-stream-norc"))
    assert not [e for e in evs if e["type"] == "reasoning"]
    assert "".join(e["text"] for e in evs if e["type"] == "answer") == "只回答"
    assert evs[-1] == {"type": "done"}


def test_stream_model_failure_emits_error_and_leaves_no_trace(monkeypatch):
    """流中模型失败：error 事件（固定文案不泄露细节）、无 sources/done、不落会话、usage 记 ok=0。"""
    import db
    from features.ai import repo, service

    _mock_stream(monkeypatch, [_ans("半"), _ans("截")], error=RuntimeError("网络中断"))
    monkeypatch.setattr(service, "node_retrieve", lambda q, k=4: [])
    uid = "u-stream-fail"
    evs = list(service.chat_stream("这个问题会中途失败", uid))
    err = next(e for e in evs if e["type"] == "error")
    assert err["error"] == "服务暂时不可用，请稍后再试" and err["aiAvailable"] is True
    assert "RuntimeError" not in json.dumps(evs, ensure_ascii=False)
    assert not [e for e in evs if e["type"] in ("sources", "done")]
    assert repo.count_conversations(uid) == 0
    assert db.q("SELECT ok FROM ai_usage WHERE uid=?", (uid,))[-1]["ok"] == 0
    db.ex("DELETE FROM ai_usage WHERE uid=?", (uid,))


def test_stream_client_abort_audits_usage_without_persist(monkeypatch):
    """客户端中途断开（GeneratorExit）：usage 记 ok=0、不落库（评审聚焦点 1）。"""
    import db
    from features.ai import repo, service

    _mock_stream(monkeypatch, [_rc("想想"), _ans("答"), _ans("案")])
    monkeypatch.setattr(service, "node_retrieve", lambda q, k=4: [])
    uid = "u-stream-abort"
    gen = service.chat_stream("这个问题被用户中途关掉", uid)
    next(gen)
    next(gen)  # 消费到 status×2 即断开
    gen.close()
    assert repo.count_conversations(uid) == 0
    assert db.q("SELECT ok FROM ai_usage WHERE uid=?", (uid,))[-1]["ok"] == 0
    db.ex("DELETE FROM ai_usage WHERE uid=?", (uid,))


def test_stream_business_guards_emit_error_events(monkeypatch):
    """可用性/限速/配额三种业务错误：首事件即 error、不开检索、不产生会话与 usage。"""
    import db
    from features.ai import repo, service

    _mock_stream(monkeypatch, [])
    from features.ai import client

    monkeypatch.setattr(client, "available", lambda: False)
    evs = list(service.chat_stream("问", "u-stream-guard"))
    assert evs == [{"type": "error", "error": "AI 服务暂未开放，稍后再试", "aiAvailable": False}]
    monkeypatch.setattr(client, "available", lambda: True)  # brief 漏了恢复：否则限速/配额场景仍被可用性门拦下
    monkeypatch.setattr(service, "_rate_ok", lambda uid: False)
    evs = list(service.chat_stream("问", "u-stream-guard"))
    assert evs[0]["error"] == "提问太频繁，稍后再试" and evs[0]["aiAvailable"] is True
    monkeypatch.setattr(service, "_rate_ok", lambda uid: True)
    monkeypatch.setattr(service, "_daily_used", lambda uid: 10**9)
    evs = list(service.chat_stream("问", "u-stream-guard"))
    assert evs[0]["error"] == "今日提问次数已达上限，明天再来"
    assert repo.count_conversations("u-stream-guard") == 0
    assert db.q("SELECT COUNT(*) AS n FROM ai_usage WHERE uid='u-stream-guard'")[0]["n"] == 0


def test_chat_validate_raises_404_for_foreign(monkeypatch):
    """属主校验：非本人会话 raise 404；本人会话与首问（id=None）放行。"""
    from fastapi import HTTPException

    from features.ai import repo, service

    _mock_stream(monkeypatch, [])
    conv_id = repo.create_conversation("u-validate-a", "A 的会话")
    with pytest.raises(HTTPException) as ei:
        service.chat_validate("问", "u-validate-b", conv_id)
    assert ei.value.status_code == 404
    service.chat_validate("问", "u-validate-a", conv_id)  # 本人 → 不抛
    service.chat_validate("问", "u-validate-b", None)  # 首问 → 不抛
    db.ex("DELETE FROM ai_conversations WHERE uid='u-validate-a'")
