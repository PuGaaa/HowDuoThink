# AI 对话流式化：实时思维链 + RAG 过程状态（SSE）

日期：2026-11-15　范围：`server/features/ai` + `server/core/{config,client}` + `web/`（composables/components/utils）

## 目标

1. Web AI 排错对话能**实时看到**模型的思考过程（deepseek-reasoner 的 `reasoning_content` 逐字流出，可折叠面板）。
2. 能看到 RAG 执行过程状态：正在检索案例库 → 检索完成（命中数）→ 思考中 → 输出中。
3. 回答本身改为流式打字机输出；检索出的案例出处照常展示。
4. 思考过程**不落库**：只在实时提问时展示，历史回放只看答案（与 DeepSeek 官方建议一致——reasoning_content 不进多轮上下文、不回传）。

成功标准：真实 DeepSeek key 全链路跑通，思考面板逐字流出并在答完后自动折叠；中断/错误路径与现有契约（失败不落库、错误不泄露内部细节）一致。

## 背景与现状

- `AI_CHAT_MODEL` 默认 `deepseek-chat`，不吐思维链；`/api/ai/chat` 为同步 POST，一次性返回 JSON。
- web 端 `useAiChat.ts` 的 `thinking` 只是加载布尔值；`ChatMessages.vue` 已有"检索案例库中…"液滴动画。
- 该接口唯一调用方是 web（app/admin 均未使用），换契约无兼容包袱。
- langchain-openai 1.7.3 支持 `stream_usage=True`（流式末包带 token 用量，审计不丢）。

## 已定决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 展示内容 | 真实思维链 + 过程状态，两者都要 | 用户选定 |
| 思考是否落库 | 不落库，无表结构迁移 | 存储不膨胀；官方建议不回传 |
| 传输方式 | SSE 事件流（fetch + ReadableStream） | 方案 A，实时且规避 reasoner 长思考超时 |
| 模型拆分 | 对话走 `AI_REASONER_MODEL`（默认 deepseek-reasoner）；起草管线保持 `chat_model()`（deepseek-chat） | 起草是 JSON 结构化输出，reasoner 更贵更慢无增益 |
| 旧同步 JSON 契约 | 直接替换，不保留降级版 | 同一件事不留两条实现（环境一致性铁律延伸） |

## 1. 流式契约（SSE 事件协议）

`POST /api/ai/chat` 请求体不变（`{question, conversationId?}`），响应改 `text/event-stream`，响应头加 `Cache-Control: no-cache` 与 `X-Accel-Buffering: no`。事件格式统一 `event: <type>\ndata: <json>\n\n`：

| 事件 | 时机 | data |
|---|---|---|
| `status` | 编排各阶段 | `{"phase": "retrieving"}` → `{"phase": "thinking", "hits": <int>}` |
| `reasoning` | 思维链增量 | `{"text": "<delta>"}` |
| `answer` | 回答增量 | `{"text": "<delta>"}` |
| `sources` | 应答落库成功后（`conversationId` 在落库时才产生，必须在此之后发） | `{"sources": [{"caseId","title"}], "conversationId": "<id>"}` |
| `done` | 全部完成（落库后） | `{}` |
| `error` | 限速/配额/AI 未开放/模型失败 | `{"error": "<文案>", "aiAvailable": <bool>}` |

- 401（未登录）、404（会话查无/非本人）仍在**流开启前**以 HTTP 状态码返回，沿用现有前端处理路径；业务错误（可用性/限速/配额）开流后走 `error` 事件并关闭流——等价于现行「200 + error 字段」契约。
- 事件顺序严格为：`status(retrieving)` → `status(thinking)` → 若干 `reasoning` → 若干 `answer` → `sources` → `done`；`error` 可出现在任意阶段，到达即终止。

## 2. 服务端（core + features/ai）

### core/config.py

新增 `AI_REASONER_MODEL = os.environ.get("AI_REASONER_MODEL", "deepseek-reasoner")`。同 `AI_BASE_URL` 端点、同 key——同一 provider 同一 SDK，环境间只允许覆盖值，符合环境一致性铁律。

### features/ai/client.py

新增 `reasoner_model()`：`ChatOpenAI(model=config.AI_REASONER_MODEL, base_url=config.AI_BASE_URL, api_key=config.DEEPSEEK_API_KEY, temperature=0.3, timeout=300, stream_usage=True)`，`lru_cache(maxsize=1)` 与 `chat_model()` 同款。`chat_model()` 不动。

### features/ai/service.py

`chat()` 拆为事件生成器 `chat_stream(question, uid, conversation_id) -> Generator[dict]`（事件 dict 形如 `{"type": ..., ...}`，router 层序列化为 SSE 帧）：

1. 前置检查：`client.available()` / `_rate_ok(uid)` / 日配额 / `conversation_id` 属主校验（属主校验失败 raise HTTPException(404)，发生在开流前）。
2. yield `status(retrieving)` → `node_retrieve(query, k=4)`（复用现节点）→ yield `status(thinking, hits=len(chunks))`。
3. 新节点 `node_answer_stream(question, chunks, uid, history) -> Generator[dict]`：`reasoner_model().stream(messages)` 逐 chunk 判 `additional_kwargs` 中的 `reasoning_content` / `content`，分别 yield `reasoning`/`answer` 增量；try/finally 内照旧记 `ai_usage`（kind='chat'，token 取末包 usage_metadata，流中断也计）。纯节点设计保持，LangGraph 演进预留不变。
4. 组装 sources（复用现有去重+查标题逻辑）→ 落库 user+assistant 两条（**content 为已流出的完整答案；不含 reasoning**）→ `prune_conversations` → yield `sources` → yield `done`。
5. 模型异常：捕获后 yield `error("服务暂时不可用，请稍后再试", aiAvailable=True)`，不落库（与现行「失败不落库」一致）。

`node_answer` 同步节点：起草管线不用它，chat 流式化后无调用方——**删除**，不留双实现。usage 审计、限速、配额逻辑全部保持原位。

### features/ai/router.py

`ai_chat` 路由：先调 `service.chat_stream(...)` 拿生成器，包一层把事件 dict 序列化为 SSE 帧文本，`StreamingResponse(gen, media_type="text/event-stream", headers={...})`。同步生成器走 Starlette 线程池，与现有同步路由风格一致。

## 3. 前端（web）

### utils/sse.ts（新增，~40 行，零依赖）

`export async function readSse(reader: ReadableStreamDefaultReader<Uint8Array>, onEvent: (type: string, data: any) => void): Promise<void>`：按 `\n\n` 分帧、解析 `event:`/`data:` 行、`JSON.parse` data、跨 chunk 缓冲半帧。解析异常不外抛，向上按连接中断处理。

### composables/useAiChat.ts

- `ChatMessage` 增字段：`reasoning?: string`（累计思维链文本）、`phase?: 'retrieving' | 'thinking' | 'answering'`。
- `send()` 改为 `fetch(api.base + '/api/ai/chat', { method: 'POST', credentials: 'include', body, signal: AbortController.signal })` + `res.body.getReader()` 喂 `readSse`：
  - 发送时即 push 一条 assistant 占位消息（`phase: 'retrieving'`，text 为空），流式增量**就地更新这条消息**（不再等完整应答后 push）；
  - `status` 更新 phase；`reasoning`/`answer` 累加文本；`sources` 写 conversationId 与 sources；`done` 结束；`error` 走错误气泡（见 §4）；
  - epoch 守卫语义不变：捕获代次快照，事件到达时比对，视图已重置即整体丢弃；
  - 视图重置路径（新对话 / 删除激活会话 / 切换会话）与组件卸载统一 `abort()`；`thinking` 布尔继续作为在途锁与液滴态开关。
- `openConversation` 回放映射不变（历史消息无 reasoning/phase）。

### components/ai/ChatMessages.vue

- 过程态气泡（液滴动画复用）按 phase 显示文案：检索案例库中… → 思考中… → 输出中…；`thinking=true` 且流式阶段进行中时展示。
- assistant 气泡内顶部加**思考折叠面板**（`m.reasoning` 存在即渲染）：
  - 思考中：默认展开，实时滚动到底（复用列表的瞬时滚动 + rAF 兜底手法），muted 色细字 `pre-wrap`；
  - 首个 `answer` 增量到达：自动折叠，标题显示「已完成思考（N 秒）」（秒数 = reasoning 首包到 answer 首包的墙钟差）；
  - 标题栏可点击切换展开/收起。
- sources 渲染、空态、建议问题、用户气泡全部不变。

## 4. 错误处理

| 场景 | 行为 |
|---|---|
| 流中模型失败，已有部分答案流出 | 部分答案保留展示，其后插入现有样式错误气泡；不落库 |
| `error` 事件且无已流出内容 | 现状错误气泡，行为不变 |
| 前端连接中断/解析失败且未收到 `done` | 「服务暂时不可用」错误气泡兜底 |
| 视图重置（新对话/删会话/切会话） | abort + epoch 丢弃，应答不污染新视图（现状语义） |
| 客户端 abort | 服务端生成器 GeneratorExit，usage 已审计、不落库 |

错误文案维持现行三条（未登录/网络不可用/业务错误照显 `r.error`），不泄露堆栈与内部细节。

## 5. 测试与验收

### server pytest 扩展（tests/test_ai.py 等）

mock `reasoner_model().stream()` 为可编排的假 chunk 序列：

1. 事件序列断言：`status(retrieving)` → `status(thinking)` → `reasoning`×n → `answer`×n → `sources` → `done`，SSE 帧格式正确。
2. 限速/配额/AI 未配置：开流后首个事件即 `error`，且无落库。
3. 401 / 404（非本人会话）：HTTP 状态码，流不开。
4. 落库断言：消息 content 为完整答案、**无 reasoning 字段落任何表**；`ai_usage` 在流正常结束与中途断开（模拟 GeneratorExit）两种情况下都产生审计行。
5. token 计量：末包 usage_metadata 正确进审计。

### web 验收

dev 环境带真实 DeepSeek key 走真实链路（环境一致性铁律；降级链是运行时容错，验收必须走真）：

- 393×852 与 1920 两档截图验收：思考面板展开/自动折叠形态、过程态文案切换、打字机回答、sources 展示；
- 重点检查折叠面板滚动、流式重排无文本错位/样式叠加；
- 手动验证：思考中切会话（abort 不串视图）、模型失败路径错误气泡。

## 非目标（YAGNI）

- 不做任务+轮询方案；不做断线续传；不做思考内容落库与回放。
- app 端（uniapp）不跟进（未使用该接口）。
- 起草管线不换 reasoner 模型。
- 不引入 LangGraph（维持纯节点预留）。

## 环境一致性检查

`AI_REASONER_MODEL` 新变量：dev/prod 同一实现同一默认（deepseek-reasoner），只允许 env 覆盖值；唯一外部依赖仍是 DeepSeek 官方端点，无本地替身。生产首用无下载类风险（纯 API 调用）。
