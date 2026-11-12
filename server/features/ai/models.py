"""ai_index 模型：RAG 索引与 AI 请求的载荷。"""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    conversation_id: str | None = Field(default=None, max_length=36, alias="conversationId")


class ReindexBody(BaseModel):
    force: bool = False
