"""Case 的业务逻辑：草稿保存、元数据更新、发布（门禁+版本+文章投影）。
发布与草稿的多表写入都走 db.tx() 事务。约定：服务层只抛 HTTPException。
投稿→草稿的转换（含 AI 起草落库）由 features/submissions/service.py 承载，此处不重复。"""
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
    """结构化更新三级架构元数据（part/chapterId/order/typeTags），不动正文。
    有实际变更时 bump casepack 版本（与 publish_case 同构取号）——否则 App 增量同步永远拉不到 meta 调整。"""
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
    changed = bool(body.part) or body.chapter_id is not None or body.order is not None or body.type_tags is not None
    if changed:
        with db.tx() as conn:
            version_row = conn.execute("SELECT value FROM meta WHERE meta_key='casepack_version'").fetchone()
            version = (int(version_row["value"]) if version_row else 0) + 1
            conn.execute(
                "INSERT INTO meta(meta_key, value) VALUES('casepack_version', ?) ON CONFLICT(meta_key) DO UPDATE SET value=excluded.value",
                (str(version),),
            )
            conn.execute("UPDATE cases SET payload=?, version=? WHERE id=?", (db.jdump(payload), version, cid))
    else:
        db.ex("UPDATE cases SET payload=? WHERE id=?", (db.jdump(payload), cid))
    return {"ok": True, "meta": {"part": payload.get("part"), "chapterId": payload.get("chapterId"), "order": payload.get("order"), "typeTags": payload.get("typeTags")}}


def list_admin_cases(status: str | None = None) -> list[dict]:
    """管理端案例列表（含草稿），新者在前。"""
    where, params = ("status=?", [status]) if status else ("1=1", [])
    rows = db.q(
        f"SELECT id, title, domain, layer, difficulty, version, status FROM cases WHERE {where} ORDER BY created_at DESC",
        tuple(params),
    )
    return [dict(r) for r in rows]


def admin_case_detail(cid: str) -> dict:
    """管理端案例详情：完整 payload 供编辑器。"""
    rows = db.q("SELECT id, title, version, status, payload FROM cases WHERE id=?", (cid,))
    if not rows:
        raise HTTPException(404, "案例不存在")
    r = rows[0]
    return {
        "id": r["id"], "title": r["title"], "version": r["version"], "status": r["status"],
        "payload": db.jload(r["payload"], {}),
    }


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
