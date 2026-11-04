"""stats 路由：运营数据看板（editor/admin）。"""

from fastapi import APIRouter, Depends

from core.deps import current_user, require_editor
from features.stats import service

router = APIRouter(tags=["stats"])


@router.get("/api/admin/stats/overview")
def stats_overview(days: int = 30, uid: str = Depends(current_user)):
    require_editor(uid)
    return service.overview(days)


@router.get("/api/admin/stats/events")
def stats_events(kind: str | None = None, limit: int = 100, uid: str = Depends(current_user)):
    require_editor(uid)
    return {"items": service.event_details(kind, limit)}


@router.get("/api/admin/stats/learning")
def stats_learning(as_of: str | None = None, uid: str = Depends(current_user)):
    require_editor(uid)
    return service.learning_metrics(as_of)
