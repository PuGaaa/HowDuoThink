"""案例草稿受限预览。"""

import datetime
import uuid

from fastapi import HTTPException

import db
from core import config, security

PREVIEW_MINUTES = 30


def create(uid: str, cid: str, payload: dict) -> dict:
    rows = db.q("SELECT id FROM cases WHERE id=?", (cid,))
    if not rows:
        raise HTTPException(404, "案例不存在")
    preview_id = uuid.uuid4().hex
    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=PREVIEW_MINUTES)
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO case_previews(id,case_id,created_by,payload,expires_at) VALUES(?,?,?,?,?)",
            (preview_id, cid, uid, db.jdump(payload), expires_at.replace(tzinfo=None).isoformat(sep=" ")),
        )
    token = security.sign_preview(preview_id, int(expires_at.timestamp()))
    path = f"/pages/play/play?previewId={preview_id}&previewToken={token}"
    return {
        "previewId": preview_id,
        "previewToken": token,
        "expiresAt": expires_at.isoformat(),
        "previewUrl": config.APP_H5_ORIGIN.rstrip("/") + path,
    }


def read(preview_id: str, token: str) -> dict:
    token_id = security.verify_preview(token)
    if token_id != preview_id:
        raise HTTPException(401, "预览凭证无效")
    rows = db.q("SELECT id, case_id, payload, expires_at FROM case_previews WHERE id=?", (preview_id,))
    if not rows:
        raise HTTPException(404, "预览不存在")
    row = rows[0]
    expires_at = datetime.datetime.fromisoformat(str(row["expires_at"]))
    if expires_at <= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):
        raise HTTPException(401, "预览已过期")
    return {
        "previewId": row["id"],
        "caseId": row["case_id"],
        "payload": db.jload(row["payload"], {}),
        "expiresAt": expires_at.replace(tzinfo=datetime.timezone.utc).isoformat(),
    }
