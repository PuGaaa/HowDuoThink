"""progress 域业务逻辑：按用户存取进度 blob（整体覆盖语义，合并由客户端负责）。"""
from fastapi import HTTPException

import db


def get_progress(uid: str) -> dict:
    rows = db.q("SELECT blob, updated_at FROM progress WHERE user_id=?", (uid,))
    if not rows:
        return {"cases": {}, "updatedAt": ""}
    return {"cases": db.jload(rows[0]["blob"], {}), "updatedAt": rows[0]["updated_at"]}


def put_progress(uid: str, cases: dict) -> dict:
    db.ex(
        "INSERT INTO progress(user_id, blob, updated_at) VALUES(?,?,datetime('now')) "
        "ON CONFLICT(user_id) DO UPDATE SET blob=excluded.blob, updated_at=datetime('now')",
        (uid, db.jdump(cases)),
    )
    return {"ok": True, "updatedAt": db.q("SELECT updated_at FROM progress WHERE user_id=?", (uid,))[0]["updated_at"]}
