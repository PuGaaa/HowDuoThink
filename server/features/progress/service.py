"""progress 域业务逻辑：事实操作入账，服务端维护用户投影。"""

import db
from features.progress.models import ProgressOperation

_BUNDLE_DEFAULTS = {
    "streak": {},
    "mascots": {},
    "tasks": {},
    "dailyDone": "",
    "checkuse": 0,
}


def get_progress(uid: str) -> dict:
    rows = db.q("SELECT payload, updated_at, revision FROM progress WHERE user_id=?", (uid,))
    blob = db.jload(rows[0]["payload"], {}) if rows else {}
    out = {"cases": blob.get("cases", {})}
    for k, v in _BUNDLE_DEFAULTS.items():
        out[k] = blob.get(k, v)
    out["updatedAt"] = rows[0]["updated_at"] if rows else ""
    out["revision"] = int(rows[0]["revision"]) if rows else 0
    return out


def put_progress(uid: str, bundle: dict) -> dict:
    db.ex(
        "INSERT INTO progress(user_id, payload, updated_at) VALUES(?,?,datetime('now')) "
        "ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload, updated_at=datetime('now')",
        (uid, db.jdump(bundle)),
    )
    return {"ok": True, "updatedAt": db.q("SELECT updated_at FROM progress WHERE user_id=?", (uid,))[0]["updated_at"]}


def sync_operations(uid: str, operations: list[ProgressOperation]) -> dict:
    with db.tx() as conn:
        row = conn.execute("SELECT payload, revision FROM progress WHERE user_id=?", (uid,)).fetchone()
        bundle = db.jload(row["payload"], {}) if row else {}
        bundle.setdefault("cases", {})
        bundle.setdefault("mascots", {})
        bundle.setdefault("streak", {})
        bundle.setdefault("checkuse", 0)
        revision = int(row["revision"]) if row else 0
        confirmed = []
        for operation in operations:
            seen = conn.execute(
                "SELECT op_id FROM progress_ops WHERE user_id=? AND op_id=?", (uid, operation.op_id)
            ).fetchone()
            if seen:
                confirmed.append(operation.op_id)
                continue
            _apply_operation(bundle, operation)
            conn.execute(
                "INSERT INTO progress_ops(user_id, op_id, kind, payload, occurred_at) VALUES(?,?,?,?,?)",
                (uid, operation.op_id, operation.kind, db.jdump(operation.payload), operation.occurred_at),
            )
            revision += 1
            confirmed.append(operation.op_id)
        conn.execute(
            "INSERT INTO progress(user_id, payload, revision, updated_at) VALUES(?,?,?,datetime('now')) "
            "ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload, revision=excluded.revision, updated_at=datetime('now')",
            (uid, db.jdump(bundle), revision),
        )
    return {**bundle, "revision": revision, "confirmedOperationIds": confirmed}


def _apply_operation(bundle: dict, operation: ProgressOperation) -> None:
    p = operation.payload
    if operation.kind == "session_end":
        case_id = p["caseId"]
        current = bundle["cases"].setdefault(
            case_id, {"solved": False, "bestGrade": "", "bestCost": 0, "plays": 0, "fails": 0}
        )
        current["solved"] = bool(current["solved"] or p["solved"])
        grade = p["grade"]
        if _grade_rank(grade) < _grade_rank(current.get("bestGrade", "")):
            current["bestGrade"] = grade
        current["bestCost"] = max(current.get("bestCost", 0), p["playerCost"])
        current["plays"] = current.get("plays", 0) + 1
        current["fails"] = current.get("fails", 0) + (0 if p["solved"] else 1)
        for mascot in p.get("mascotEvents", []):
            bundle["mascots"][mascot["id"]] = bundle["mascots"].get(mascot["id"], 0) + 1
    elif operation.kind == "checklist_use":
        bundle["checkuse"] = bundle.get("checkuse", 0) + 1


def _grade_rank(grade: str) -> int:
    return {"S": 0, "A": 1, "B": 2}.get(grade, 3)
