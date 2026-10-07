"""ai 路由：RAG 检索/对话（登录）、索引重建与 AI 起草（editor/admin）。"""
from fastapi import APIRouter, Depends

from core.deps import current_user, require_editor
from features.ai import models, service

router = APIRouter(tags=["ai"])


@router.post("/api/ai/chat")
def ai_chat(body: models.ChatRequest, uid: str = Depends(current_user)):
    return service.chat(body.question.strip(), uid)


@router.get("/api/ai/search")
def ai_search(q: str, k: int = 4, uid: str = Depends(current_user)):
    return {"results": service.node_retrieve(q.strip(), k=k)}


@router.post("/api/admin/ai/reindex")
def ai_reindex(body: models.ReindexBody | None = None, uid: str = Depends(current_user)):
    require_editor(uid)
    return service.reindex_all()
