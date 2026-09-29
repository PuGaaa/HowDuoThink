"""submissions 路由：投稿、我的投稿、管理端审核与转草稿。"""
from fastapi import APIRouter, Depends, HTTPException

from core.deps import current_user, require_editor
from features.submissions import models, service

router = APIRouter(tags=["submissions"])


@router.post("/api/submissions")
def create_submission(body: models.SubmissionCreate, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    return service.create_submission(uid, body)


@router.get("/api/me/submissions")
def my_submissions(uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    return service.my_submissions(uid)


@router.get("/api/admin/submissions")
def admin_submissions(uid: str = Depends(current_user), status: str | None = None):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return service.admin_list(status)


@router.post("/api/admin/submissions/{sid}/status")
def set_submission_status(sid: str, body: models.SubmissionStatusBody, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return service.set_status(sid, body.status, body.review_note)


@router.post("/api/admin/submissions/{sid}/draft")
def create_draft_from_submission(sid: str, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return service.create_draft_from_submission(uid, sid)
