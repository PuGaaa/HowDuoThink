"""cases 路由：草稿保存、元数据更新、发布（editor）。"""

from fastapi import APIRouter, Depends, HTTPException

from core.deps import current_user, require_editor
from features.cases import service
from features.cases.models import CaseDraftBody, CaseMetaBody, CasePayload

router = APIRouter(tags=["cases"])


@router.get("/api/admin/cases")
def admin_cases(uid: str = Depends(current_user), status: str | None = None):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return service.list_admin_cases(status)


@router.get("/api/admin/cases/{cid}")
def admin_case_detail(cid: str, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return service.admin_case_detail(cid)


@router.post("/api/admin/cases")
def save_case_draft(body: CaseDraftBody, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return service.save_case_draft(uid, body)


@router.patch("/api/admin/cases/{cid}/meta")
def update_case_meta(cid: str, body: CaseMetaBody, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return service.update_case_meta(cid, body)


@router.post("/api/cases")
def publish_case(payload: CasePayload, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return service.publish_case(uid, payload)
