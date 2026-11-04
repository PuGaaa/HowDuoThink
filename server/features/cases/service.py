"""案例公共接口：草稿维护、只读来源、修订历史与统一发布。"""

from fastapi import HTTPException

import db
from features.cases import content, repo
from features.cases.models import CaseDraftBody, CaseDraftPayload, CaseMetaBody
from features.cases.publication import import_official, publish_case

__all__ = ["import_official", "publish_case"]


def _editable(row, cid: str) -> None:
    if cid in content.OFFICIAL_IDS or (row and row["source_type"] == "official"):
        raise HTTPException(403, "官方正文和元数据只读，请从 Git 唯一源发布")
    if row and row["status"] != "draft":
        raise HTTPException(409, "已发布或归档案例不能经草稿维护，请重新载入后走正式发布")


def save_case_draft(uid: str, body: CaseDraftBody) -> dict:
    with db.tx() as conn:
        row = repo.get(conn, body.id, lock=True)
        _editable(row, body.id)
        payload = dict(body.payload.model_dump(by_alias=True), id=body.id)
        repo.save_draft(conn, uid, body.id, body.submission_id, payload, row is not None)
    return {"id": body.id, "status": "draft"}


def update_case_meta(cid: str, body: CaseMetaBody) -> dict:
    with db.tx() as conn:
        row = repo.get(conn, cid, lock=True)
        if row is None:
            raise HTTPException(404, "案例不存在")
        _editable(row, cid)
        payload = db.jload(row["payload"], {})
        changes = body.model_dump(by_alias=True, exclude_none=True)
        payload.update(changes)
        repo.save_meta(conn, cid, payload)
    return {"ok": True, "meta": {key: payload.get(key) for key in ("part", "chapterId", "order", "typeTags")}}


def _view(row) -> dict:
    source = "official" if row["id"] in content.OFFICIAL_IDS or row["source_type"] == "official" else "community"
    return {
        "id": row["id"],
        "title": row["title"],
        "domain": row["domain"],
        "layer": row["layer"],
        "difficulty": row["difficulty"],
        "version": row["version"],
        "status": row["status"],
        "contentRevision": row["content_revision"],
        "sourceType": source,
        "sourceCommit": row["source_commit"],
        "readOnly": source == "official" or row["status"] == "archived",
        "submissionId": row["submission_id"],
    }


def list_admin_cases(status: str | None = None) -> list[dict]:
    with db.tx() as conn:
        return [_view(row) for row in repo.list_cases(conn, status)]


def admin_case_detail(cid: str) -> dict:
    with db.tx() as conn:
        row = repo.get(conn, cid)
        if row is None:
            raise HTTPException(404, "案例不存在")
        return dict(
            _view(row), payload=CaseDraftPayload.model_validate(db.jload(row["payload"], {})).model_dump(by_alias=True)
        )


def revision_history(cid: str) -> list[dict]:
    with db.tx() as conn:
        if repo.get(conn, cid) is None:
            raise HTTPException(404, "案例不存在")
        return [
            {
                "contentRevision": row["content_revision"],
                "contentHash": row["content_hash"],
                "sourceType": row["source_type"],
                "sourceCommit": row["source_commit"],
                "publishedBy": row["published_by"],
                "publishedAt": row["published_at"],
                "recordedAt": row["recorded_at"],
                "legacySnapshot": bool(row["legacy_snapshot"]),
                "payload": db.jload(row["payload"], {}),
            }
            for row in repo.revisions(conn, cid)
        ]


def published_after(since: int) -> tuple[int, list[dict]]:
    with db.tx() as conn:
        head = repo.current_cursor(conn)
        rows = repo.published_after(conn, since, head)
    return head, [
        dict(
            db.jload(row["payload"], {}),
            contentRevision=row["content_revision"],
            sourceType="official"
            if row["id"] in content.OFFICIAL_IDS or row["source_type"] == "official"
            else "community",
            sourceCommit=row["source_commit"],
        )
        for row in rows
    ]
