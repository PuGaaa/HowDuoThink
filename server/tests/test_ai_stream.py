"""AI 对话流式化测试：事件序列/审计/契约迁移。"""

import json
import os
from types import SimpleNamespace

import pytest

import db


def test_reasoner_client_binds_deepseek_direct(monkeypatch):
    """直连客户端（原 reasoner_model 契约平移）：OpenAI SDK 构造参数同 base_url/key、timeout=300 容纳推理长思考。"""
    from core import config
    from features.ai import client

    captured = {}

    class _FakeOpenAI:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr("openai.OpenAI", _FakeOpenAI)
    client._reasoner_client.cache_clear()
    try:
        client._reasoner_client()
    finally:
        client._reasoner_client.cache_clear()  # 防假客户端残留在 lru_cache 毒化其他用例
    assert config.AI_REASONER_MODEL == "deepseek-reasoner"
    assert captured["base_url"] == config.AI_BASE_URL
    assert captured["api_key"] == (config.DEEPSEEK_API_KEY or "unset-deepseek-key")
    assert captured["timeout"] == 300


def test_reasoner_stream_maps_roles_and_emits_delta_events(monkeypatch):
    """适配器契约：LangChain 角色元组映射 OpenAI dicts；逐 chunk 产 reasoning/content 事件，
    末包 usage（include_usage）产 {"usage": {prompt_tokens, completion_tokens}}。"""
    from core import config
    from features.ai import client

    captured = {}
    chunks = [
        SimpleNamespace(
            usage=None, choices=[SimpleNamespace(delta=SimpleNamespace(reasoning_content="先想", content=None))]
        ),
        SimpleNamespace(
            usage=None, choices=[SimpleNamespace(delta=SimpleNamespace(reasoning_content=None, content="答"))]
        ),
        # include_usage 末包：无 choices，仅带 usage
        SimpleNamespace(usage=SimpleNamespace(prompt_tokens=11, completion_tokens=7), choices=[]),
    ]

    class _FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return iter(chunks)

    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=_FakeCompletions()))
    monkeypatch.setattr(client, "_reasoner_client", lambda: fake_client)

    evs = list(client.reasoner_stream([("system", "s"), ("human", "q"), ("ai", "a"), ("human", "q2")]))
    assert evs == [{"reasoning": "先想"}, {"content": "答"}, {"usage": {"prompt_tokens": 11, "completion_tokens": 7}}]
    assert captured["model"] == config.AI_REASONER_MODEL == "deepseek-reasoner"
    assert captured["stream"] is True
    assert captured["stream_options"] == {"include_usage": True}
    assert captured["temperature"] == 0.3
    assert captured["messages"] == [
        {"role": "system", "content": "s"},
        {"role": "user", "content": "q"},
        {"role": "assistant", "content": "a"},
        {"role": "user", "content": "q2"},
    ]


# ────────────── service 层：chat_stream 事件生成器（reasoner_stream monkeypatch，不触网） ──────────────


def _rc(text):  # reasoning 增量事件（SDK delta.reasoning_content 直传形状）
    return {"reasoning": text}


def _ans(text):  # answer 增量事件
    return {"content": text}


def _usage(pin, pout):  # 末包用量事件（stream_options.include_usage）
    return {"usage": {"prompt_tokens": pin, "completion_tokens": pout}}


class _FakeReasonerStream:
    """按预设事件序列逐个吐出；capture 收 reasoner_stream() 收到的 messages；error 注入失败。"""

    def __init__(self, events, capture=None, error=None):
        self._events, self._capture, self._error = events, capture, error

    def __call__(self, messages):
        if self._capture is not None:
            self._capture.append(list(messages))

        def gen():
            yield from self._events
            if self._error is not None:
                raise self._error

        return gen()


def _mock_stream(monkeypatch, events, capture=None, error=None):
    from features.ai import client

    class _FakeEmbed:
        model = "fake-embed"

        def embed_query(self, q):
            return [1.0, 0.0]

    monkeypatch.setattr(client, "available", lambda: True)
    monkeypatch.setattr(client, "reasoner_stream", _FakeReasonerStream(events, capture, error))
    monkeypatch.setattr(client, "embed_available", lambda: True)
    monkeypatch.setattr(client, "embeddings_model", lambda: _FakeEmbed())


def test_stream_event_sequence_and_persistence(monkeypatch):
    """全链路：事件顺序 status×2→reasoning→answer→sources→done；落库只有完整答案、无思维链。"""
    import db
    from features.ai import repo, service

    _mock_stream(
        monkeypatch,
        [_rc("先想"), _rc("后想"), _ans("答"), _ans("案"), _usage(11, 7)],
    )
    monkeypatch.setattr(
        service,
        "node_retrieve",
        lambda q, k=4: [{"caseId": "case-src", "kind": "overview", "content": "c", "score": 0.9}],
    )
    db.ex(
        "INSERT INTO cases(id,title,domain,layer,difficulty,version,content_revision,status,payload) "
        "VALUES('case-src','引用案例','runtime','运行时',1,1,1,'published','{}')"
    )
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
            ("user", "连接池耗尽导致接口大面积超时怎么排查"),
            ("assistant", "答案"),
        ]
        all_content = json.dumps([dict(m) for m in repo.all_messages(src["conversationId"])], ensure_ascii=False)
        assert "先想" not in all_content
        # usage 审计：末包 usage 进台账（kind='chat'，ok=1）
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


# ────────────── HTTP 层：SSE 流式契约（TestClient，建号+登录拿 cookie，复用任务 2 的 mock 搭法） ──────────────

_PW = os.environ["ADMIN_PASSWORD"] + "-stream"


def make_user(login_name: str) -> None:
    """测试库直接建号（bcrypt 密码），再走标准登录拿 cookie（与 tests/test_ai_conversations.py 同款）。"""
    from core import security

    db.ex(
        "INSERT INTO users(id, login, name, role, password_hash) VALUES(?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET role=excluded.role, password_hash=excluded.password_hash",
        (f"pw-{login_name}", login_name, login_name, "user", security.hash_password(_PW)),
    )


def login(c, login_name: str) -> None:
    r = c.post("/api/auth/login", json={"login": login_name, "password": _PW})
    assert r.status_code == 200, r.text


def test_http_sse_contract(monkeypatch):
    """HTTP 契约：content-type/响应头/帧序（评审聚焦点 3、4）。

    最小假模型（无 reasoning/answer 增量）→ 帧序恰为 status,status,sources,done；
    答案完整性的断言面由 service 级用例守。"""
    from fastapi.testclient import TestClient

    import main
    from features.ai import service
    from tests.conftest import sse_events

    _mock_stream(monkeypatch, [])
    monkeypatch.setattr(service, "node_retrieve", lambda q, k=4: [])
    c = TestClient(main.app)
    make_user("u-http-sse")
    login(c, "u-http-sse")
    r = c.post("/api/ai/chat", json={"question": "缓存雪崩怎么预防"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-cache"
    assert r.headers["x-accel-buffering"] == "no"
    evs = sse_events(r)
    assert [e for e, _ in evs] == ["status", "status", "sources", "done"]
    # data 不携带 type 键（类型在 event 行）
    assert all("type" not in d for _, d in evs)


def test_http_foreign_conversation_404_before_stream(monkeypatch):
    """他人会话 id：404 且响应不是 event-stream（校验发生在首字节前）。"""
    from fastapi.testclient import TestClient

    import main
    from features.ai import repo, service
    from tests.conftest import sse_events

    _mock_stream(monkeypatch, [])
    monkeypatch.setattr(service, "node_retrieve", lambda q, k=4: [])
    make_user("u-http-404a")
    make_user("u-http-404b")
    ca = TestClient(main.app)
    cb = TestClient(main.app)
    login(ca, "u-http-404a")
    login(cb, "u-http-404b")
    r = ca.post("/api/ai/chat", json={"question": "A 的开场问题足够长"})
    conv_id = next(d for e, d in sse_events(r) if e == "sources")["conversationId"]
    rb = cb.post("/api/ai/chat", json={"question": "B 借用他人会话提问", "conversationId": conv_id})
    assert rb.status_code == 404
    assert "event-stream" not in rb.headers["content-type"]
    # B 不产生新会话，A 的会话完好
    assert repo.count_conversations("pw-u-http-404b") == 0
    assert repo.get_conversation(conv_id, "pw-u-http-404a") is not None


def test_http_401_without_login():
    """未登录：401 在开流前以 HTTP 状态码返回。"""
    from fastapi.testclient import TestClient

    import main

    r = TestClient(main.app).post("/api/ai/chat", json={"question": "未登录提问足够长"})
    assert r.status_code == 401


def test_http_retrieval_crash_still_yields_error_frame(monkeypatch):
    """检索在 chat_stream 的 try 块之外裸抛（任务 2 评审契约）：HTTP 层必须收到
    error 帧（固定文案）而非 500/断流；异常细节不外泄。"""
    from fastapi.testclient import TestClient

    import main
    from features.ai import service
    from tests.conftest import sse_events

    _mock_stream(monkeypatch, [])

    def boom(q, k=4):
        raise RuntimeError("索引库炸了")

    monkeypatch.setattr(service, "node_retrieve", boom)
    c = TestClient(main.app)
    make_user("u-http-retr")
    login(c, "u-http-retr")
    r = c.post("/api/ai/chat", json={"question": "检索崩了也要有 error 帧"})
    assert r.status_code == 200
    evs = sse_events(r)
    assert [e for e, _ in evs] == ["status", "error"]
    assert evs[1][1] == {"error": "服务暂时不可用，请稍后再试", "aiAvailable": True}
    assert "RuntimeError" not in r.text
