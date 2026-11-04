"""案例数据访问；所有发布写入使用调用方的同一个事务连接。"""

from typing import Any

import db
from features.cases.models import ArticleProjection, CasePayload


def get(conn: Any, cid: str, lock: bool = False) -> Any:
    suffix = " /* FOR UPDATE */" if lock else ""
    return conn.execute("SELECT * FROM cases WHERE id=?" + suffix, (cid,)).fetchone()


def author(conn: Any, uid: str) -> Any:
    return conn.execute("SELECT name,login FROM users WHERE id=?", (uid,)).fetchone()


def list_cases(conn: Any, status: str | None) -> list:
    where, params = ("status=?", (status,)) if status else ("1=1", ())
    return conn.execute(f"SELECT * FROM cases WHERE {where} ORDER BY created_at DESC LIMIT 500", params).fetchall()


def save_draft(conn: Any, uid: str, cid: str, sid: str | None, payload: dict, exists: bool) -> None:
    if exists:
        conn.execute(
            "UPDATE cases SET payload=?,title=?,domain=?,layer=?,difficulty=? WHERE id=?",
            (
                db.jdump(payload),
                payload.get("title", ""),
                payload.get("domain", ""),
                payload.get("layer", ""),
                payload.get("difficulty", 1),
                cid,
            ),
        )
    else:
        conn.execute(
            "INSERT INTO cases(id,submission_id,author_id,title,domain,layer,difficulty,version,status,payload,source_type) VALUES(?,?,?,?,?,?,?,0,'draft',?,'community')",
            (
                cid,
                sid,
                uid,
                payload.get("title", ""),
                payload.get("domain", ""),
                payload.get("layer", ""),
                payload.get("difficulty", 1),
                db.jdump(payload),
            ),
        )


def save_meta(conn: Any, cid: str, payload: dict) -> None:
    conn.execute("UPDATE cases SET payload=? WHERE id=?", (db.jdump(payload), cid))


def next_cursor(conn: Any) -> int:
    conn.execute("INSERT INTO meta(meta_key,value) VALUES('casepack_version','0') ON CONFLICT(meta_key) DO NOTHING")
    row = conn.execute("SELECT value FROM meta WHERE meta_key='casepack_version' /* FOR UPDATE */").fetchone()
    value = int(row["value"]) + 1
    conn.execute("UPDATE meta SET value=? WHERE meta_key='casepack_version'", (str(value),))
    return value


def current_cursor(conn: Any) -> int:
    return int(conn.execute("SELECT value FROM meta WHERE meta_key='casepack_version'").fetchone()["value"])


def publish(
    conn: Any,
    uid: str | None,
    payload: CasePayload,
    stored: dict,
    sid: str | None,
    source_type: str,
    source_commit: str | None,
    revision: int,
    cursor: int,
    exists: bool,
) -> None:
    values = (
        db.jdump(stored),
        payload.title,
        payload.domain,
        payload.layer,
        payload.difficulty,
        cursor,
        revision,
        source_type,
        source_commit,
        payload.id,
    )
    if exists:
        conn.execute(
            "UPDATE cases SET payload=?,title=?,domain=?,layer=?,difficulty=?,version=?,content_revision=?,source_type=?,source_commit=?,status='published',published_at=datetime('now') WHERE id=?",
            values,
        )
    else:
        conn.execute(
            "INSERT INTO cases(payload,title,domain,layer,difficulty,version,content_revision,source_type,source_commit,id,submission_id,author_id,status,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'published',datetime('now'))",
            values + (sid, uid),
        )


def save_article(conn: Any, article: ArticleProjection) -> None:
    conn.execute(
        "INSERT INTO articles(id,source_type,source_id,title,layer,domain,steps,lessons,author) VALUES(?,'case',?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,layer=excluded.layer,domain=excluded.domain,steps=excluded.steps,lessons=excluded.lessons,author=excluded.author,published_at=datetime('now')",
        (
            article.id,
            article.id.removeprefix("a-"),
            article.title,
            article.layer,
            article.domain,
            db.jdump([step.model_dump() for step in article.steps]),
            db.jdump(article.lessons),
            article.author,
        ),
    )


def save_revision(
    conn: Any,
    cid: str,
    revision: int,
    digest: str,
    payload: dict,
    source_type: str,
    source_commit: str | None,
    uid: str | None,
    legacy: bool = False,
) -> None:
    published_at = "NULL" if legacy else "datetime('now')"
    conn.execute(
        f"INSERT INTO case_revisions(case_id,content_revision,content_hash,payload,source_type,source_commit,published_by,published_at,legacy_snapshot) VALUES(?,?,?,?,?,?,?,{published_at},?)",
        (cid, revision, digest, db.jdump(payload), source_type, source_commit, uid, int(legacy)),
    )


def enqueue_index(conn: Any, cid: str, revision: int, payload: dict) -> None:
    conn.execute(
        "INSERT INTO index_tasks(id,case_id,content_revision,payload) VALUES(?,?,?,?)",
        (f"case:{cid}:{revision}", cid, revision, db.jdump(payload)),
    )


def revisions(conn: Any, cid: str) -> list:
    return conn.execute(
        "SELECT * FROM case_revisions WHERE case_id=? ORDER BY content_revision DESC LIMIT 100", (cid,)
    ).fetchall()


def published_after(conn: Any, since: int, head: int) -> list:
    return conn.execute(
        "SELECT * FROM cases WHERE status='published' AND version>? AND version<=? ORDER BY version", (since, head)
    ).fetchall()


def mark_legacy(conn: Any, cid: str) -> None:
    conn.execute("UPDATE cases SET published_at=NULL WHERE id=?", (cid,))
