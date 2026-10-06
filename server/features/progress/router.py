"""progress 路由：进度云同步（Bearer/cookie 均可）。"""
from fastapi import APIRouter, Depends

from core.deps import current_user
from features.progress import service
from features.progress.models import ProgressBlob

router = APIRouter(tags=["progress"])


@router.get("/api/me/progress")
def get_progress(uid: str = Depends(current_user)):
    return service.get_progress(uid)


@router.post("/api/me/progress")
def put_progress(body: ProgressBlob, uid: str = Depends(current_user)):
    return service.put_progress(uid, body.model_dump(by_alias=True))
