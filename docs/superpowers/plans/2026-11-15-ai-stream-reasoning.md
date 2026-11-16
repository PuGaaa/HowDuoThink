# AI 对话流式化（SSE 思维链 + RAG 过程状态）实施计划

> **给执行者：** 必须使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现本计划。步骤用复选框 `- [ ]` 追踪。

**目标：** Web AI 排错对话改为 SSE 流式：实时展示 deepseek-reasoner 思维链（可折叠面板）+ 检索/思考/输出过程状态 + 打字机回答；思考不落库。

**架构：** `POST /api/ai/chat` 从同步 JSON 改为 `text/event-stream`（事件：status→reasoning→answer→sources→done/error）；service 层 `chat()` 拆为事件生成器 `chat_stream()` + 开流前校验 `chat_validate()`；对话模型换 `client.reasoner_model()`（deepseek-reasoner），起草管线保持 deepseek-chat；web 端 fetch+ReadableStream 手解析 SSE，增量就地更新最后一条 assistant 消息。

**技术栈：** FastAPI StreamingResponse（同步生成器，线程池）、langchain-openai 1.7.3（`stream_usage=True`，chunk.additional_kwargs 带 `reasoning_content`）、Nuxt 3（无单测基建，验证靠 `npm run typecheck` + 真链路截图）。

**规格：** `docs/superpowers/specs/2026-11-15-ai-stream-reasoning-design.md`（执行者两份都要读）

## 全局约束

- 思考内容不落库：任何表不加列、不迁移；落库 content = 已流出的完整答案
- 业务错误文案钉死沿用现值：「AI 服务暂未开放，稍后再试」「提问太频繁，稍后再试」「今日提问次数已达上限，明天再来」「服务暂时不可用，请稍后再试」；错误响应不泄露堆栈/异常细节
- 401（未登录）、404（会话查无/非本人）必须在 SSE 首字节前以 HTTP 状态码返回；限速/配额/可用性开流后走 `error` 事件（等价现行 200+error 字段）
- `AI_REASONER_MODEL` 默认 `deepseek-reasoner`，同 `AI_BASE_URL` 同 key——dev/prod 同一实现同一默认，仅允许 env 覆盖值；禁止本地替身实现
- 新 SQL 按 SQLite 方言书写（本计划无新 DDL，沿用现有 repo）
- 保持同步 `def` 路由风格（Starlette 线程池迭代同步生成器），不引入 async
- 前端气泡文案不出现接口地址/原始异常；env 文件只读 key 存在性，不得读取/输出值
- AI 起草管线（`node_draft`/`ai_draft_from_submission`）行为零变更，继续走 `chat_model()`

## 评审聚焦点

规格隐含、但最可能咬到用户的失败模式（对应测试已折进拥有该代码的任务）：

1. **客户端在 reasoning/answer 流中途 abort** → 服务端生成器 GeneratorExit：usage 审计必须已落（ok=0）、会话不落库 → 任务 2 测试
2. **模型不吐 reasoning_content**（行为漂移/降级）→ 事件序列退化为无 reasoning 帧，答案仍完整到达 → 任务 2 测试
3. **404 校验时序**：拿他人 conversationId 提问必须 404 且响应不是 event-stream（不能先开流再报错）→ 任务 3 测试
4. **代理缓冲 SSE** 导致前端整包一次到：响应头必须带 `X-Accel-Buffering: no` → 任务 3 测试
5. **前端收到非 200（401 登录过期/404）或半截连接中断** → 错误气泡兜底、不出现未处理 rejection、不泄露细节 → 任务 4 实现约束 + 任务 6 手动验证

---

### 任务 1：服务端模型层——`AI_REASONER_MODEL` 配置与 `reasoner_model()`

**文件：**
- 修改：`server/core/config.py`（AI_CHAT_MODEL 定义处，约 :33 旁）
- 修改：`server/features/ai/client.py`（`chat_model()` 之后）
- 测试：`server/tests/test_ai_stream.py`（新建）

**接口：**
- 消费：无（本任务起始）
- 产出：`config.AI_REASONER_MODEL: str`；`client.reasoner_model() -> ChatOpenAI`（lru_cache(maxsize=1)，与 `chat_model()` 同款）

- [ ] **步骤 1：写失败测试**

`server/tests/test_ai_stream.py` 新建，文件 docstring 说明「AI 对话流式化测试：事件序列/审计/契约迁移」：

```python
def test_reasoner_model_binds_deepseek_streaming():
    """对话模型：默认 deepseek-reasoner，流式带用量（审计不丢），300s 超时容纳长思考。"""
    from features.ai import client
    from core import config

    m = client.reasoner_model()
    assert config.AI_REASONER_MODEL == "deepseek-reasoner"
    assert m.model_name == "deepseek-reasoner"
    assert m.stream_usage is True
    assert m.request_timeout == 300
```

- [ ] **步骤 2：跑测试确认失败**

运行：`cd server && .venv/bin/python -m pytest tests/test_ai_stream.py -v`
预期：失败，`AttributeError`（`AI_REASONER_MODEL` / `reasoner_model` 不存在）

- [ ] **步骤 3：实现**

- `core/config.py`：AI_CHAT_MODEL 下一行加 `AI_REASONER_MODEL = os.environ.get("AI_REASONER_MODEL", "deepseek-reasoner")`
- `client.py`：照 `chat_model()` 模板新增 `reasoner_model()`——参数 `model=config.AI_REASONER_MODEL, base_url=config.AI_BASE_URL, api_key=config.DEEPSEEK_API_KEY, temperature=0.3, timeout=300, stream_usage=True`；`lru_cache(maxsize=1)`；docstring 说明分工（对话思维链 vs 起草结构化输出）。文件头部供应商分工注释补一行 reasoner

- [ ] **步骤 4：跑测试确认通过**

运行：`cd server && .venv/bin/python -m pytest tests/test_ai_stream.py -v`
预期：通过

- [ ] **步骤 5：提交**

```bash
git add server/core/config.py server/features/ai/client.py server/tests/test_ai_stream.py
git commit -m "feat(ai): reasoner_model 客户端——对话走 deepseek-reasoner（stream_usage 审计），起草保持 chat_model"
```

---

### 任务 2：service 层流式化——`chat_stream` / `chat_validate` / `node_answer_stream`，删除 `chat()`/`node_answer()`

**文件：**
- 修改：`server/features/ai/service.py`（chat 区块 ：282-329 与 node_answer :248-271 整体重写）
- 修改：`server/tests/test_ai_conversations.py`（`_mock_ai` :122-137 与 service 级用例 ：140-229 迁移）
- 测试：`server/tests/test_ai_stream.py`（任务 1 新建的文件内追加）

**接口：**
- 消费：`client.reasoner_model()`（任务 1）；`node_retrieve` / `_conversation_context` / `repo.*` / `usage.log_usage`（现有）
- 产出（任务 3 的 router 依赖，签名钉死）：
  - `service.chat_validate(question: str, uid: str, conversation_id: str | None) -> None`——conversation_id 给定且 `repo.get_conversation` 查无/非本人时 raise `HTTPException(404, detail="会话不存在或无权访问")`
  - `service.chat_stream(question: str, uid: str, conversation_id: str | None = None) -> Generator[dict]`——事件 dict 形如 `{"type": "status", "phase": "retrieving"}`；**生成器不做属主校验**（docstring 写明前置条件：调用方必须先过 `chat_validate`）
  - `service.node_answer_stream(question: str, chunks: list[dict], uid: str | None = None, history: list[tuple[str, str]] | None = None) -> Generator[dict]`——只 yield `{"type": "reasoning"|"answer", "text": <delta>}`

- [ ] **步骤 1：写失败测试**（追加到 `tests/test_ai_stream.py`）

假模型与事件工具（放文件顶部，`test_ai_conversations.py` 迁移时复用同款形状）：

```python
from langchain_core.messages import AIMessageChunk

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
        def embed_query(self, q): return [1.0, 0.0]
    monkeypatch.setattr(client, "available", lambda: True)
    monkeypatch.setattr(client, "reasoner_model", lambda: _FakeStreamModel(chunks, capture, error))
    monkeypatch.setattr(client, "embed_available", lambda: True)
    monkeypatch.setattr(client, "embeddings_model", lambda: _FakeEmbed())
```

用例（断言取值逐字钉死）：

```python
def test_stream_event_sequence_and_persistence(monkeypatch):
    """全链路：事件顺序 status×2→reasoning→answer→sources→done；落库只有完整答案、无思维链。"""
    import db
    from features.ai import repo, service
    usage_md = {"input_tokens": 11, "output_tokens": 7}
    _mock_stream(monkeypatch,
                 [_rc("先想"), _rc("后想"), _ans("答"), _ans("案"), _ans("", usage_md)])
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
        assert len(src["conversationId"]) == 36
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
    next(gen); next(gen)  # 消费到 status×2 即断开
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
    service.chat_validate("问", "u-validate-b", None)     # 首问 → 不抛
```

- [ ] **步骤 2：跑测试确认失败**

运行：`cd server && .venv/bin/python -m pytest tests/test_ai_stream.py -v`
预期：新用例全部失败（`chat_stream`/`node_answer_stream`/`chat_validate` 不存在），任务 1 的用例仍通过

- [ ] **步骤 3：实现 `service.py` 三件套，删除 `chat()` 与 `node_answer()`**

- `node_answer_stream`：messages 组装与 `node_answer` 逐行相同（system → history → human 上下文拼接）；`client.reasoner_model().stream(messages)` 逐 chunk：`additional_kwargs.get("reasoning_content")` 非空 → yield reasoning 增量；`chunk.content` 非空字符串 → yield answer 增量；`getattr(chunk, "usage_metadata", None)` → 暂存 pin/pout（`input_tokens`/`output_tokens`，后包覆盖前包）。审计单点在 `finally`：`ok` 标志循环正常结束才置 True，`finally` 里 `usage.log_usage(uid, "chat", pin, pout, 耗时, ok=ok)`——覆盖成功/异常/GeneratorExit 三条路径且不重复落行
- `chat_stream`：前置（available→限速→日配额，顺序同现行 `chat()`）不合格即 yield error 事件并 return；其余按规格 §2 顺序：yield status(retrieving) → `node_retrieve` → yield status(thinking, hits=len(chunks)) → 迭代 `node_answer_stream` 边累计答案边透传（`except Exception` → yield error 后 return，不落库；不捕 GeneratorExit）→ 现行 sources 去重查标题逻辑 → 现行建会话/append_messages/prune → yield sources → yield done
- 删除 `chat()`、`node_answer()`；模块 docstring 与 chat 区块注释同步改写（「同步 JSON」表述 → 「SSE 事件流」）

- [ ] **步骤 4：迁移 `tests/test_ai_conversations.py` service 级用例（同任务完成，全量测试必须绿）**

- `_mock_ai`（:122-137）：改 patch `client.reasoner_model`，假模型用本任务 `_FakeStreamModel` 形状（`[AIMessageChunk(content="模拟回答", usage_metadata={"input_tokens":1,"output_tokens":1})]`）；删 `_FakeResp`
- `test_chat_creates_conversation` / `test_chat_continuation_passes_history` / `test_chat_retrieval_query_concatenates_prev` / `test_prune_on_chat`：`service.chat(...)` → `list(service.chat_stream(...))`，conversationId 从 sources 事件取（helper：`_conv_id(evs)`）；其余断言不动
- `test_chat_foreign_conversation_404`：改为断言 `service.chat_validate` raise 404
- `test_chat_model_failure_leaves_no_trace`：改 error 事件断言（文案同上表）

- [ ] **步骤 5：全量测试确认通过**

运行：`cd server && .venv/bin/python -m pytest tests/ -v`
预期：`test_ai_stream.py` 全绿；`test_ai_conversations.py` 迁移后全绿；**此时 HTTP 级用例（:250 起三个 + test_ai.py 降级用例 + test_ai_rate.py 日配额用例）允许红**——它们属于任务 3

- [ ] **步骤 6：提交**

```bash
git add server/features/ai/service.py server/tests/test_ai_stream.py server/tests/test_ai_conversations.py
git commit -m "feat(ai): chat_stream 事件生成器+reasoner 思维链节点，审计覆盖中断路径；删除同步 chat/node_answer"
```

---

### 任务 3：router SSE 契约 + HTTP 级测试迁移

**文件：**
- 修改：`server/features/ai/router.py`（`ai_chat` :11-13）
- 修改：`server/tests/conftest.py`（追加 `sse_events` 工具函数）
- 修改：`server/tests/test_ai.py`（`test_chat_degrades_without_key` :98-108）
- 修改：`server/tests/test_ai_conversations.py`（HTTP 级用例 ：248-340 中三处 `.json()["conversationId"]` 与详情内容断言）
- 修改：`server/tests/test_ai_rate.py`（`_mock_ai` :27-37 与日配额 HTTP 用例 ：80-110）
- 测试：`server/tests/test_ai_stream.py`（追加 HTTP 级用例）

**接口：**
- 消费：`service.chat_validate` / `service.chat_stream`（任务 2 产出，签名见其接口块）
- 产出：HTTP 契约——`POST /api/ai/chat` → `text/event-stream`；帧格式 `event: <type>\ndata: <json(去 type 键)>\n\n`；conftest 工具 `sse_events(resp) -> list[tuple[str, dict]]`（任务 4 无关，但 web 验收任务对照用）

- [ ] **步骤 1：conftest 加 SSE 解析工具 + 写失败测试**

`conftest.py` 追加（与 `login_admin` 同级；顶部补 `import json`）：

```python
def sse_events(resp) -> list[tuple[str, dict]]:
    """TestClient 收齐的 SSE 正文 → (event, data) 列表（测试专用解析）。"""
    out: list[tuple[str, dict]] = []
    for frame in resp.text.split("\n\n"):
        ev, data = None, {}
        for line in frame.splitlines():
            if line.startswith("event: "):
                ev = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        if ev is not None:
            out.append((ev, data))
    return out
```

`tests/test_ai_stream.py` 追加（复用 `tests/test_ai_conversations.py` 的 make_user/login 模式——直接建号+登录拿 cookie）：

```python
def test_http_sse_contract(monkeypatch):
    """HTTP 契约：content-type/响应头/帧序/首字节前校验（评审聚焦点 3、4）。"""
    from fastapi.testclient import TestClient
    import main
    from tests.conftest import sse_events
    # _mock_stream + node_retrieve 置空，用例与任务 2 同款搭法
    ...
    c = TestClient(main.app)
    make_user(c, "u-http-sse"); login(c, "u-http-sse")
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
    # A 登录提问拿 conversationId；B 登录拿它提问 → 404，content-type 不含 event-stream
    ...

def test_http_401_without_login():
    r = TestClient(main.app).post("/api/ai/chat", json={"question": "未登录提问足够长"})
    assert r.status_code == 401
```

（`...` 处按同文件既有用例补齐 Arrange，非留白：断言与结构已钉死。）

- [ ] **步骤 2：跑测试确认失败**

运行：`cd server && .venv/bin/python -m pytest tests/test_ai_stream.py -v`
预期：HTTP 用例失败（路由仍按任务 2 前的状态返回——404 异常未前置/无 SSE 头）

- [ ] **步骤 3：实现 router**

`router.py`：`ai_chat` 先 `service.chat_validate(body.question.strip(), uid, body.conversation_id)`；再返回 `StreamingResponse`——生成器把 `service.chat_stream(...)` 的每个事件 dict 转帧：`f"event: {ev['type']}\ndata: {json.dumps({k: v for k, v in ev.items() if k != 'type'}, ensure_ascii=False)}\n\n"`；`media_type="text/event-stream"`，headers 钉死 `Cache-Control: no-cache` 与 `X-Accel-Buffering: no`。新增 `import json` 与 `from fastapi.responses import StreamingResponse`

- [ ] **步骤 4：迁移既有 HTTP 级用例（全量转绿）**

- `tests/test_ai.py::test_chat_degrades_without_key`：`r.json()["aiAvailable"]` → `sse_events(r)`，断言 `evs[0] == ("error", {"error": 含"暂未开放", "aiAvailable": False})`（文案精确匹配 `AI 服务暂未开放，稍后再试`）
- `tests/test_ai_conversations.py` 三个 HTTP 用例（`test_http_list_pagination_cap` / `test_http_detail_and_delete_flow` / `test_http_foreign_detail_404`）：`r.json()["conversationId"]` → 从 `sse_events(r)` 的 sources 事件取；详情断言 `msgs[1]["content"] == "模拟回答"` 不变（落库仍是完整答案）
- `tests/test_ai_rate.py`：`_mock_ai` 的 `chat_model` patch 改 `reasoner_model`（`_FakeModel` 改 `.stream()` 吐 `[AIMessageChunk(content="模拟回答", usage_metadata={"input_tokens":1,"output_tokens":1})]`）；日配额用例 `r.json()["error"]` → `sse_events(r)[0]` 的 error 事件断言
- 运行：`cd server && .venv/bin/python -m pytest tests/ -v` → **全量绿**（任务 2 步骤 5 遗留的红全数消化）

- [ ] **步骤 5：提交**

```bash
git add server/features/ai/router.py server/tests/
git commit -m "feat(ai): /api/ai/chat 改 SSE 流式契约（404/401 前置），HTTP 级测试迁移"
```

---

### 任务 4：web 流式消费——`utils/sse.ts` 解析器 + `useAiChat.ts` 改造

**文件：**
- 新建：`web/utils/sse.ts`
- 修改：`web/composables/useAiChat.ts`（`ChatMessage`/`ChatResponse`/`send()` :87-126）

**接口：**
- 消费：HTTP SSE 契约（任务 3 产出）
- 产出：`readSse(reader: ReadableStreamDefaultReader<Uint8Array>, onEvent: (type: string, data: Record<string, unknown>) => void): Promise<void>`（utils 自动导入，与 `markdown-lite` 同层）；`ChatMessage` 增 `reasoning?: string`、`phase?: 'retrieving' | 'thinking' | 'answering'`、`thoughtSeconds?: number`（任务 5 消费）

- [ ] **步骤 1：写 `utils/sse.ts`**

签名如上。实现要点钉死：`TextDecoder({ stream: true })` 解码；缓冲按 `\n\n` 切帧、残帧留缓冲；帧内逐行取 `event:`/`data:`（容忍 `\r`）；`JSON.parse` 包 try，坏帧跳过不外抛；流结束（`reader.done`）即 resolve。**遇到非流式响应没有本工具的用武之地——调用方先判 `res.ok`。**

- [ ] **步骤 2：改造 `useAiChat.ts`**

- `ChatMessage` 增三字段（见接口块）；删 `ChatResponse` 接口
- `send()` 重写：入口 `thinking`/epoch 守卫与 user 消息 push 不变；**push 一条 assistant 占位消息** `{ role: 'assistant', text: '', phase: 'retrieving', sources: [], reasoning: '' }`；随后：

```ts
const res = await fetch(api.base + '/api/ai/chat', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: text, ...(conversationId.value ? { conversationId: conversationId.value } : {}) }),
  signal: controller.signal,
})
if (!res.ok || !res.body) throw { status: res.status }   // 401/404/500 → 走既有 catch 气泡路径
await readSse(res.body.getReader(), (type, data) => { /* 见下 */ })
```

- 事件分派（每类事件先做 epoch 比对，视图已重置即 `controller.abort()` + return）：
  - `status`：`msg.phase = data.phase`（'retrieving' | 'thinking'）
  - `reasoning`：`msg.reasoning += data.text`；`msg.phase = 'thinking'`；首个 reasoning 增量时记 `reasoningStart = Date.now()`
  - `answer`：首次到达记 `msg.thoughtSeconds = Math.round((Date.now() - reasoningStart) / 1000)`（无 reasoning 时 `thoughtSeconds` 保持 undefined）；`msg.text += data.text`；`msg.phase = 'answering'`
  - `sources`：`msg.sources = data.sources`；conversationId 绑定逻辑沿用现行
  - `done`：`msg.phase = undefined`
  - `error`：业务错误——若 `msg.text` 非空，保留已流出内容再 push 现行样式错误气泡（文案照显 `data.error`）；否则 push 错误气泡；`aiAvailable === false` 时同样只影响文案
- 流收尾：未收到 `done`（连接中断/解析失败）→ 按 `error: '服务暂时不可用，请稍后再试'` 错误气泡兜底（已流出内容保留）；catch 分支维持现行（status===401 → ERR_AUTH，否则 ERR_NETWORK），console.warn 带原始异常
- 中断管理：模块内 `let controller: AbortController | null`；`send` 开头若 `thinking.value` 直接 return（现行在途锁语义）；`newConversation()`、`removeConversation()` 删除的是当前会话时、以及 `onScopeDispose` → `controller.abort()`
- `openConversation` 回放映射不变（历史消息无 reasoning/phase/thoughtSeconds 字段，类型可选所以兼容）

- [ ] **步骤 3：typecheck 确认通过**

运行：`cd web && npm run typecheck`
预期：0 错误（`ChatMessages.vue` 此刻对新字段视而不见，仍按现行渲染——占位消息 text 为空会短暂渲染空气泡，属任务 5 消除的中间态）

- [ ] **步骤 4：提交**

```bash
git add web/utils/sse.ts web/composables/useAiChat.ts
git commit -m "feat(web): AI 对话改 fetch+SSE 流式消费，思维链/过程态增量就地更新，中断统一 abort"
```

---

### 任务 5：web 呈现——思考折叠面板与过程态气泡（`ChatMessages.vue`）

**文件：**
- 修改：`web/components/ai/ChatMessages.vue`（script + 气泡模板 + style）

**接口：**
- 消费：`ChatMessage.reasoning / phase / thoughtSeconds`（任务 4 产出）
- 产出：无下游消费者（UI 终点）

- [ ] **步骤 1：过程态与思考面板实现**

- phase 文案映射（液滴动画 `.flow` 复用，仅在流式占位消息无正文时显示）：`retrieving` → 「检索案例库中…」（即现行文案）、`thinking` → 「思考中…」、`answering` 起不再显示液滴
- 思考面板：渲染条件 `m.role === 'assistant' && m.reasoning`；置于气泡正文之上；结构 = 标题按钮 + 内容区：
  - 标题：流式中（`phase === 'thinking'` 且无正文）显示「思考过程」，正文到达后显示「已完成思考（N 秒）」（`thoughtSeconds` 有值才带秒数，无值仅「思考过程」）
  - 内容区：`white-space: pre-wrap`、`color: var(--ink2)`、`font-size: 13px`、左侧 2px `var(--line)` 竖线、`max-height` 限制 + `overflow-y: auto`；打开时内容增长自动滚到底（复用列表瞬时滚动 + rAF 兜底手法）
  - 开合状态：组件内单个 `reasoningOpen = ref(true)`（同一时刻只有一条流式消息持有 reasoning）；watch 最后一条消息 `text` 从空变非空 → 自动折叠；标题点击切换；历史消息无 reasoning 不渲染面板
- 自动滚动 watch 扩展：现行 watch（messages.length + thinking）之外，补一条对最后一条消息 `text.length` + 面板打开时 `reasoning.length` 的 watch → `scrollBottom()`

- [ ] **步骤 2：typecheck 确认通过**

运行：`cd web && npm run typecheck`
预期：0 错误

- [ ] **步骤 3：提交**

```bash
git add web/components/ai/ChatMessages.vue
git commit -m "feat(web): AI 气泡思考折叠面板（首答自动折叠）+ 过程态文案按 phase 切换"
```

---

### 任务 6：真链路验收（dev + 真实 DeepSeek key）

**文件：** 无代码产出（验收任务；发现缺陷回到对应任务修复后重跑本任务）

**接口：**
- 消费：任务 1-5 全部产出
- 产出：验收结论 + 截图（`shots/` 目录，gitignore 外的用户自有目录，不入库）

- [ ] **步骤 1：起服务**

- 终端 A：`cd server && ./dev.sh`（后台）；前置只做存在性检查 `[ -n "$DEEPSEEK_API_KEY" ]`，**绝不 echo key 值**
- 终端 B：`cd web && npm run dev`（后台）
- `curl -s http://127.0.0.1:8000/docs -o /dev/null -w '%{http_code}'` → 200，两服务就绪

- [ ] **步骤 2：浏览器验收（393×852 档，AGENTS.md 默认预览尺寸）**

登录测试账号 → 进 `/ai`，用浏览器工具依次验证并截图：

1. 提问后立即截：液滴 + 「检索案例库中…」→「思考中…」切换
2. 思考面板实时流出截图：muted 细字、左侧竖线、自动滚动
3. 首段回答到达后：面板自动折叠为「已完成思考（N 秒）」、回答打字机进行中截图
4. 完成态截图：sources 出处胶囊正常、无文本错位/样式叠加

- [ ] **步骤 3：1920 档重复步骤 2 的 1/4 两态截图**

- [ ] **步骤 4：中断与错误路径**

- 思考中点「新对话」：右侧立即清空、无应答串入（abort 生效）；服务端日志无未处理异常
- 思考中切到另一历史会话再切回：视图一致、在途应答被丢弃
- 连发 6 问触发窗口限速：错误气泡文案 =「提问太频繁，稍后再试」，无接口地址/异常细节泄露

- [ ] **步骤 5：截图自检 + 修复循环**

逐张分析文本错位/样式叠加/滚动异常；发现问题 → 修对应文件 → 重跑受影响的服务端测试与截图 → 全绿后提交修复（`fix(web): …`）

- [ ] **步骤 6：全量回归**

```bash
cd server && .venv/bin/python -m pytest tests/ -v   # 全量绿
cd web && npm run typecheck                          # 0 错误
```
