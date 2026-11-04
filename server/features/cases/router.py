"""cases 路由：草稿保存、元数据更新、发布（editor）。"""

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from core.deps import current_user, require_editor
from features.cases import preview, service
from features.cases.models import CaseDraftBody, CaseMetaBody, CasePayload

router = APIRouter(tags=["cases"])


class PreviewBody(BaseModel):
    payload: dict


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


@router.post("/api/admin/cases/{cid}/preview")
def create_case_preview(cid: str, body: PreviewBody, uid: str = Depends(current_user)):
    require_editor(uid)
    return preview.create(uid, cid, body.payload)


@router.get("/api/previews/{preview_id}")
def get_case_preview(preview_id: str, authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "预览凭证无效")
    return preview.read(preview_id, authorization[7:].strip())


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
