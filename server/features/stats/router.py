"""stats 路由：运营数据看板（editor/admin）。"""
from fastapi import APIRouter, Depends

from core.deps import current_user, require_editor
from features.stats import service

router = APIRouter(tags=["stats"])


@router.get("/api/admin/stats/overview")
def stats_overview(days: int = 30, uid: str = Depends(current_user)):
    require_editor(uid)
    return service.overview(days)
