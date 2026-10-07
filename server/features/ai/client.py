"""AI 客户端：LangChain 模型 I/O 层（模型调用），编排逻辑在 service（纯节点）。

演进路径：service 函数按「纯节点」设计（retrieve/generate/critique 各自独立、无隐藏状态），
将来引入 LangGraph 时把现有函数包成图节点即可，零返工。检索层自研（SQLite+余弦），
LangChain 只负责模型 I/O——132 案例量级上 VectorStore 抽象是负资产。
"""
from functools import lru_cache

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

import core.config as config


def available() -> bool:
    """是否具备 AI 能力（ZHIPU_API_KEY 已配置）。"""
    return len(config.ZHIPU_API_KEY) > 0


@lru_cache(maxsize=1)
def chat_model():
    """GLM 聊天模型（智谱 OpenAI 兼容端点）。"""
    return ChatOpenAI(
        model=config.GLM_MODEL,
        base_url=config.AI_BASE_URL,
        api_key=config.ZHIPU_API_KEY,
        temperature=0.3,
        timeout=30,
    )


@lru_cache(maxsize=1)
def embeddings_model():
    """GLM embedding 模型（1024 维）。"""
    return OpenAIEmbeddings(
        model=config.GLM_EMBED_MODEL,
        base_url=config.AI_BASE_URL,
        api_key=config.ZHIPU_API_KEY,
        dimensions=config.GLM_EMBED_DIM,
        check_embedding_ctx_length=False,
        timeout=30,
    )
