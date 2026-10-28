"""ai 域业务逻辑：案例库 RAG 索引/检索/对话 + 投稿 AI 起草管线。

纯节点设计（LangGraph 演进预留）：node_retrieve / node_answer / node_draft 各自独立、
无隐藏状态——将来引入 LangGraph 时按图组装即可。检索层自研（SQLite+余弦）。
"""
import json
import math
import threading
import time
import uuid

import db
from core import settings
from features.ai import client

SYSTEM_PROMPT = (
    "你是「好多星 HowDuoThink」的排错助手，面向工程师回答真实故障问题。"
    "回答必须基于提供的案例库上下文："
    "①给出可能的原因（引用案例中的根因）"
    "②给出可执行的排查步骤（引用案例中的检查单/专家链步骤）"
    "③结尾列出引用的案例标题。"
    "案例库没有覆盖的内容要明说「案例库暂未覆盖」，禁止编造。语气直接、步骤化、不寒暄。"
)

_RATE: dict[str, list[float]] = {}
_RATE_LOCK = threading.Lock()


def _rate_ok(uid: str) -> bool:
    """内存限速：阈值/窗口经管理端「系统设置」即时可调。
    读-判-写持锁原子——同步路由跑在线程池，无锁时同 uid 并发请求会互相覆盖计数、全部放行。"""
    limit = int(settings.get("ai.rate_limit"))
    window = float(settings.get("ai.rate_window_sec"))
    now = time.monotonic()
    with _RATE_LOCK:
        hits = [t for t in _RATE.get(uid, []) if now - t < window]
        if len(hits) >= limit:
            _RATE[uid] = hits
            return False
        hits.append(now)
        _RATE[uid] = hits
        return True


def _daily_used(uid: str) -> int:
    """当日（UTC 日）该 uid 已发生的模型调用次数——按 ai_usage 审计行计数。"""
    today = time.strftime("%Y-%m-%d", time.gmtime())
    rows = db.q(
        "SELECT COUNT(*) AS n FROM ai_usage WHERE uid=? AND kind IN ('chat','draft') AND substr(created_at,1,10)=?",
        (uid, today),
    )
    return int(rows[0]["n"] or 0)


# ────────────────────────── 节点：索引 ──────────────────────────

def _case_chunks(payload: dict) -> list[tuple[str, str]]:
    """案例 payload → (chunk_kind, content) 列表。"""
    title = payload.get("title", "")
    domain = payload.get("domain", "")
    chapter = payload.get("chapterId", "")
    layer = payload.get("layer", "")
    head = f"[{title} | 领域:{domain} | 章:{chapter} | 层契约:{layer}]"

    symptoms = "\n".join(
        f"- {s.get('title', '')}: {s.get('text', '')}" for s in payload.get("scene", {}).get("symptoms", [])
    )
    overview = (
        f"{head}\n【症状/现象】\n{symptoms}\n"
        f"【一句话简介】{payload.get('intro', '')}"
    )

    causes = "；".join(
        (("[正确] " if r.get("correct") else "") + r.get("text", "")) for r in payload.get("rootCauses", [])
    )
    steps = "\n".join(
        f"- {c.get('conclusion', '')}" for c in payload.get("expertChain", []) if c.get("conclusion")
    )
    lessons = "\n".join(
        f"- {l.get('text', '')}（{l.get('principle', '')}）" for l in payload.get("lessons", [])
    )
    resolution = f"{head}\n【根因】{causes}\n【排查步骤/结论】\n{steps}\n【检查单】\n{lessons}"

    return [("overview", overview), ("resolution", resolution)]


def _embed(texts: list[str]) -> list[list[float]]:
    from features.ai import usage

    t0 = time.perf_counter()
    vectors = client.embeddings_model().embed_documents(texts)
    # 嵌入调用审计：本地 fastembed 无 token 概念，记耗时；zhipu 有量但 LangChain 侧不透出
    usage.log_usage(None, "embed", duration_ms=int((time.perf_counter() - t0) * 1000))
    return vectors


def index_case(case_id: str) -> bool:
    """增量索引单个已发布案例（向量供应商未就绪时返回 False）。"""
    if not client.embed_available():
        return False
    rows = db.q("SELECT payload FROM cases WHERE id=? AND status='published'", (case_id,))
    if not rows:
        return False
    payload = db.jload(rows[0]["payload"], {})
    chunks = _case_chunks(payload)
    vectors = _embed([c[1] for c in chunks])
    model = client.embeddings_model_name()
    with db.tx() as conn:
        for (kind, content), vec in zip(chunks, vectors):
            conn.execute(
                "INSERT INTO ai_index(source_type, source_id, chunk_kind, content, embedding, model, updated_at) "
                "VALUES('case',?,?,?,?,?,datetime('now')) "
                "ON CONFLICT(source_type, source_id, chunk_kind) DO UPDATE SET "
                "content=excluded.content, embedding=excluded.embedding, model=excluded.model, updated_at=datetime('now')",
                (case_id, kind, content, json.dumps(vec), model),
            )
    return True


def reindex_all() -> dict:
    """全量重建：清除案例类索引，重嵌所有 published 案例。"""
    if not client.embed_available():
        return {"ok": False, "reason": "向量供应商未就绪（EMBED_PROVIDER=zhipu 需配 ZHIPU_API_KEY）"}
    db.ex("DELETE FROM ai_index WHERE source_type='case'")
    rows = db.q("SELECT id FROM cases WHERE status='published'")
    done = 0
    for r in rows:
        if index_case(r["id"]):
            done += 1
    return {"ok": True, "indexed": done, "total": len(rows)}


# ────────────────────────── 节点：检索 ──────────────────────────

def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return -1.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return -1.0
    return dot / (na * nb)


def node_retrieve(query: str, k: int = 4) -> list[dict]:
    """检索节点：向量供应商就绪 → 余弦 top-K（按向量器 model 过滤）；未就绪 → LIKE 关键词降级。"""
    if client.embed_available():
        qvec = client.embeddings_model().embed_query(query)
        model = client.embeddings_model_name()
        rows = db.q(
            "SELECT source_id, chunk_kind, content, embedding FROM ai_index "
            "WHERE source_type='case' AND model=?",
            (model,),
        )
        scored = []
        for r in rows:
            score = _cosine(qvec, json.loads(r["embedding"]))
            scored.append((score, r["source_id"], r["chunk_kind"], r["content"]))
        scored.sort(key=lambda x: -x[0])
        return [
            {"caseId": sid, "kind": kind, "content": content, "score": round(sc, 4)}
            for sc, sid, kind, content in scored[:k]
            if sc > 0.15
        ]
    # 降级：关键词 LIKE（取查询里的长词）
    kws = [w for w in query.replace("？", " ").replace("的", " ").split() if len(w) >= 2][:4]
    if not kws:
        return []
    where = " OR ".join("content LIKE ?" for _ in kws)
    rows = db.q(
        f"SELECT source_id, chunk_kind, content FROM ai_index WHERE source_type='case' AND ({where}) LIMIT ?",
        tuple([f"%{w}%" for w in kws] + [k]),
    )
    return [{"caseId": r["source_id"], "kind": r["chunk_kind"], "content": r["content"], "score": 0.0} for r in rows]


# ────────────────────────── 节点：应答 ──────────────────────────

def node_answer(question: str, chunks: list[dict], uid: str | None = None) -> str:
    """应答节点：检索结果 → system prompt → GLM 回答。调用即审计（token/耗时/成败）。"""
    from features.ai import usage

    context = "\n\n────────\n".join(c["content"] for c in chunks) if chunks else "（案例库检索无结果）"
    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", f"【案例库上下文】\n{context}\n\n【工程师的问题】\n{question}"),
    ]
    t0 = time.perf_counter()
    try:
        resp = client.chat_model().invoke(messages)
    except Exception:
        usage.log_usage(uid, "chat", duration_ms=int((time.perf_counter() - t0) * 1000), ok=False)
        raise
    pin, pout = usage.extract_tokens(resp)
    usage.log_usage(uid, "chat", pin, pout, int((time.perf_counter() - t0) * 1000))
    return resp.content


def chat(question: str, uid: str) -> dict:
    """RAG 对话入口：限速 → 日配额 → 检索 → 应答 → 组装引用。"""
    if not client.available():
        return {"error": "AI 未配置（DEEPSEEK_API_KEY 缺失），对话不可用；检索可走关键词模式", "aiAvailable": False}
    if not _rate_ok(uid):
        return {"error": "提问太频繁，稍后再试", "aiAvailable": True}
    if _daily_used(uid) >= int(settings.get("ai.daily_limit")):
        # 窗口限流之外的日硬顶：并发绕过窗口限流时，成本仍有每日上限兜底
        return {"error": "今日提问次数已达上限，明天再来", "aiAvailable": True}
    chunks = node_retrieve(question, k=4)
    answer = node_answer(question, chunks, uid=uid)
    sources = []
    seen = set()
    for c in chunks:
        if c["caseId"] in seen:
            continue
        seen.add(c["caseId"])
        rows = db.q("SELECT id, title FROM cases WHERE id=?", (c["caseId"],))
        if rows:
            sources.append({"caseId": rows[0]["id"], "title": rows[0]["title"]})
    return {"answer": answer, "sources": sources, "aiAvailable": True}


# ────────────────────────── 节点：AI 起草管线 ──────────────────────────

DRAFT_PROMPT = """你是「好多星 HowDuoThink」的出题编辑。根据投稿素材，按《案例写作规范》生成诊断案例的六部件预填 JSON。

铁律：
- 假设平权：每个干扰假设对不知道答案的人同样合理，正确假设不标记
- 每个干扰假设必须指向一个能排除它的动作（excludeActionId）
- 3~4 个假设、8 个以上动作、动作成本 1~10、gain ∈ high/mid/low/none
- 至少一个 cost=1 且 gain=high 的影响面动作（expertChain 第一步必须是它）
- difficulty≥2 时必须含 danger:true 的回滚/重启类危险动作（gain=none）
- expertChain 每步四段式：thought/update/actionId/why/conclusion，why 说明成本与信息增益的排序理由，最后一步是停止规则（actionId=""）
- lessons 每条带 principle（层契约原理）
- difficulty 按六维（推理距离/证据形态/知识层次/反直觉度/跨层跨度/陷阱主动性）中位数自检
- 输出纯 JSON（不要 markdown 代码块），结构：
{{"title": "...", "intro": "...(≤80字)", "layer": "...(≤120字)", "difficulty": 1~3,
 "scene": {{"role": "...", "architecture": "...", "symptoms": [{{"type": "text|error|log|code", "title": "...", "text": "..."}}], "timeline": "...", "impactHint": "..."}},
 "hypotheses": [{{"id": "h-xxx", "text": "...", "excludeActionId": "a-xxx"}}],
 "actions": [{{"id": "a-xxx", "name": "...(≤60字)", "desc": "...", "cost": 1, "gain": "high", "danger": false,
   "tests": ["h-xxx"], "hypotheses": [{{"id": "h-xxx", "status": "excluded|down|confirmed"}}],
   "result": {{"type": "text", "title": "...", "text": "..."}}}}],
 "rootCauses": [{{"id": "rc-xxx", "text": "...", "correct": true}}],
 "expertChain": [{{"thought": "...", "update": "...", "actionId": "a-xxx", "why": "...(≥12字)", "conclusion": "..."}}],
 "lessons": [{{"text": "...(≤120字)", "principle": "..."}}],
 "chapterId": "network|build|data|runtime|concurrency|deploy|error-reading|integration|contract|config-boot|testing|access|messaging|evolution"}}

【投稿素材】
标题：{title}
症状：{symptom}
关键报错：{key_error}
时间线：{timeline}
解决过程：{resolution}
经验教训：{lessons}
领域提示：{domain_hint}"""


def node_draft(material: dict, uid: str | None = None) -> tuple[dict, list[str]]:
    """起草节点：投稿素材 → GLM 预填 JSON →（容错解析）。返回 (payload_dict, warnings)。调用即审计。"""
    import json as _json

    from features.ai import usage

    prompt = DRAFT_PROMPT.format(
        title=material.get("title", ""),
        symptom=material.get("symptom", ""),
        key_error=material.get("keyError") or "（无）",
        timeline=material.get("timeline") or "（无）",
        resolution=material.get("resolution", ""),
        lessons="；".join(material.get("lessons", [])) or "（无）",
        domain_hint=material.get("domainHint") or "（无）",
    )
    warnings: list[str] = []
    t0 = time.perf_counter()
    try:
        resp = client.chat_model().invoke([
            ("system", "你是资深的出题编辑，输出严格的 JSON。"),
            ("human", prompt),
        ])
    except Exception:
        usage.log_usage(uid, "draft", duration_ms=int((time.perf_counter() - t0) * 1000), ok=False)
        raise
    pin, pout = usage.extract_tokens(resp)
    usage.log_usage(uid, "draft", pin, pout, int((time.perf_counter() - t0) * 1000))
    text = resp.content.strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    try:
        data = _json.loads(text)
    except _json.JSONDecodeError:
        warnings.append("GLM 输出无法解析为 JSON，已回退机械骨架")
        return {}, warnings
    if not isinstance(data, dict) or "actions" not in data or "hypotheses" not in data:
        warnings.append("GLM 输出缺关键部件，已回退机械骨架")
        return {}, warnings
    if len(data.get("actions", [])) < 8:
        warnings.append(f"GLM 仅生成 {len(data.get('actions', []))} 个动作（<8），编辑需补足")
    return data, warnings


def ai_draft_from_submission(uid: str, sid: str) -> dict:
    """AI 起草管线：投稿 → GLM 预填 → 合并机械骨架 → 落库 draft。无 key 退回机械骨架。"""
    from features.submissions import service as sub_service

    if not client.available():
        result = sub_service.create_draft_from_submission(uid, sid)
        result["aiGenerated"] = False
        result["warnings"] = ["AI 未配置，使用机械骨架"]
        return result

    rows = db.q("SELECT * FROM submissions WHERE id=?", (sid,))
    if not rows:
        raise ValueError("投稿不存在")
    s = rows[0]
    material = {
        "title": s["title"], "symptom": s["symptom"], "resolution": s["resolution"],
        "keyError": s["key_error"], "timeline": s["timeline"],
        "lessons": db.jload(s["lessons"], []), "domainHint": s["domain_hint"],
    }
    warnings: list[str] = []
    generated, w = node_draft(material, uid=uid)
    warnings.extend(w)

    skeleton = sub_service.draft_skeleton_from_submission(sid)
    payload = skeleton

    if generated:
        # AI 预填覆盖重字段；id/署名链路保留骨架值；chapterId 校验合法性
        valid_chapters = {"access", "build", "data", "runtime", "concurrency", "observability",
                          "security", "evolution", "messaging", "deployment", "network", "testing",
                          "error-reading", "integration", "contract", "config-boot"}
        for key in ("title", "intro", "layer", "difficulty", "scene", "hypotheses", "actions", "rootCauses", "expertChain", "lessons"):
            if generated.get(key):
                payload[key] = generated[key]
        ch = generated.get("chapterId")
        if ch in valid_chapters:
            payload["chapterId"] = ch
            payload["part"] = {"access": "apprentice", "build": "apprentice", "error-reading": "apprentice",
                               "integration": "apprentice", "contract": "engineer", "data": "engineer",
                               "config-boot": "engineer", "runtime": "engineer", "concurrency": "master",
                               "observability": "master", "security": "master", "evolution": "master",
                               "messaging": "master", "deployment": "master", "network": "master",
                               "testing": "master"}[ch]
        else:
            warnings.append(f"GLM 返回未知章 id：{ch}，保留领域提示映射")
        aiGenerated = True
    else:
        aiGenerated = False

    result = sub_service.create_draft_with_payload(uid, sid, payload)
    result["aiGenerated"] = aiGenerated
    result["warnings"] = warnings
    return result
