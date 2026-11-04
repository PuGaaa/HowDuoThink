"""编审与脱敏授权：作者可见反馈、私密审阅和原稿分别保存。"""

from typing import Any

from fastapi import HTTPException

import db
from features.submissions import matching, repo
from features.submissions.models import (
    ConsentBody,
    DraftMaterial,
    MaterialBody,
    PublicationSource,
    ReviewBody,
    SupplementBody,
)


def _submission(conn: Any, sid: str, uid: str | None = None) -> Any:
    row = repo.get(conn, sid, lock=True)
    if row is None:
        raise HTTPException(404, "投稿不存在")
    if uid is not None and row["user_id"] != uid:
        raise HTTPException(403, "只能查看和补充自己的投稿")
    return row


def add_supplement(uid: str, sid: str, body: SupplementBody) -> dict:
    with db.tx() as conn:
        _submission(conn, sid, uid)
        repo.add_message(conn, sid, uid, "author", "supplement", body.text)
        repo.supplement(conn, sid)
    return {"ok": True}


def save_material(uid: str, sid: str, body: MaterialBody) -> dict:
    with db.tx() as conn:
        _submission(conn, sid)
        material = body.material.model_dump_json(by_alias=True)
        repo.save_material(conn, sid, material)
        review = repo.review(conn, sid)
        repo.add_message(
            conn,
            sid,
            uid,
            "internal",
            "material",
            db.jdump({"version": review["material_version"], "material": body.material.model_dump(by_alias=True)}),
        )
        repo.add_message(conn, sid, uid, "author", "feedback", "编辑已整理脱敏素材，请核对内容与公开范围并确认。")
    return {"version": review["material_version"]}


def confirm_material(uid: str, sid: str, body: ConsentBody) -> dict:
    with db.tx() as conn:
        _submission(conn, sid, uid)
        review = repo.review(conn, sid)
        if (
            body.version != review["material_version"]
            or review["material_source_revision"] != review["source_revision"]
        ):
            raise HTTPException(409, "素材已变化，请查看当前脱敏版本后确认")
        repo.confirm_material(conn, sid, body.version)
        repo.add_message(conn, sid, uid, "author", "consent", f"已确认第{body.version}版脱敏素材的公开范围。")
    return {"ok": True}


def save_review(uid: str, sid: str, body: ReviewBody) -> dict:
    with db.tx() as conn:
        source = _submission(conn, sid)
        if body.decision == "distinct" and (source["linked_case_id"] or source["parent_submission_id"]):
            raise HTTPException(409, "已接受的补证关系继续保留，不能把同一原稿再制作独立关卡")
        if body.decision != "merge" and (body.linked_case_id or body.parent_submission_id):
            raise HTTPException(422, "只有补证合并可关联主案例或母投稿")
        if body.decision == "merge":
            if repo.has_dependents(conn, sid):
                raise HTTPException(409, "已有补证稿关联此母投稿，请在此母稿制作主案例，不能再改挂其他来源")
            authorization = repo.review(conn, sid)
            if (
                not authorization["material"]
                or authorization["confirmed_version"] != authorization["material_version"]
                or authorization["material_source_revision"] != authorization["source_revision"]
            ):
                raise HTTPException(409, "补证贡献需先确认当前脱敏素材的公开范围")
            if (body.linked_case_id is None) == (body.parent_submission_id is None):
                raise HTTPException(422, "补证合并需选择一个主案例或母投稿")
            if body.linked_case_id and repo.existing_case(conn, body.linked_case_id) is None:
                raise HTTPException(404, "主案例不存在")
            if body.parent_submission_id:
                parent = _submission(conn, body.parent_submission_id)
                if parent["id"] == sid or parent["parent_submission_id"] or parent["linked_case_id"]:
                    raise HTTPException(409, "请选择独立母投稿，不能形成循环关联")
        current = matching.for_submission(conn, source)
        pending = {item["key"] for item in current}
        if not pending <= set(body.candidate_ids):
            raise HTTPException(409, "存在未复核的相似候选，请刷新候选并记录人工裁定")
        if body.decision == "merge":
            own_case = repo.owned_case(conn, sid)
            if own_case and own_case["status"] == "published":
                raise HTTPException(409, "来源案例已正式发布，不能改挂来源，请走案例纠错流程")
            if own_case and own_case["status"] == "draft":
                repo.archive_draft(conn, own_case["id"])
                repo.add_message(
                    conn,
                    sid,
                    uid,
                    "internal",
                    "draft_archived",
                    db.jdump({"caseId": own_case["id"], "reason": "人工裁定为主案例补证，保留草稿内容"}),
                )
        repo.save_review(conn, sid, uid, body)
        repo.add_message(conn, sid, uid, "internal", "review", body.model_dump_json(by_alias=True))
        if body.public_note:
            repo.add_message(conn, sid, uid, "author", "feedback", body.public_note)
        if body.internal_note:
            repo.add_message(conn, sid, uid, "internal", "note", body.internal_note)
    return {"ok": True, "decision": body.decision}


def _authorized(conn: Any, sid: str) -> DraftMaterial:
    source = _submission(conn, sid)
    if source["status"] in ("archived", "rejected") or source["linked_case_id"] or source["parent_submission_id"]:
        raise HTTPException(409, "该稿已归档、未采用或已作为补证，不能再起草独立案例")
    review = repo.review(conn, sid)
    if (
        not review["material"]
        or review["material_source_revision"] != review["source_revision"]
        or review["confirmed_version"] != review["material_version"]
    ):
        raise HTTPException(409, "当前脱敏素材尚未获得作者确认，不能转稿或发送给AI")
    if review["decision"] != "distinct" or review["reviewed_material_version"] != review["material_version"]:
        raise HTTPException(409, "请先完成人工查重与机制、证据、推理差异裁定")
    return DraftMaterial.model_validate_json(review["material"])


def authorized_draft_source(sid: str) -> dict:
    """跨feature公开接口：只返回作者确认的脱敏素材，不含原稿或内部审阅。"""
    with db.tx() as conn:
        material = _authorized(conn, sid)
        _reviewed_candidates(conn, sid)
        return material.model_dump(by_alias=True)


def _reviewed_candidates(conn: Any, sid: str) -> None:
    review = repo.review(conn, sid)
    source = repo.get(conn, sid)
    candidates = matching.for_submission(conn, source)
    if not {item["key"] for item in candidates} <= set(db.jload(review["candidate_ids"], [])):
        raise HTTPException(409, "制作期间出现新的相似候选，请发布前重新复核")


def validate_publication(conn: Any, sid: str) -> PublicationSource:
    """在调用方既有事务中锁定投稿/编审；调用方随后才锁案例并完成发布。"""
    _authorized(conn, sid)
    _reviewed_candidates(conn, sid)
    source = repo.get(conn, sid)
    review = repo.review(conn, sid)
    return PublicationSource(
        submission_id=sid,
        author_name=source["author_name"],
        author_login=source["author"],
        material_version=review["material_version"],
    )


def require_publication_review(sid: str) -> None:
    with db.tx() as conn:
        validate_publication(conn, sid)
