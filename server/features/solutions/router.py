"""solutions 路由：解决逻辑列表与详情（公开只读）。"""

from fastapi import APIRouter, Query

from features.solutions import service

router = APIRouter(tags=["solutions"])


@router.get("/api/solutions")
def solutions(layer: str | None = None, page: int = Query(default=1, ge=1), size: int = Query(default=20, ge=1, le=50)):
    return service.list_solutions(layer, page, size)


@router.get("/api/solutions/{article_id}")
def solution_detail(article_id: str):
    return service.solution_detail(article_id)
