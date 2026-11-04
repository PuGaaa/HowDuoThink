"""进度数据访问：所有结算使用同一连接，先锁用户行再读取投影与账本。"""

import json
from dataclasses import dataclass
from typing import Any

from pydantic import TypeAdapter

import db
from features.progress.legacy import unlocked_chapters
from features.progress.models import ImportOperation, ProgressBlob, ProgressOperation, ProgressState, SessionOperation
from features.stats.service import record_session_fact

OPERATIONS = TypeAdapter(list[ProgressOperation])


@dataclass
class History:
    baseline: ProgressBlob | None
    archives: dict[str, ProgressBlob]
    operations: list[ProgressOperation]
    revision: int
    updated_at: str


def lock_user(conn: Any, uid: str) -> None:
    # 已鉴权用户必存在；UPDATE 取得主键写锁，也覆盖 progress 尚不存在的首次并发同步。
    conn.execute("UPDATE users SET id=id WHERE id=?", (uid,))


def load(conn: Any, uid: str) -> History:
    row = conn.execute(
        "SELECT payload, legacy_baseline, revision, updated_at FROM progress WHERE user_id=?", (uid,)
    ).fetchone()
    baseline = None
    if row:
        raw = json.loads(row["payload"])
        if row["legacy_baseline"] is not None:
            baseline = ProgressBlob.model_validate_json(row["legacy_baseline"])
        elif raw.get("schemaVersion") != 2 and raw:
            baseline = ProgressBlob.model_validate(raw)
        if baseline is not None:
            baseline.unlocked_chapter_ids = unlocked_chapters(baseline)
    archives = {
        item["archive_id"]: ProgressBlob.model_validate_json(item["payload"])
        for item in conn.execute("SELECT archive_id,payload FROM progress_imports WHERE user_id=?", (uid,)).fetchall()
    }
    rows = conn.execute(
        "SELECT op_id,kind,payload,occurred_at FROM progress_ops WHERE user_id=? AND protocol_version=2 "
        "AND kind<>'baseline' AND (kind<>'session_end' OR session_id IS NOT NULL)",
        (uid,),
    ).fetchall()
    operations = OPERATIONS.validate_python(
        [
            {"opId": r["op_id"], "kind": r["kind"], "payload": json.loads(r["payload"]), "occurredAt": r["occurred_at"]}
            for r in rows
        ]
    )
    return History(baseline, archives, operations, int(row["revision"]) if row else 0, row["updated_at"] if row else "")


def preserve_baseline(conn: Any, uid: str, baseline: ProgressBlob | None) -> None:
    if baseline is None:
        return
    conn.execute(
        "UPDATE progress SET legacy_baseline=? WHERE user_id=?", (baseline.model_dump_json(by_alias=True), uid)
    )
    conn.execute(
        "INSERT INTO progress_ops(user_id,op_id,kind,payload,occurred_at,protocol_version) VALUES(?,?,?,?,datetime('now'),1) "
        "ON CONFLICT(user_id,op_id) DO UPDATE SET op_id=excluded.op_id",
        (uid, "baseline:" + uid, "baseline", db.jdump({"bundle": baseline.model_dump(by_alias=True)})),
    )


def has_operation(conn: Any, uid: str, op_id: str) -> bool:
    return (
        conn.execute("SELECT op_id FROM progress_ops WHERE user_id=? AND op_id=?", (uid, op_id)).fetchone() is not None
    )


def claim_archive(conn: Any, uid: str, operation: ImportOperation) -> str:
    p = operation.payload
    conn.execute(
        "INSERT INTO progress_imports(archive_id,user_id,payload) VALUES(?,?,?) "
        "ON CONFLICT(archive_id) DO UPDATE SET archive_id=excluded.archive_id",
        (p.archive_id, uid, p.bundle.model_dump_json(by_alias=True)),
    )
    row = conn.execute(
        "SELECT user_id FROM progress_imports WHERE archive_id=? /* FOR UPDATE */", (p.archive_id,)
    ).fetchone()
    return row["user_id"]


def add_operation(conn: Any, uid: str, operation: ProgressOperation) -> bool:
    session_id = None
    if isinstance(operation, SessionOperation):
        seen = conn.execute(
            "SELECT op_id FROM progress_ops WHERE user_id=? AND session_id=?", (uid, operation.payload.session_id)
        ).fetchone()
        if seen is None:
            session_id = operation.payload.session_id
    conn.execute(
        "INSERT INTO progress_ops(user_id,op_id,kind,payload,occurred_at,protocol_version,session_id) VALUES(?,?,?,?,?,2,?)",
        (
            uid,
            operation.op_id,
            operation.kind,
            operation.payload.model_dump_json(by_alias=True),
            operation.occurred_at.isoformat(),
            session_id,
        ),
    )
    return session_id is not None


def add_session_event(conn: Any, uid: str, operation: SessionOperation) -> None:
    if operation.payload.test_mode:
        return
    p = operation.payload
    record_session_fact(
        conn,
        uid,
        p.session_id,
        p.case_id,
        p.content_revision,
        p.anonymous_id,
        operation.occurred_at,
        p.solved,
    )


def save(conn: Any, uid: str, state: ProgressState, revision: int) -> str:
    conn.execute(
        "INSERT INTO progress(user_id,payload,revision,updated_at) VALUES(?,?,?,datetime('now')) "
        "ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_at=datetime('now')",
        (uid, state.model_dump_json(by_alias=True), revision),
    )
    return conn.execute("SELECT updated_at FROM progress WHERE user_id=?", (uid,)).fetchone()["updated_at"]
