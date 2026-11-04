"""学习事件持久化：匿名归属串行化；结算结果补全同一结束事件。"""

import hashlib
from typing import Any

import db
from features.stats.models import LearningEventBody, SessionEndFact


def guest_owner(anonymous_id: str) -> str:
    return "guest:" + hashlib.sha256(anonymous_id.encode()).hexdigest()[:58]


def lock_identity(conn: Any, anonymous_id: str, initial_owner: str) -> str:
    conn.execute(
        "INSERT INTO learning_event_identities(anonymous_id,user_id) VALUES(?,?) ON CONFLICT(anonymous_id) DO NOTHING",
        (anonymous_id, initial_owner),
    )
    return conn.execute(
        "SELECT user_id FROM learning_event_identities WHERE anonymous_id=? /* FOR UPDATE */",
        (anonymous_id,),
    ).fetchone()["user_id"]


def claim_identity(conn: Any, anonymous_id: str, uid: str) -> str:
    owner = lock_identity(conn, anonymous_id, uid)
    if owner.startswith("guest:"):
        conn.execute("UPDATE learning_event_identities SET user_id=? WHERE anonymous_id=?", (uid, anonymous_id))
        owner = uid
    if owner == uid:
        conn.execute(
            "UPDATE learning_events SET user_id=? WHERE user_id LIKE ? AND anonymous_id=?",
            (owner, "guest:%", anonymous_id),
        )
    return owner


def insert_event(conn: Any, uid: str, body: LearningEventBody) -> None:
    event_id = (
        "event-session-end-" + body.session_id
        if body.kind == "session_end"
        else body.event_id or f"{body.session_id}:{body.kind}:{body.source}:{body.occurred_at.isoformat()}"
    )
    conn.execute(
        "INSERT INTO learning_events(id,user_id,anonymous_id,kind,occurred_at,payload) VALUES(?,?,?,?,?,?) "
        "ON CONFLICT(id) DO NOTHING",
        (
            "client:" + event_id,
            uid,
            body.anonymous_id,
            body.kind,
            body.occurred_at.isoformat(),
            db.jdump(body.model_dump(mode="json", by_alias=True)),
        ),
    )


def record_session_fact(conn: Any, uid: str, body: SessionEndFact) -> None:
    payload = body.model_dump(mode="json", by_alias=True)
    payload.update(kind="session_end", source="progress", authoritative=True)
    conn.execute(
        "INSERT INTO learning_events(id,user_id,anonymous_id,kind,occurred_at,payload) VALUES(?,?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,"
        "anonymous_id=COALESCE(excluded.anonymous_id,anonymous_id),"
        "occurred_at=excluded.occurred_at,payload=excluded.payload",
        (
            "client:event-session-end-" + body.session_id,
            uid,
            body.anonymous_id,
            "session_end",
            body.occurred_at.isoformat(),
            db.jdump(payload),
        ),
    )


def learning_rows() -> list[dict]:
    return db.q(
        "SELECT user_id, anonymous_id, kind, occurred_at, payload FROM learning_events "
        "WHERE user_id NOT LIKE 'test:%' AND user_id NOT IN (SELECT id FROM users WHERE role='test')"
    )
