"""ai 路由：RAG 检索/对话与会话历史（登录）、索引重建与 AI 起草（editor/admin）。"""

import json
import logging
from collections.abc import Generator

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from core.deps import current_user, require_editor
from features.ai import models, service, usage

logger = logging.getLogger("server")

router = APIRouter(tags=["ai"])


def _sse_frames(events: Generator[dict], uid: str, conversation_id: str | None) -> Generator[str]:
    """service 事件 dict → SSE 帧（`event: <type>\\ndata: <去 type 键的 json>\\n\\n`）。

    chat_stream 内部的检索/上文读取在其 try 块之外，异常会裸抛出生成器：此处兜底转
    error 帧（固定文案，不泄露细节）后终止。不捕 GeneratorExit/BaseException——
    客户端断开沿生成器链原样传播，由 service 层 finally 审计收尾。
    """
    try:
        for ev in events:
            data = json.dumps({k: v for k, v in ev.items() if k != "type"}, ensure_ascii=False)
            yield f"event: {ev['type']}\ndata: {data}\n\n"
    except Exception:
        logger.warning("[ai-chat] 流式应答异常 uid=%s conversation=%s", uid, conversation_id, exc_info=True)
        payload = json.dumps({"error": "服务暂时不可用，请稍后再试", "aiAvailable": True}, ensure_ascii=False)
        yield f"event: error\ndata: {payload}\n\n"


@router.post("/api/ai/chat")
def ai_chat(body: models.ChatRequest, uid: str = Depends(current_user)):
    question = body.question.strip()
    # 会话属主校验（404）必须在 SSE 首字节前完成，保持 HTTP 状态码语义
    service.chat_validate(question, uid, body.conversation_id)
    return StreamingResponse(
        _sse_frames(service.chat_stream(question, uid, body.conversation_id), uid, body.conversation_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/api/ai/conversations")
def ai_conversations(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    uid: str = Depends(current_user),
):
    return service.list_conversations(uid, limit, offset)


@router.get("/api/ai/conversations/{cid}")
def ai_conversation_detail(cid: str, uid: str = Depends(current_user)):
    return service.conversation_detail(cid, uid)


@router.delete("/api/ai/conversations/{cid}")
def ai_conversation_delete(cid: str, uid: str = Depends(current_user)):
    return service.delete_conversation(cid, uid)


@router.get("/api/ai/search")
def ai_search(q: str, k: int = 4, uid: str = Depends(current_user)):
    return {"results": service.node_retrieve(q.strip(), k=k)}


@router.post("/api/admin/ai/reindex")
def ai_reindex(body: models.ReindexBody | None = None, uid: str = Depends(current_user)):
    require_editor(uid)
    return service.reindex_all()


@router.post("/api/admin/ai/index-tasks/run")
def ai_index_tasks(uid: str = Depends(current_user)):
    require_editor(uid)
    return service.process_index_tasks()


@router.get("/api/admin/ai/usage/users")
def ai_usage_top_users(days: int = 30, uid: str = Depends(current_user)):
    require_editor(uid)
    return {"items": usage.top_users(days)}


@router.get("/api/admin/ai/usage")
def ai_usage_summary(days: int = 30, uid: str = Depends(current_user)):
    require_editor(uid)
    return usage.daily_summary(days)
