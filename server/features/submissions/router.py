"""submissions 路由：投稿、我的投稿、管理端审核与转草稿。"""

from fastapi import APIRouter, Depends, HTTPException

from core.deps import current_user, require_editor
from features.submissions import models, service

router = APIRouter(tags=["submissions"])


@router.post("/api/submissions", response_model=models.SubmissionReceipt)
def create_submission(body: models.SubmissionCreate, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    return service.create_submission(uid, body)


@router.get("/api/me/submissions", response_model=list[models.SubmissionView])
def my_submissions(uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    return service.my_submissions(uid)


@router.get("/api/admin/submissions", response_model=list[models.AdminSubmissionView])
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
    return service.set_status(sid, body.status, body.review_note, uid)


@router.post("/api/admin/submissions/{sid}/draft")
def create_draft_from_submission(sid: str, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return service.create_draft_from_submission(uid, sid)


@router.post("/api/admin/submissions/{sid}/ai-draft")
def ai_draft_from_submission(sid: str, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    from features.ai import service as ai_service

    try:
        return ai_service.ai_draft_from_submission(uid, sid)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/api/submissions/similar", response_model=models.SimilarResult)
def public_similar(q: str, uid: str = Depends(current_user)):
    return {"items": service.similar(q)}


@router.get("/api/me/submissions/{sid}", response_model=models.SubmissionView)
def own_submission_detail(sid: str, uid: str = Depends(current_user)):
    return service.submission_detail(uid, sid)


@router.post("/api/me/submissions/{sid}/supplements")
def add_supplement(sid: str, body: models.SupplementBody, uid: str = Depends(current_user)):
    return service.add_supplement(uid, sid, body)


@router.post("/api/me/submissions/{sid}/consent")
def confirm_material(sid: str, body: models.ConsentBody, uid: str = Depends(current_user)):
    return service.confirm_material(uid, sid, body)


@router.get("/api/admin/submissions/{sid}", response_model=models.AdminSubmissionView)
def admin_submission_detail(sid: str, uid: str = Depends(current_user)):
    require_editor(uid)
    return service.submission_detail(uid, sid, editor=True)


@router.get("/api/admin/submissions/{sid}/similar", response_model=models.SimilarResult)
def editor_similar(sid: str, uid: str = Depends(current_user)):
    require_editor(uid)
    return {"items": service.editor_candidates(sid)}


@router.put("/api/admin/submissions/{sid}/material")
def save_material(sid: str, body: models.MaterialBody, uid: str = Depends(current_user)):
    require_editor(uid)
    return service.save_material(uid, sid, body)


@router.post("/api/admin/submissions/{sid}/review")
def review_submission(sid: str, body: models.ReviewBody, uid: str = Depends(current_user)):
    require_editor(uid)
    return service.save_review(uid, sid, body)


@router.get("/api/submissions/contributors/{cid}", response_model=models.ContributorsResult)
def case_contributors(cid: str):
    return {"items": service.contributors_for_case(cid)}
