"""AI 客户端：LangChain 模型 I/O 层（模型调用），编排逻辑在 service（纯节点）。

演进路径：service 函数按「纯节点」设计（retrieve/generate/critique 各自独立、无隐藏状态），
将来引入 LangGraph 时把现有函数包成图节点即可，零返工。检索层自研（SQLite+余弦），
LangChain 只负责模型 I/O——132 案例量级上 VectorStore 抽象是负资产。

供应商：对话/起草 = DeepSeek（deepseek-chat，OpenAI 兼容端点）；
向量化 = 本地字符 bigram 哈希向量（默认，零依赖零 API 费）或智谱 embedding-3（EMBED_PROVIDER=zhipu）。
"""
import hashlib
import math
from functools import lru_cache

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

import core.config as config

_LOCAL_DIM = 512


def available() -> bool:
    """是否具备对话/起草能力（DEEPSEEK_API_KEY 已配置）。"""
    return len(config.DEEPSEEK_API_KEY) > 0


@lru_cache(maxsize=1)
def chat_model():
    """DeepSeek 聊天模型（OpenAI 兼容端点）。"""
    return ChatOpenAI(
        model=config.AI_CHAT_MODEL,
        base_url=config.AI_BASE_URL,
        api_key=config.DEEPSEEK_API_KEY,
        temperature=0.3,
        timeout=60,
    )


# ─────────────── 向量化：本地字符 bigram（默认） ───────────────

def _local_vec(text: str) -> list[float]:
    """字符 bigram + 词元 哈希到固定维空间，L2 归一化——中文短文本检索够用。"""
    vec = [0.0] * _LOCAL_DIM
    t = text.lower()
    grams = [t[i:i + 2] for i in range(len(t) - 1)] + t.split()
    for g in grams:
        h = int(hashlib.md5(g.encode("utf-8")).hexdigest()[:8], 16)
        vec[h % _LOCAL_DIM] += 1.0
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


class LocalEmbeddings:
    """内置向量化器：与 LangChain Embeddings 接口同形（embed_documents/embed_query）。"""

    model = "local-charbigram-512"

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._one(t) for t in texts]

    def embed_query(self, q: str) -> list[float]:
        return self._one(q)

    def _one(self, t: str) -> list[float]:
        return _local_vec(t)


# ─────────────── 向量化：智谱 embedding-3（可选） ───────────────

class ZhipuEmbeddings:
    model = "zhipu-" + config.GLM_EMBED_MODEL

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return OpenAIEmbeddings(
            model=config.GLM_EMBED_MODEL,
            base_url=config.ZHIPU_BASE_URL,
            api_key=config.ZHIPU_API_KEY,
            dimensions=config.GLM_EMBED_DIM,
            check_embedding_ctx_length=False,
            timeout=30,
        ).embed_documents(texts)

    def embed_query(self, q: str) -> list[float]:
        return self.embed_documents([q])[0]


def embed_available() -> bool:
    """向量供应商是否就绪（local 恒真；zhipu 需 key）。"""
    return config.EMBED_PROVIDER != "zhipu" or len(config.ZHIPU_API_KEY) > 0


@lru_cache(maxsize=1)
def embeddings_model():
    """按 EMBED_PROVIDER 返回向量器实例。"""
    if config.EMBED_PROVIDER == "zhipu":
        return ZhipuEmbeddings()
    return LocalEmbeddings()


def embeddings_model_name() -> str:
    return embeddings_model().model
