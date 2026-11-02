"""sync 路由：App 端 casepack 增量同步（公开只读，经 cases.service 取数）。"""

from fastapi import APIRouter, Query

from features.cases import service as cases_service

router = APIRouter(tags=["sync"])


@router.get("/api/casepack")
def casepack(since: int = Query(default=0, ge=0)):
    version, cases = cases_service.published_after(since)
    return {"version": version, "count": len(cases), "cases": cases}
