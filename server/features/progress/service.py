"""progress 域业务逻辑：按用户存取进度 bundle（整体覆盖语义，合并由客户端负责）。"""

import db

_BUNDLE_DEFAULTS = {
    "streak": {},
    "mascots": {},
    "tasks": {},
    "dailyDone": "",
    "checkuse": 0,
}


def get_progress(uid: str) -> dict:
    rows = db.q("SELECT payload, updated_at FROM progress WHERE user_id=?", (uid,))
    blob = db.jload(rows[0]["payload"], {}) if rows else {}
    out = {"cases": blob.get("cases", {})}
    for k, v in _BUNDLE_DEFAULTS.items():
        out[k] = blob.get(k, v)
    out["updatedAt"] = rows[0]["updated_at"] if rows else ""
    return out


def put_progress(uid: str, bundle: dict) -> dict:
    db.ex(
        "INSERT INTO progress(user_id, payload, updated_at) VALUES(?,?,datetime('now')) "
        "ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload, updated_at=datetime('now')",
        (uid, db.jdump(bundle)),
    )
    return {"ok": True, "updatedAt": db.q("SELECT updated_at FROM progress WHERE user_id=?", (uid,))[0]["updated_at"]}
