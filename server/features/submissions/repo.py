"""投稿数据访问：原稿不覆盖，作者请求与内容唯一，编审记录明确可见范围。"""

from typing import Any

import db
from features.submissions.models import SubmissionCreate


def lock_author(conn: Any, uid: str) -> None:
    conn.execute("UPDATE users SET id=id WHERE id=?", (uid,))


def get(conn: Any, sid: str, lock: bool = False):
    suffix = " /* FOR UPDATE */" if lock else ""
    return conn.execute(
        "SELECT s.*,u.login AS author FROM submissions s LEFT JOIN users u ON u.id=s.user_id WHERE s.id=?" + suffix,
        (sid,),
    ).fetchone()


def list_rows(conn: Any, uid: str | None = None, status: str | None = None) -> list:
    where, params = [], []
    if uid is not None:
        where.append("s.user_id=?")
        params.append(uid)
    if status is not None:
        where.append("s.status=?")
        params.append(status)
    clause = " AND ".join(where) or "1=1"
    return conn.execute(
        f"SELECT s.*,u.login AS author FROM submissions s LEFT JOIN users u ON u.id=s.user_id WHERE {clause} ORDER BY s.created_at DESC,s.id LIMIT 200",
        tuple(params),
    ).fetchall()


def existing_request(conn: Any, uid: str, request_id: str):
    return conn.execute(
        "SELECT r.submission_id,s.status FROM submission_requests r JOIN submissions s ON s.id=r.submission_id WHERE r.user_id=? AND r.request_id=?",
        (uid, request_id),
    ).fetchone()


def existing_content(conn: Any, uid: str, fingerprint: str):
    return conn.execute(
        "SELECT id,status FROM submissions WHERE user_id=? AND content_fingerprint=?", (uid, fingerprint)
    ).fetchone()


def register_request(conn: Any, uid: str, request_id: str, sid: str) -> None:
    conn.execute(
        "INSERT INTO submission_requests(user_id,request_id,submission_id) VALUES(?,?,?)", (uid, request_id, sid)
    )


def count_today(conn: Any, uid: str, today: str) -> int:
    return int(
        conn.execute(
            "SELECT COUNT(*) AS n FROM submissions WHERE user_id=? AND substr(created_at,1,10)=?", (uid, today)
        ).fetchone()["n"]
    )


def create(conn: Any, uid: str, sid: str, fingerprint: str, body: SubmissionCreate) -> None:
    conn.execute(
        "INSERT INTO submissions(id,user_id,title,symptom,resolution,key_error,timeline,lessons,stack_tags,domain_hint,request_id,content_fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            sid,
            uid,
            body.title,
            body.symptom,
            body.resolution,
            body.key_error,
            body.timeline,
            db.jdump(body.lessons),
            db.jdump(body.stack_tags),
            body.domain_hint,
            body.request_id,
            fingerprint,
        ),
    )

    conn.execute("INSERT INTO submission_reviews(submission_id,candidate_ids) VALUES(?,'[]')", (sid,))


def review(conn: Any, sid: str):
    return conn.execute("SELECT * FROM submission_reviews WHERE submission_id=?", (sid,)).fetchone()


def messages(conn: Any, sid: str, editor: bool = False) -> list:
    where = "" if editor else " AND visibility='author'"
    return conn.execute(
        "SELECT id,author_id,visibility,kind,body,created_at FROM submission_messages WHERE submission_id=?"
        + where
        + " ORDER BY id",
        (sid,),
    ).fetchall()


def add_message(conn: Any, sid: str, uid: str, visibility: str, kind: str, body: str) -> None:
    conn.execute(
        "INSERT INTO submission_messages(submission_id,author_id,visibility,kind,body) VALUES(?,?,?,?,?)",
        (sid, uid, visibility, kind, body),
    )


def supplement(conn: Any, sid: str) -> None:
    conn.execute(
        "UPDATE submission_reviews SET source_revision=source_revision+1,confirmed_version=0,decision=NULL WHERE submission_id=?",
        (sid,),
    )
    conn.execute("UPDATE submissions SET status='pending' WHERE id=?", (sid,))


def save_material(conn: Any, sid: str, material: str) -> None:
    conn.execute(
        "UPDATE submission_reviews SET material=?,material_version=material_version+1,material_source_revision=source_revision,confirmed_version=0,decision=NULL WHERE submission_id=?",
        (material, sid),
    )


def confirm_material(conn: Any, sid: str, version: int) -> None:
    conn.execute("UPDATE submission_reviews SET confirmed_version=? WHERE submission_id=?", (version, sid))


def save_review(conn: Any, sid: str, uid: str, body) -> None:
    conn.execute(
        "UPDATE submission_reviews SET decision=?,mechanism=?,evidence=?,reasoning=?,candidate_ids=?,reviewer_id=?,reviewed_material_version=material_version WHERE submission_id=?",
        (body.decision, body.mechanism, body.evidence, body.reasoning, db.jdump(body.candidate_ids), uid, sid),
    )
    status = {"distinct": "pending", "merge": "accepted", "needs_more": "needs_more", "reject": "rejected"}[
        body.decision
    ]
    conn.execute(
        "UPDATE submissions SET status=?,review_note=?,linked_case_id=?,parent_submission_id=?,reviewed_at=datetime('now') WHERE id=?",
        (status, body.public_note, body.linked_case_id, body.parent_submission_id, sid),
    )


def set_status(conn: Any, sid: str, status: str, note: str) -> None:
    conn.execute(
        "UPDATE submissions SET status=?,review_note=?,reviewed_at=datetime('now') WHERE id=?", (status, note, sid)
    )


def case_for_submission(conn: Any, submission) -> Any:
    source_id = submission["parent_submission_id"] or submission["id"]
    return conn.execute(
        "SELECT id,status,title FROM cases WHERE id=? OR submission_id=? ORDER BY CASE WHEN status='published' THEN 0 ELSE 1 END LIMIT 1",
        (submission["linked_case_id"], source_id),
    ).fetchone()


def published_candidates(conn: Any) -> list:
    return conn.execute(
        "SELECT id,title,status,payload,submission_id FROM cases WHERE status='published' ORDER BY published_at DESC LIMIT 300"
    ).fetchall()


def private_candidates(conn: Any, sid: str) -> tuple[list, list]:
    cases = conn.execute(
        "SELECT id,title,status,payload,submission_id FROM cases WHERE status='draft' AND (submission_id IS NULL OR submission_id<>?) ORDER BY created_at DESC LIMIT 200",
        (sid,),
    ).fetchall()
    submissions = conn.execute(
        "SELECT s.id,s.title,s.symptom,s.resolution,s.status,r.source_revision,r.material_version,r.material FROM submissions s JOIN submission_reviews r ON r.submission_id=s.id WHERE s.id<>? AND s.status IN ('pending','needs_more','accepted') ORDER BY s.created_at DESC LIMIT 200",
        (sid,),
    ).fetchall()
    return cases, submissions


def existing_case(conn: Any, cid: str, lock: bool = False):
    suffix = " /* FOR UPDATE */" if lock else ""
    return conn.execute("SELECT id,status FROM cases WHERE id=?" + suffix, (cid,)).fetchone()


def save_draft(conn: Any, uid: str, sid: str, payload: dict) -> None:
    cid = payload["id"]
    conn.execute(
        "INSERT INTO cases(id,submission_id,author_id,title,domain,layer,difficulty,version,status,payload,source_type) VALUES(?,?,?,?,?,?,?,0,'draft',?,'community') "
        "ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,title=excluded.title,domain=excluded.domain,layer=excluded.layer,difficulty=excluded.difficulty",
        (
            cid,
            sid,
            uid,
            payload["title"],
            payload["domain"],
            payload["layer"],
            payload["difficulty"],
            db.jdump(payload),
        ),
    )
    conn.execute("UPDATE submissions SET status='accepted',reviewed_at=datetime('now') WHERE id=?", (sid,))


def contributors(conn: Any, cid: str) -> list:
    return conn.execute(
        "SELECT s.user_id,u.name AS author,CASE WHEN s.id=c.submission_id THEN 'source' ELSE 'evidence' END AS role "
        "FROM cases c JOIN submissions s ON s.id=c.submission_id OR s.linked_case_id=c.id OR s.parent_submission_id=c.submission_id "
        "JOIN users u ON u.id=s.user_id LEFT JOIN submission_reviews r ON r.submission_id=s.id "
        "WHERE c.id=? AND c.status='published' AND (s.id=c.submission_id OR (r.decision='merge' AND r.confirmed_version>0 "
        "AND r.confirmed_version=r.material_version AND r.material_source_revision=r.source_revision)) ORDER BY role DESC,s.created_at,s.id",
        (cid,),
    ).fetchall()


def supplement_texts(conn: Any, submission_ids: list[str]) -> dict[str, str]:
    grouped = {sid: "" for sid in submission_ids}
    if not submission_ids:
        return grouped
    placeholders = ",".join("?" for _ in submission_ids)
    rows = conn.execute(
        f"SELECT submission_id,body FROM submission_messages WHERE kind='supplement' AND submission_id IN ({placeholders}) ORDER BY id",
        tuple(submission_ids),
    ).fetchall()
    for row in rows:
        grouped[row["submission_id"]] += " " + row["body"]
    return grouped
