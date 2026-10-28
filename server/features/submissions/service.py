"""submissions 域业务逻辑：投稿创建、我的投稿、审核状态、投稿→Case 草稿转换。
转稿会编排写入 cases 表（依赖规则允许 submissions → cases 数据归属的编排流）。"""
from fastapi import HTTPException

import db
import time
import uuid

# 每用户每日投稿上限：防脚本刷爆管理端审核队列（DB 计数，跨重启/进程一致）
SUBMISSION_DAILY_LIMIT = 20


def create_submission(uid: str, body) -> dict:
    today = time.strftime("%Y-%m-%d", time.gmtime())
    rows = db.q(
        "SELECT COUNT(*) AS n FROM submissions WHERE user_id=? AND substr(created_at,1,10)=?",
        (uid, today),
    )
    if int(rows[0]["n"] or 0) >= SUBMISSION_DAILY_LIMIT:
        raise HTTPException(429, "今日投稿次数已达上限，明天再来")
    sid = "s-" + uuid.uuid4().hex[:12]
    db.ex(
        "INSERT INTO submissions(id, user_id, title, symptom, resolution, key_error, timeline, lessons, stack_tags, domain_hint) "
        "VALUES(?,?,?,?,?,?,?,?,?,?)",
        (
            sid, uid, body.title, body.symptom, body.resolution,
            body.key_error, body.timeline, db.jdump(body.lessons), db.jdump(body.stack_tags), body.domain_hint,
        ),
    )
    return {"id": sid, "status": "pending"}


def my_submissions(uid: str) -> list[dict]:
    rows = db.q("SELECT id, title, status, review_note, created_at FROM submissions WHERE user_id=? ORDER BY created_at DESC", (uid,))
    return [
        {"id": r["id"], "title": r["title"], "status": r["status"], "reviewNote": r["review_note"], "createdAt": r["created_at"]}
        for r in rows
    ]


def admin_list(status: str | None = None) -> list[dict]:
    where, params = "1=1", []
    if status:
        where, params = "status=?", [status]
    rows = db.q(
        f"SELECT s.*, u.login AS author_login FROM submissions s LEFT JOIN users u ON u.id=s.user_id "
        f"WHERE {where} ORDER BY s.created_at DESC",
        tuple(params),
    )
    return [
        {
            "id": r["id"], "title": r["title"], "symptom": r["symptom"], "resolution": r["resolution"],
            "keyError": r["key_error"], "timeline": r["timeline"],
            "lessons": db.jload(r["lessons"], []), "stackTags": db.jload(r["stack_tags"], []),
            "domainHint": r["domain_hint"], "status": r["status"], "reviewNote": r["review_note"],
            "author": r["author_login"], "createdAt": r["created_at"],
        }
        for r in rows
    ]


def set_status(sid: str, status: str, review_note: str) -> dict:
    rows = db.q("SELECT id FROM submissions WHERE id=?", (sid,))
    if not rows:
        raise HTTPException(404, "投稿不存在")
    db.ex(
        "UPDATE submissions SET status=?, review_note=?, reviewed_at=datetime('now') WHERE id=?",
        (status, review_note, sid),
    )
    return {"id": sid, "status": status}


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


def _int_or(v, default: int) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def create_draft_with_payload(uid: str, sid: str, payload: dict) -> dict:
    """给定成品 payload 的转稿落库（cases + submissions 同事务）。
    机械骨架（create_draft_from_submission）与 AI 起草（ai.service）共用此唯一写入口。
    status 守卫带条件谓词：预检与写入之间案例被并发发布时，UPDATE ... AND status='draft'
    的 rowcount=0 仍然拒绝；元数据列随 payload 同步。"""
    with db.tx() as conn:
        exists = conn.execute("SELECT status FROM cases WHERE id=?", (payload["id"],)).fetchone()
        if exists:
            if exists["status"] != "draft":
                raise HTTPException(409, "该案例已发布：不能经转稿覆盖，请走重新发布流程")
            cur = conn.execute(
                "UPDATE cases SET payload=?, title=?, domain=?, layer=?, difficulty=? WHERE id=? AND status='draft'",
                (
                    db.jdump(payload),
                    str(payload.get("title", "")),
                    str(payload.get("domain", "runtime")),
                    str(payload.get("layer", "")),
                    _int_or(payload.get("difficulty"), 2),
                    payload["id"],
                ),
            )
            if cur.rowcount != 1:
                raise HTTPException(409, "案例状态已变化（已发布或已删除）：不能经转稿覆盖")
        else:
            conn.execute(
                "INSERT INTO cases(id, submission_id, author_id, title, domain, layer, difficulty, version, status, payload) "
                "VALUES(?,?,?,?,?,?,?,?,?,?)",
                (payload["id"], sid, uid, payload.get("title", ""), payload.get("domain", "runtime"),
                 payload.get("layer", ""), _int_or(payload.get("difficulty"), 2), 0, "draft", db.jdump(payload)),
            )
        conn.execute(
            "UPDATE submissions SET status='accepted', reviewed_at=datetime('now') WHERE id=? AND status='pending'", (sid,)
        )
    return {"caseId": payload["id"], "submissionId": sid, "status": "draft"}


def create_draft_from_submission(uid: str, sid: str) -> dict:
    return create_draft_with_payload(uid, sid, draft_skeleton_from_submission(sid))
