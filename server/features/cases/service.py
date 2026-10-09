"""Case 的业务逻辑：草稿保存、元数据更新、投稿→草稿骨架、发布（门禁+版本+文章投影）。
发布与草稿的多表写入都走 db.tx() 事务。约定：服务层只抛 HTTPException。"""
from fastapi import HTTPException

import db
from features.cases import gate
from features.cases.models import CaseDraftBody, CaseMetaBody, CasePayload


def save_case_draft(uid: str, body: CaseDraftBody) -> dict:
    """保存草稿：不跑门禁（draft 允许半成品）。发布走 publish_case。"""
    payload = body.payload or {}
    payload["id"] = body.id
    exists = db.q("SELECT id, status, version FROM cases WHERE id=?", (body.id,))
    if exists:
        db.ex("UPDATE cases SET payload=?, title=? WHERE id=?",
              (db.jdump(payload), str(payload.get("title", "")), body.id))
        return {"id": body.id, "status": exists[0]["status"]}
    db.ex(
        "INSERT INTO cases(id, submission_id, author_id, title, domain, layer, difficulty, version, status, payload) "
        "VALUES(?,?,?,?,?,?,?,?,?,?)",
        (body.id, body.submission_id, uid, str(payload.get("title", "")), "", "", 1, 0, "draft", db.jdump(payload)),
    )
    return {"id": body.id, "status": "draft"}


def update_case_meta(cid: str, body: CaseMetaBody) -> dict:
    """结构化更新三级架构元数据（part/chapterId/order/typeTags），不动正文。"""
    rows = db.q("SELECT payload FROM cases WHERE id=?", (cid,))
    if not rows:
        raise HTTPException(404, "不存在")
    payload = db.jload(rows[0]["payload"], {})
    if body.part:
        payload["part"] = body.part
    if body.chapter_id is not None:
        payload["chapterId"] = body.chapter_id
    if body.order is not None:
        payload["order"] = body.order
    if body.type_tags is not None:
        payload["typeTags"] = [t.strip() for t in body.type_tags if t.strip()]
    db.ex("UPDATE cases SET payload=? WHERE id=?", (db.jdump(payload), cid))
    return {"ok": True, "meta": {"part": payload.get("part"), "chapterId": payload.get("chapterId"), "order": payload.get("order"), "typeTags": payload.get("typeTags")}}


def draft_skeleton_from_submission(sid: str) -> dict:
    """投稿 → Case 草稿骨架：必填字段自动映射，重字段填占位（编辑器里可见待补）。"""
    rows = db.q("SELECT * FROM submissions WHERE id=?", (sid,))
    if not rows:
        raise HTTPException(404, "投稿不存在")
    s = rows[0]
    title = s["title"]
    symptoms = [{"type": "text", "title": "现象描述", "text": s["symptom"]}]
    if s["key_error"]:
        symptoms.insert(0, {"type": "error", "title": "关键报错", "text": s["key_error"]})
    timeline = s["timeline"] or "时间线待补充"
    # 解决过程按行拆分为专家链骨架：每行 → 观察( thought )，动作占位
    chain = []
    lines = [ln.strip() for ln in s["resolution"].replace("；", "\n").replace("。", "\n").split("\n") if ln.strip()]
    for ln in lines[:8]:
        chain.append({
            "thought": ln[:120],
            "update": "（待补充：这一步假设如何更新）",
            "actionId": "",
            "why": "（待补充：为什么这一步值这个成本）",
            "conclusion": "（待补充：排除了什么/确认了什么）",
        })
    if not chain:
        chain.append({"thought": "（待补充）", "update": "（待补充）", "actionId": "", "why": "（待补充）", "conclusion": "（待补充）"})
    while len(chain) < 4:
        chain.append({"thought": "（待补充）", "update": "（待补充）", "actionId": "", "why": "（待补充）", "conclusion": "（待补充）"})
    lessons = db.jload(s["lessons"], [])
    lesson_list = [{"text": l, "principle": "（待补充：这一层的契约）"} for l in lessons]
    lesson_list.append({"text": "（待补充检查单）", "principle": "（待补充原理）"})
    pid = "c-" + sid.replace("s-", "")
    part_guess = {"network": "access", "data": "data", "build": "build", "runtime": "runtime", "concurrency": "concurrency", "deploy": "access"}.get(s["domain_hint"] or "", "")
    return {
        "id": pid,
        "title": title,
        "intro": title,
        "domain": s["domain_hint"] or "network",
        "layer": "（待补充层契约）",
        "part": part_guess or "apprentice",
        "chapterId": part_guess or "",
        "order": 99,
        "typeTags": [],
        "difficulty": 1,
        "scene": {
            "role": "（待补充：玩家角色代入）",
            "architecture": "（待补充：链路图）",
            "symptoms": symptoms,
            "timeline": timeline,
            "impactHint": "（待补充）",
        },
        "hypotheses": [
            {"id": "h-a", "text": "（待补充假设A）", "excludeActionId": ""},
            {"id": "h-b", "text": "（待补充假设B）", "excludeActionId": ""},
            {"id": "h-c", "text": "（待补充假设C）", "excludeActionId": ""},
        ],
        "actions": [
            {"id": "act-1", "name": "（待补充动作）", "desc": "（待补充）", "cost": 1, "gain": "high",
             "danger": False, "effects": [], "tests": [], "hypotheses": [],
             "result": {"type": "text", "title": "（待补充）", "text": "（待补充）"}},
        ],
        "rootCauses": [
            {"id": "rc-a", "text": "（待补充根因A）", "correct": False},
            {"id": "rc-b", "text": "（待补充根因B）", "correct": False},
            {"id": "rc-c", "text": "（待补充根因C）", "correct": False},
        ],
        "expertCost": 5,
        "restartActionId": "",
        "expertChain": chain,
        "lessons": lesson_list,
    }


def create_draft_from_submission(uid: str, sid: str) -> dict:
    payload = draft_skeleton_from_submission(sid)
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO cases(id, submission_id, author_id, title, domain, layer, difficulty, version, status, payload) "
            "VALUES(?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
            (payload["id"], sid, uid, payload["title"], payload["domain"], payload["layer"], payload["difficulty"], 0, "draft", db.jdump(payload)),
        )
        conn.execute(
            "UPDATE submissions SET status='accepted', reviewed_at=datetime('now') WHERE id=? AND status='pending'", (sid,)
        )
    return {"caseId": payload["id"], "submissionId": sid, "status": "draft"}


def publish_case(uid: str, payload: CasePayload) -> dict:
    """发布：门禁 → 版本号 + cases + articles 三写同事务（失败整体回滚、版本不虚增）。"""
    errors = gate.check_case(payload)
    if errors:
        raise HTTPException(422, {"message": "未过发布门禁", "errors": errors})
    # 来源与署名：关联投稿 → 投稿者昵称；官方题 → "官方"
    sub_id = None
    author_name = "官方"
    crow = db.q("SELECT submission_id, author_id FROM cases WHERE id=?", (payload.id,))
    if crow and crow[0]["submission_id"]:
        sub_id = crow[0]["submission_id"]
        srow = db.q(
            "SELECT u.name, u.login FROM submissions s LEFT JOIN users u ON u.id=s.user_id WHERE s.id=?",
            (sub_id,),
        )
        if srow and (srow[0]["name"] or srow[0]["login"]):
            author_name = srow[0]["name"] or ("@" + srow[0]["login"])
    d = payload.model_dump(by_alias=True)
    d["submissionId"] = sub_id
    d["authorName"] = author_name
    exists = db.q("SELECT id FROM cases WHERE id=?", (payload.id,))
    with db.tx() as conn:
        version_row = conn.execute("SELECT value FROM meta WHERE meta_key='casepack_version'").fetchone()
        version = (int(version_row["value"]) if version_row else 0) + 1
        conn.execute(
            "INSERT INTO meta(meta_key, value) VALUES('casepack_version', ?) ON CONFLICT(meta_key) DO UPDATE SET value=excluded.value",
            (str(version),),
        )
        if exists:
            conn.execute(
                "UPDATE cases SET payload=?, title=?, domain=?, layer=?, difficulty=?, version=?, status='published', published_at=datetime('now') WHERE id=?",
                (db.jdump(d), payload.title, payload.domain, payload.layer, payload.difficulty, version, payload.id),
            )
        else:
            conn.execute(
                "INSERT INTO cases(id, submission_id, author_id, title, domain, layer, difficulty, version, status, payload, published_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'))",
                (payload.id, sub_id, uid, payload.title, payload.domain, payload.layer, payload.difficulty, version, "published",
                 db.jdump(d)),
            )
        article_id = _upsert_article(conn, payload, author_name)
    # 发布成功 → 增量索引到 AI 案例库（失败不阻塞发布）
    try:
        from features.ai import service as ai_service
        ai_service.index_case(payload.id)
    except Exception:  # noqa: BLE001 — AI 索引失败只记日志
        import logging
        logging.getLogger("uvicorn.error").warning("AI index failed for %s", payload.id)
    return {
        "id": payload.id, "version": version, "articleId": article_id}


def _upsert_article(conn, payload: CasePayload, author: str) -> str:
    """在给定事务连接上投影 Case → Article（Web 展示"最终解决逻辑"）。"""
    article_id = "a-" + payload.id
    steps = []
    for st in payload.expert_chain:
        act = st.action_id
        act_name = next((a.name for a in payload.actions if a.id == act), "")
        steps.append({
            "observe": st.thought,
            "act": act_name if act else "（推理收束，停止收集）",
            "found": st.conclusion,
        })
    lessons = [l.text for l in payload.lessons]
    conn.execute(
        "INSERT INTO articles(id, source_type, source_id, title, layer, domain, steps, lessons, author) "
        "VALUES(?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET title=excluded.title, layer=excluded.layer, steps=excluded.steps, "
        "lessons=excluded.lessons, author=excluded.author, published_at=datetime('now')",
        (article_id, "case", payload.id, payload.title, payload.layer, payload.domain,
         db.jdump(steps), db.jdump(lessons), author),
    )
    return article_id



def published_after(since: int) -> tuple[int, list[dict]]:
    """App 同步：version > since 的已发布案例 + 当前版本号（sync feature 经此取数）。"""
    rows = db.q("SELECT id, version, payload FROM cases WHERE status='published' AND version>? ORDER BY version", (since,))
    return db.current_version(), [db.jload(r["payload"], {}) for r in rows]
