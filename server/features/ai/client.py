"""AI 客户端：LangChain 模型 I/O 层（模型调用），编排逻辑在 service（纯节点）。

演进路径：service 函数按「纯节点」设计（retrieve/generate/critique 各自独立、无隐藏状态），
将来引入 LangGraph 时把现有函数包成图节点即可，零返工。检索层自研（SQLite+余弦），
LangChain 只负责模型 I/O——132 案例量级上 VectorStore 抽象是负资产。

供应商分工：
- 对话/起草 = DeepSeek（deepseek-chat，OpenAI 兼容端点，DEEPSEEK_API_KEY）
- 向量化 = fastembed 本地 BGE-M3（默认，ONNX CPU 推理）/ 智谱 embedding-3 / 内置字符 bigram 兜底
  （DeepSeek 无 embedding 端点，向量与生成按业界惯例分开选型）
"""
import hashlib
import math
from functools import lru_cache

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

import core.config as config


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


# ─────────────── 向量化：fastembed BGE-M3（默认） ───────────────

class FastEmbedEmbeddings:
    """fastembed 本地 ONNX 推理（与 LangChain Embeddings 接口同形）。"""

    model = config.EMBED_MODEL

    def __init__(self):
        from fastembed import TextEmbedding
        kwargs = {}
        if config.FASTEMBED_CACHE_DIR:
            kwargs["cache_dir"] = config.FASTEMBED_CACHE_DIR
        self._model = TextEmbedding(model_name=config.EMBED_MODEL, **kwargs)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [[float(x) for x in vec] for vec in self._model.embed(texts)]

    def embed_query(self, q: str) -> list[float]:
        return [float(x) for x in next(self._model.query_embed(q))]


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


# ─────────────── 向量化：内置字符 bigram（零资源兜底） ───────────────

def _local_vec(text: str) -> list[float]:
    """字符 bigram + 词元 哈希到固定维空间，L2 归一化——中文短文本检索兜底。"""
    vec = [0.0] * 512
    t = text.lower()
    grams = [t[i:i + 2] for i in range(len(t) - 1)] + t.split()
    for g in grams:
        h = int(hashlib.md5(g.encode("utf-8")).hexdigest()[:8], 16)
        vec[h % 512] += 1.0
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


class LocalEmbeddings:
    model = "local-charbigram-512"

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [_local_vec(t) for t in texts]

    def embed_query(self, q: str) -> list[float]:
        return _local_vec(q)


def embed_available() -> bool:
    """向量供应商是否就绪（fastembed/local 恒真；zhipu 需 key）。"""
    if config.EMBED_PROVIDER == "zhipu":
        return len(config.ZHIPU_API_KEY) > 0
    return True


@lru_cache(maxsize=1)
def embeddings_model():
    """按 EMBED_PROVIDER 返回向量器实例（fastembed 首次加载会下载模型文件）。"""
    if config.EMBED_PROVIDER == "zhipu":
        return ZhipuEmbeddings()
    if config.EMBED_PROVIDER == "local":
        return LocalEmbeddings()
    return FastEmbedEmbeddings()


def embeddings_model_name() -> str:
    return embeddings_model().model
