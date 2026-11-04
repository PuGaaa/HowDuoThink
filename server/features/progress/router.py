"""progress 路由：进度读取（Bearer/cookie 均可）。旧覆盖写已停用。"""

from fastapi import APIRouter, Depends, HTTPException

from core.deps import current_user
from features.progress import service
from features.progress.models import ProgressBlob, ProgressSyncBody

router = APIRouter(tags=["progress"])


@router.get("/api/me/progress")
def get_progress(uid: str = Depends(current_user)):
    return service.get_progress(uid)


@router.post("/api/me/progress")
def put_progress(body: ProgressBlob, uid: str = Depends(current_user)):
    from features.stats import service as stats_service

    stats_service.touch(uid)
    raise HTTPException(426, "旧版全量进度写入已停用，请升级客户端")


@router.post("/api/me/progress/sync")
def sync_progress(body: ProgressSyncBody, uid: str = Depends(current_user)):
    return service.sync_operations(uid, body.operations)
