"""stats 域：运营数据。活跃底座 user_activity（登录/进度上传时打点），概览只读聚合。

打点是旁路：失败只告警，绝不影响登录/进度主流程。
完关口径：服务端解析 progress payload（JSON blob），按已发布案例数计算——量级 = 用户数，安全。
"""

import datetime
import logging
from collections import defaultdict
from zoneinfo import ZoneInfo

import db
from features.stats.models import LearningEventBody

logger = logging.getLogger("server")


def record_learning_event(uid: str, body: LearningEventBody) -> None:
    if body.test_mode:
        return
    event_id = body.event_id or f"{body.session_id}:{body.kind}:{body.source}:{body.occurred_at.isoformat()}"
    payload = body.model_dump(mode="json", by_alias=True)
    db.ex(
        "INSERT INTO learning_events(id,user_id,anonymous_id,kind,occurred_at,payload) VALUES(?,?,?,?,?,?) "
        "ON CONFLICT(id) DO NOTHING",
        ("client:" + event_id, uid, body.anonymous_id, body.kind, body.occurred_at.isoformat(), db.jdump(payload)),
    )


def record_guest_learning_event(body: LearningEventBody) -> None:
    if body.test_mode:
        return
    event_id = body.event_id or f"{body.session_id}:{body.kind}:{body.source}:{body.occurred_at.isoformat()}"
    guest_id = "guest:" + (body.anonymous_id or "")
    payload = body.model_dump(mode="json", by_alias=True)
    db.ex(
        "INSERT INTO learning_events(id,user_id,anonymous_id,kind,occurred_at,payload) VALUES(?,?,?,?,?,?) "
        "ON CONFLICT(id) DO NOTHING",
        ("client:" + event_id, guest_id, body.anonymous_id, body.kind, body.occurred_at.isoformat(), db.jdump(payload)),
    )


def claim_guest_learning_events(uid: str, anonymous_id: str) -> None:
    db.ex(
        "UPDATE learning_events SET user_id=? WHERE user_id=? AND anonymous_id=?",
        (uid, "guest:" + anonymous_id, anonymous_id),
    )


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
    today = as_of or today_str()
    rows = db.q("SELECT user_id, kind, occurred_at, payload FROM learning_events WHERE user_id NOT LIKE 'test:%'")
    by_user: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_user[row["user_id"]].append(row)
    started = finished = solved = d1_eligible = d1_retained = d7_eligible = d7_retained = 0
    three_case_eligible = three_case_completed = 0
    week_start = datetime.date.fromisoformat(today) - datetime.timedelta(
        days=datetime.date.fromisoformat(today).weekday()
    )
    week_solved = set()
    for events in by_user.values():
        starts = [event for event in events if event["kind"] == "session_start"]
        session_events = [event for event in events if event["kind"] == "session_end"]
        verified_sessions = {
            db.jload(event["payload"], {}).get("sessionId") for event in events if event["kind"] == "verification"
        }
        effective_end_events = [
            event for event in session_events if db.jload(event["payload"], {}).get("sessionId") in verified_sessions
        ]
        if not starts:
            continue
        started += 1
        finished += bool(session_events)
        if any(db.jload(event["payload"], {}).get("solved") for event in session_events):
            solved += 1
            if any(_event_day(event["occurred_at"]) >= week_start.isoformat() for event in session_events):
                week_solved.add(events[0]["user_id"])
        completion_days = {_event_day(event["occurred_at"]) for event in effective_end_events}
        first = min(_event_day(event["occurred_at"]) for event in starts)
        d1 = (datetime.date.fromisoformat(first) + datetime.timedelta(days=1)).isoformat()
        d7 = (datetime.date.fromisoformat(first) + datetime.timedelta(days=7)).isoformat()
        if first <= (datetime.date.fromisoformat(today) - datetime.timedelta(days=1)).isoformat():
            d1_eligible += 1
            if d1 in completion_days:
                d1_retained += 1
        if first <= (datetime.date.fromisoformat(today) - datetime.timedelta(days=7)).isoformat():
            d7_eligible += 1
            if d7 in completion_days:
                d7_retained += 1
        first_day = datetime.date.fromisoformat(first)
        if first_day <= datetime.date.fromisoformat(today) - datetime.timedelta(days=6):
            three_case_eligible += 1
            cases = {
                db.jload(event["payload"], {}).get("caseId")
                for event in effective_end_events
                if 0 <= (datetime.date.fromisoformat(_event_day(event["occurred_at"])) - first_day).days < 7
            }
            if len(cases) >= 3:
                three_case_completed += 1
    return {
        "asOf": today,
        "funnel": {"startedUsers": started, "finishedUsers": finished, "solvedUsers": solved},
        "d1": {"eligibleUsers": d1_eligible, "retainedUsers": d1_retained},
        "d7": {"eligibleUsers": d7_eligible, "retainedUsers": d7_retained},
        "threeCase7d": {"eligibleUsers": three_case_eligible, "completedUsers": three_case_completed},
        "weeklySolvedUsers": len(week_solved),
    }


def _event_day(value: str) -> str:
    return (
        datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        .astimezone(ZoneInfo("Asia/Shanghai"))
        .date()
        .isoformat()
    )
