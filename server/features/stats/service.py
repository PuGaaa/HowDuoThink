"""stats 域：运营数据。活跃底座 user_activity（登录/进度上传时打点），概览只读聚合。

打点是旁路：失败只告警，绝不影响登录/进度主流程。
完关口径：服务端解析 progress payload（JSON blob），按已发布案例数计算——量级 = 用户数，安全。
"""

import datetime
import logging
from typing import Any

from fastapi import HTTPException

import db
from features.stats import repo
from features.stats.models import LearningEventBody, SessionEndFact

logger = logging.getLogger("server")


def record_learning_event(uid: str, body: LearningEventBody) -> None:
    if body.test_mode or body.preview:
        return
    with db.tx() as conn:
        if repo.claim_identity(conn, body.anonymous_id, uid) != uid:
            raise HTTPException(409, "该学习档案已归入其他账号")
        repo.insert_event(conn, uid, body)


def record_guest_learning_event(body: LearningEventBody) -> None:
    if body.test_mode or body.preview:
        return
    with db.tx() as conn:
        owner = repo.lock_identity(conn, body.anonymous_id, repo.guest_owner(body.anonymous_id))
        repo.insert_event(conn, owner, body)


def claim_guest_learning_events(uid: str, anonymous_id: str) -> None:
    with db.tx() as conn:
        owner = repo.claim_identity(conn, anonymous_id, uid)
        if owner != uid:
            raise HTTPException(status_code=409, detail="该学习档案已归入其他账号")


def record_session_fact(
    conn: Any,
    uid: str,
    session_id: str,
    case_id: str,
    content_revision: int,
    anonymous_id: str | None,
    occurred_at: datetime.datetime,
    solved: bool,
) -> None:
    """供进度域在同一结算事务内补全学习事实，不另建第二个结束事件。"""
    body = SessionEndFact(
        sessionId=session_id,
        caseId=case_id,
        contentRevision=content_revision,
        anonymousId=anonymous_id,
        occurredAt=occurred_at,
        solved=solved,
    )
    repo.record_session_fact(conn, uid, body)


def today_str(offset_days: int = 0) -> str:
    dt = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=offset_days)
    return dt.strftime("%Y-%m-%d")


def touch(uid: str, day: str | None = None) -> None:
    """活跃打点：同一用户同一天只占一行，hits 累加。"""
    try:
        day = day or today_str()
        db.ex(
            "INSERT INTO user_activity(user_id, day, hits) VALUES(?,?,1) "
            "ON CONFLICT(user_id, day) DO UPDATE SET hits=hits+1, updated_at=datetime('now')",
            (uid, day),
        )
    except Exception:
        logger.warning("[stats] 活跃打点失败", exc_info=True)


def overview(days: int = 30) -> dict:
    days = max(1, min(int(days), 365))
    d0 = today_str(-days)
    today = today_str()

    active_daily = db.q(
        "SELECT day, COUNT(DISTINCT user_id) AS active, SUM(hits) AS hits "
        "FROM user_activity WHERE day >= ? GROUP BY day ORDER BY day",
        (d0,),
    )
    dau_today = next((r["active"] for r in active_daily if r["day"] == today), 0)
    active_users_total = db.q("SELECT COUNT(DISTINCT user_id) AS n FROM user_activity WHERE day >= ?", (d0,))[0]["n"]

    new_users = db.q(
        "SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM users "
        "WHERE substr(created_at,1,10) >= ? GROUP BY day ORDER BY day",
        (d0,),
    )
    sub_rows = db.q("SELECT status, COUNT(*) AS n FROM submissions GROUP BY status")
    subs = {r["status"]: r["n"] for r in sub_rows}
    subs_total = sum(subs.values())
    accepted = subs.get("accepted", 0)
    rejected = subs.get("rejected", 0)

    published_in_window = db.q(
        "SELECT COUNT(*) AS n FROM cases WHERE status='published' AND substr(published_at,1,10) >= ?",
        (d0,),
    )[0]["n"]
    published_total = db.q("SELECT COUNT(*) AS n FROM cases WHERE status='published'")[0]["n"]

    solved_total = 0
    users_with_progress = 0
    for r in db.q("SELECT payload FROM progress"):
        solved = sum(1 for v in db.jload(r["payload"], {}).get("cases", {}).values() if v.get("solved"))
        if r["payload"] and db.jload(r["payload"], {}).get("cases"):
            users_with_progress += 1
        solved_total += solved

    return {
        "days": days,
        "activeDaily": [{"day": r["day"], "active": r["active"], "hits": r["hits"]} for r in active_daily],
        "dauToday": dau_today,
        "activeUsersTotal": active_users_total,
        "newUsers": sum(r["n"] for r in new_users),
        "newUsersDaily": [{"day": r["day"], "n": r["n"]} for r in new_users],
        "submissions": {
            "total": subs_total,
            "pending": subs.get("pending", 0),
            "accepted": accepted,
            "rejected": rejected,
            "archived": subs.get("archived", 0),
            "acceptRate": round(accepted / (accepted + rejected), 4) if (accepted + rejected) else None,
        },
        "publishedInWindow": published_in_window,
        "publishedTotal": published_total,
        "progress": {
            "usersWithProgress": users_with_progress,
            "solvedTotal": solved_total,
            "avgSolvedPerUser": round(solved_total / users_with_progress, 2) if users_with_progress else 0,
            "completionRate": round(solved_total / (users_with_progress * published_total), 4)
            if users_with_progress and published_total
            else None,
        },
    }


def event_details(kind: str | None = None, limit: int = 100) -> list[dict]:
    where = "kind=?" if kind else "1=1"
    params = (kind,) if kind else ()
    rows = db.q(
        f"SELECT id, user_id, anonymous_id, kind, occurred_at, payload FROM learning_events WHERE {where} ORDER BY occurred_at DESC LIMIT {int(limit)}",
        params,
    )
    return [dict(row) for row in rows]


def learning_metrics(as_of: str | None = None) -> dict:
    from features.stats.metrics import calculate

    return calculate(repo.learning_rows(), as_of)
