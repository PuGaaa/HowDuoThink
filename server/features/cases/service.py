"""Case 的业务逻辑：草稿保存、元数据更新、发布（门禁+版本+文章投影）。
发布与草稿的多表写入都走 db.tx() 事务。约定：服务层只抛 HTTPException。
投稿→草稿的转换（含 AI 起草落库）由 features/submissions/service.py 承载，此处不重复。"""

from fastapi import HTTPException

import db
from features.cases import gate
from features.cases.models import CaseDraftBody, CaseMetaBody, CasePayload

_CONTROL_FIELDS = {"baseRevision", "contentRevision", "sourceType", "sourceCommit"}


def _int_or(v, default: int) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def save_case_draft(uid: str, body: CaseDraftBody) -> dict:
    """保存草稿：不跑门禁（draft 允许半成品）。发布走 publish_case。
    status 守卫带条件谓词：预检（快照读）与写入之间案例被并发发布时，
    UPDATE ... AND status='draft' 的 rowcount=0 仍然拒绝——check-then-act 打不穿。"""
    payload = body.payload or {}
    payload["id"] = body.id
    exists = db.q("SELECT id, status FROM cases WHERE id=?", (body.id,))
    if exists and exists[0]["status"] != "draft":
        raise HTTPException(409, "该案例已发布：修改请走重新发布流程（过发布门禁），不能经草稿覆盖")
    with db.tx() as conn:
        if exists:
            cur = conn.execute(
                "UPDATE cases SET payload=?, title=?, domain=?, layer=?, difficulty=? WHERE id=? AND status='draft'",
                (
                    db.jdump(payload),
                    str(payload.get("title", "")),
                    str(payload.get("domain", "")),
                    str(payload.get("layer", "")),
                    _int_or(payload.get("difficulty"), 1),
                    body.id,
                ),
            )
            if cur.rowcount != 1:
                raise HTTPException(409, "案例状态已变化（已发布或已删除）：不能经草稿覆盖")
            return {"id": body.id, "status": "draft"}
        conn.execute(
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
            conn.execute(
                "INSERT INTO meta(meta_key, value) VALUES('casepack_version', '0') ON CONFLICT(meta_key) DO NOTHING"
            )
            version_row = conn.execute(
                "SELECT value FROM meta WHERE meta_key='casepack_version' /* FOR UPDATE */"
            ).fetchone()
            version = (int(version_row["value"]) if version_row else 0) + 1
            conn.execute(
                "INSERT INTO meta(meta_key, value) VALUES('casepack_version', ?) ON CONFLICT(meta_key) DO UPDATE SET value=excluded.value",
                (str(version),),
            )
            conn.execute("UPDATE cases SET payload=?, version=? WHERE id=?", (db.jdump(payload), version, cid))
    else:
        db.ex("UPDATE cases SET payload=? WHERE id=?", (db.jdump(payload), cid))
    return {
        "ok": True,
        "meta": {
            "part": payload.get("part"),
            "chapterId": payload.get("chapterId"),
            "order": payload.get("order"),
            "typeTags": payload.get("typeTags"),
        },
    }


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
        "id": r["id"],
        "title": r["title"],
        "version": r["version"],
        "status": r["status"],
        "payload": db.jload(r["payload"], {}),
    }


def publish_case(uid: str, payload: CasePayload) -> dict:
    """发布：门禁 → 版本号 + cases + articles 三写同事务（失败整体回滚、版本不虚增）。"""
    errors = gate.check_case(payload)
    if errors:
        raise HTTPException(422, {"message": "未过发布门禁", "errors": errors})
    d = payload.model_dump(by_alias=True)
    requested_base = d.pop("baseRevision", None)
    requested_revision = d.pop("contentRevision", None)
    d.pop("sourceType", None)
    d.pop("sourceCommit", None)
    with db.tx() as conn:
        case_snapshot = conn.execute("SELECT id, submission_id FROM cases WHERE id=?", (payload.id,)).fetchone()
        sub_id = case_snapshot["submission_id"] if case_snapshot else None
        publication = None
        if sub_id:
            from features.submissions.service import validate_publication

            publication = validate_publication(conn, sub_id)
        exists = conn.execute(
            "SELECT id, status, submission_id, content_revision, payload, source_type, source_commit FROM cases WHERE id=? /* FOR UPDATE */",
            (payload.id,),
        ).fetchone()
        sub_id = exists["submission_id"] if exists else None
        author_name = publication.author_name if publication else "官方"
        source_type = "community" if publication else "official"
        source_commit = f"submission:{sub_id}:material:{publication.material_version}" if publication else None
        d["submissionId"] = sub_id
        d["authorName"] = author_name
        if exists and exists["status"] == "published":
            current_revision = int(exists["content_revision"] or 1)
            if requested_base is None or requested_base != current_revision:
                raise HTTPException(409, "案例修订已变化，请重新载入后发布")
            current_payload = _content_payload(db.jload(exists["payload"], {}))
            if current_payload == _content_payload(d):
                return {
                    "id": payload.id,
                    "version": int(
                        conn.execute("SELECT value FROM meta WHERE meta_key='casepack_version'").fetchone()["value"]
                    ),
                    "contentRevision": current_revision,
                    "articleId": "a-" + payload.id,
                    "unchanged": True,
                }
            if requested_revision is not None and requested_revision <= current_revision:
                raise HTTPException(409, "contentRevision 必须高于当前修订")
            next_revision = requested_revision or current_revision + 1
        else:
            if requested_base not in (None, 0):
                raise HTTPException(409, "案例不存在对应的 baseRevision")
            next_revision = requested_revision or 1
            if next_revision < 1:
                raise HTTPException(409, "contentRevision 必须从 1 开始")
        conn.execute(
            "INSERT INTO meta(meta_key, value) VALUES('casepack_version', '0') ON CONFLICT(meta_key) DO NOTHING"
        )
        version_row = conn.execute(
            "SELECT value FROM meta WHERE meta_key='casepack_version' /* FOR UPDATE */"
        ).fetchone()
        version = (int(version_row["value"]) if version_row else 0) + 1
        conn.execute(
            "INSERT INTO meta(meta_key, value) VALUES('casepack_version', ?) ON CONFLICT(meta_key) DO UPDATE SET value=excluded.value",
            (str(version),),
        )
        if exists:
            conn.execute(
                "UPDATE cases SET payload=?, title=?, domain=?, layer=?, difficulty=?, version=?, content_revision=?, source_type=?, source_commit=?, status='published', published_at=datetime('now') WHERE id=?",
                (
                    db.jdump(d),
                    payload.title,
                    payload.domain,
                    payload.layer,
                    payload.difficulty,
                    version,
                    next_revision,
                    source_type,
                    source_commit,
                    payload.id,
                ),
            )
        else:
            conn.execute(
                "INSERT INTO cases(id, submission_id, author_id, title, domain, layer, difficulty, version, content_revision, source_type, source_commit, status, payload, published_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))",
                (
                    payload.id,
                    sub_id,
                    uid,
                    payload.title,
                    payload.domain,
                    payload.layer,
                    payload.difficulty,
                    version,
                    next_revision,
                    source_type,
                    source_commit,
                    "published",
                    db.jdump(d),
                ),
            )
        article_id = _upsert_article(conn, payload, author_name)
        conn.execute(
            "INSERT INTO index_tasks(id, case_id, content_revision, payload) VALUES(?,?,?,?) "
            "ON CONFLICT(case_id, content_revision) DO UPDATE SET payload=excluded.payload, status='pending', last_error=NULL, updated_at=datetime('now')",
            (f"case:{payload.id}:{next_revision}", payload.id, next_revision, db.jdump(d)),
        )
    return {"id": payload.id, "version": version, "contentRevision": next_revision, "articleId": article_id}


def _content_payload(payload: dict) -> dict:
    """去掉发布控制/追溯字段，比较实际案例正文与教学元数据。"""
    return {k: v for k, v in payload.items() if k not in _CONTROL_FIELDS | {"submissionId", "authorName"}}


def _upsert_article(conn, payload: CasePayload, author: str) -> str:
    """在给定事务连接上投影 Case → Article（Web 展示"最终解决逻辑"）。"""
    article_id = "a-" + payload.id
    steps = []
    for st in payload.expert_chain:
        act = st.action_id
        act_name = next((a.name for a in payload.actions if a.id == act), "")
        steps.append(
            {
                "observe": st.thought,
                "act": act_name if act else "（推理收束，停止收集）",
                "found": st.conclusion,
            }
        )
    lessons = [it.text for it in payload.lessons]
    conn.execute(
        "INSERT INTO articles(id, source_type, source_id, title, layer, domain, steps, lessons, author) "
        "VALUES(?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET title=excluded.title, layer=excluded.layer, steps=excluded.steps, "
        "lessons=excluded.lessons, author=excluded.author, published_at=datetime('now')",
        (
            article_id,
            "case",
            payload.id,
            payload.title,
            payload.layer,
            payload.domain,
            db.jdump(steps),
            db.jdump(lessons),
            author,
        ),
    )
    return article_id


def published_after(since: int) -> tuple[int, list[dict]]:
    """App 同步：固定本次响应的发布上界，再读取该上界内的增量。"""
    with db.tx() as conn:
        head_row = conn.execute("SELECT value FROM meta WHERE meta_key='casepack_version'").fetchone()
        head = int(head_row["value"]) if head_row else 0
        rows = conn.execute(
            "SELECT id, version, content_revision, source_type, source_commit, payload FROM cases "
            "WHERE status='published' AND version>? AND version<=? ORDER BY version",
            (since, head),
        ).fetchall()
    return head, [
        dict(
            db.jload(r["payload"], {}),
            contentRevision=r["content_revision"] or 1,
            sourceType=r["source_type"] or "official",
            sourceCommit=r["source_commit"],
        )
        for r in rows
    ]
