"""solutions 域：articles 表的 Web 展示（只读）。"""

from fastapi import HTTPException

import db
from features.solutions.models import ArticleOut, ProblemOut, StepOut


def article_view(r) -> dict:
    steps = [
        StepOut(no=i + 1, observe=s["observe"], act=s["act"], found=s["found"])
        for i, s in enumerate(db.jload(r["steps"], []))
    ]
    detail = db.jload(r["detail"], None)
    problem = ProblemOut(**detail["problem"]) if detail else None
    root_cause = detail["root_cause"] if detail else None
    principles = detail["principles"] if detail else []
    return ArticleOut(
        id=r["id"],
        title=r["title"],
        layer=r["layer"],
        domain=r["domain"],
        steps=steps,
        lessons=db.jload(r["lessons"], []),
        author=r["author"],
        published_at=r["published_at"],
        problem=problem,
        root_cause=root_cause,
        principles=principles,
    ).model_dump(by_alias=True)


def list_solutions(domain: str | None, page: int, size: int) -> dict:
    """domain 是六个枚举分类（network/data/build/runtime/deploy/concurrency）；
    layer 存的是每案例一句的经验文案，只做展示不做过滤。"""
    where, params = "1=1", []
    if domain:
        where, params = "domain=?", [domain]
    rows = db.q(
        # id 作 tiebreaker：published_at 是秒级时间戳，同秒批量种入时全并列，
        # 各页 OFFSET 窗口会因并列排序不稳定而跨页重复/漏行——必须构成全序
        f"SELECT * FROM articles WHERE {where} ORDER BY published_at DESC, id LIMIT ? OFFSET ?",
        tuple(params) + (size, (page - 1) * size),
    )
    total = db.q(f"SELECT COUNT(*) AS n FROM articles WHERE {where}", tuple(params))[0]["n"]
    return {"total": total, "items": [article_view(r) for r in rows]}


def solution_detail(article_id: str) -> dict:
    rows = db.q("SELECT * FROM articles WHERE id=?", (article_id,))
    if not rows:
        raise HTTPException(404, "不存在")
    return article_view(rows[0])
