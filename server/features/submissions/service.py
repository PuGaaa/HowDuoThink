"""投稿编排：请求幂等、作者结果投影和受限素材转稿。"""

import time
import uuid

from fastapi import HTTPException

import db
from features.submissions import matching, repo
from features.submissions.models import SubmissionCreate
from features.submissions.review import (  # 跨feature只使用本模块公开接口。
    add_supplement,
    authorized_draft_source,
    confirm_material,
    require_publication_review,
    save_material,
    save_review,
)

SUBMISSION_DAILY_LIMIT = 20
__all__ = [
    "add_supplement",
    "authorized_draft_source",
    "confirm_material",
    "require_publication_review",
    "save_material",
    "save_review",
]


def create_submission(uid: str, body: SubmissionCreate) -> dict:
    digest = matching.fingerprint(body)
    with db.tx() as conn:
        repo.lock_author(conn, uid)
        previous = repo.existing_request(conn, uid, body.request_id)
        if previous:
            return {"id": previous["submission_id"], "status": previous["status"], "duplicate": True}
        previous = repo.existing_content(conn, uid, digest)
        if previous:
            repo.register_request(conn, uid, body.request_id, previous["id"])
            return {"id": previous["id"], "status": previous["status"], "duplicate": True}
        if repo.count_today(conn, uid, time.strftime("%Y-%m-%d", time.gmtime())) >= SUBMISSION_DAILY_LIMIT:
            raise HTTPException(429, "今日投稿次数已达上限，明天再来")
        sid = "s-" + uuid.uuid4().hex[:12]
        repo.create(conn, uid, sid, digest, body)
        repo.register_request(conn, uid, body.request_id, sid)
    return {"id": sid, "status": "pending", "duplicate": False}


def _view(conn, row, editor: bool = False) -> dict:
    case = repo.case_for_submission(conn, row)
    if case and case["status"] == "published":
        display = "published"
    elif row["status"] in ("rejected", "archived"):
        display = "rejected"
    elif row["status"] == "needs_more":
        display = "needs_more"
    elif row["status"] == "accepted" or case:
        display = "producing"
    else:
        display = "received"
    review = repo.review(conn, row["id"])
    result = {
        "id": row["id"],
        "title": row["title"],
        "symptom": row["symptom"],
        "resolution": row["resolution"],
        "keyError": row["key_error"],
        "timeline": row["timeline"],
        "lessons": db.jload(row["lessons"], []),
        "stackTags": db.jload(row["stack_tags"], []),
        "domainHint": row["domain_hint"],
        "status": row["status"],
        "displayStatus": display,
        "reviewNote": row["review_note"],
        "createdAt": row["created_at"],
        "author": row["author"],
        "caseId": case["id"] if case else None,
        "playPath": "/pages/play/play?id=" + case["id"] if display == "published" else None,
        "articlePath": "/solutions/a-" + case["id"] if display == "published" else None,
        "linkedCaseId": row["linked_case_id"],
        "parentSubmissionId": row["parent_submission_id"],
        "materialVersion": review["material_version"],
        "materialCurrent": review["material_version"] > 0
        and review["material_source_revision"] == review["source_revision"],
        "materialConfirmed": review["material_version"] > 0
        and review["confirmed_version"] == review["material_version"]
        and review["material_source_revision"] == review["source_revision"],
        "material": db.jload(review["material"], None),
        "messages": [dict(message) for message in repo.messages(conn, row["id"], editor)],
    }
    if editor:
        result["review"] = dict(review)
    return result


def my_submissions(uid: str) -> list[dict]:
    with db.tx() as conn:
        return [_view(conn, row) for row in repo.list_rows(conn, uid=uid)]


def submission_detail(uid: str, sid: str, editor: bool = False) -> dict:
    with db.tx() as conn:
        row = repo.get(conn, sid)
        if row is None:
            raise HTTPException(404, "投稿不存在")
        if not editor and row["user_id"] != uid:
            raise HTTPException(403, "只能查看自己的投稿")
        return _view(conn, row, editor)


def admin_list(status: str | None = None) -> list[dict]:
    with db.tx() as conn:
        return [_view(conn, row, True) for row in repo.list_rows(conn, status=status)]


def set_status(sid: str, status: str, review_note: str, operator: str) -> dict:
    with db.tx() as conn:
        if repo.get(conn, sid, lock=True) is None:
            raise HTTPException(404, "投稿不存在")
        repo.set_status(conn, sid, status, review_note)
        if review_note:
            repo.add_message(conn, sid, operator, "author", "feedback", review_note)
    return {"id": sid, "status": status}


def similar(query: str, sid: str = "", editor: bool = False) -> list[dict]:
    with db.tx() as conn:
        return matching.candidates(conn, query, sid, editor)


def draft_skeleton_from_submission(sid: str) -> dict:
    from features.submissions.skeleton import skeleton

    material = authorized_draft_source(sid)
    return skeleton(sid, material)


def create_draft_with_payload(uid: str, sid: str, payload: dict, *, source_material: dict) -> dict:
    with db.tx() as conn:
        case = repo.existing_case(conn, payload["id"], lock=True)
        if case and case["status"] != "draft":
            raise HTTPException(409, "该案例已发布：不能经转稿覆盖，请走重新发布流程")
    require_publication_review(sid)
    with db.tx() as conn:
        source = repo.get(conn, sid, lock=True)
        from features.submissions.models import DraftMaterial
        from features.submissions.review import _authorized

        current_material = _authorized(conn, sid)
        if matching.fingerprint(current_material) != matching.fingerprint(
            DraftMaterial.model_validate(source_material)
        ):
            raise HTTPException(409, "起草期间素材已变化，请根据新授权版本重新起草")
        if source["linked_case_id"] or source["parent_submission_id"]:
            raise HTTPException(409, "该稿为补证贡献，不能重复创建关卡")
        case = repo.existing_case(conn, payload["id"], lock=True)
        if case and case["status"] != "draft":
            raise HTTPException(409, "该案例已发布，不能经转稿覆盖")
        repo.save_draft(conn, uid, sid, payload)
    return {"caseId": payload["id"], "submissionId": sid, "status": "draft"}


def create_draft_from_submission(uid: str, sid: str) -> dict:
    from features.submissions.skeleton import skeleton

    material = authorized_draft_source(sid)
    return create_draft_with_payload(uid, sid, skeleton(sid, material), source_material=material)


def editor_candidates(sid: str) -> list[dict]:
    with db.tx() as conn:
        source = repo.get(conn, sid)
        if source is None:
            raise HTTPException(404, "投稿不存在")
        return matching.for_submission(conn, source)


def contributors_for_case(cid: str) -> list[dict]:
    """公开署名：已发布主要来源与已确认有效补证，不公开私密原稿。"""
    with db.tx() as conn:
        return [
            {"authorId": row["user_id"], "author": row["author"], "role": row["role"]}
            for row in repo.contributors(conn, cid)
        ]
