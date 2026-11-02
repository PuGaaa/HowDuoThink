"""ops 路由：服务健康（editor/admin）。"""

from fastapi import APIRouter, Depends

from core.deps import current_user, require_editor
from features.ops import service

router = APIRouter(tags=["ops"])


@router.get("/api/admin/ops/health")
def ops_health(uid: str = Depends(current_user)):
    require_editor(uid)
    return service.health_snapshot()
