"""docs 路由：应用文档（隐私政策等）——客户端公开只读 + 管理端编辑。"""

from fastapi import APIRouter, Depends, HTTPException

from core.deps import current_user, require_admin
from features.docs import models, service

router = APIRouter(tags=["docs"])


def _check(doc_id: str) -> None:
    if doc_id not in service.DOCS:
        raise HTTPException(404, "Not Found")


@router.get("/api/docs/{doc_id}")
def get_doc(doc_id: str):
    _check(doc_id)
    return service.get_doc(doc_id)


@router.put("/api/admin/docs/{doc_id}")
def update_doc(doc_id: str, body: models.DocUpdateBody, uid: str = Depends(current_user)):
    _check(doc_id)
    require_admin(uid)
    service.save_doc(doc_id, body.content, uid)
    return {"ok": True}
