"""AI 客户端：LangChain 模型 I/O 层（模型调用），编排逻辑在 service（纯节点）。

演进路径：service 函数按「纯节点」设计（retrieve/generate/critique 各自独立、无隐藏状态），
将来引入 LangGraph 时把现有函数包成图节点即可，零返工。检索层自研（SQLite+余弦），
LangChain 只负责模型 I/O——132 案例量级上 VectorStore 抽象是负资产。

供应商分工：
- 对话/起草 = DeepSeek（deepseek-chat，OpenAI 兼容端点，DEEPSEEK_API_KEY）
- 对话思维链 = DeepSeek（deepseek-reasoner，同端点同 key，OpenAI SDK 直连——
  langchain-openai 1.7.3 会丢弃 delta.reasoning_content，LangChain 侧拿不到思维链，见 reasoner_stream）
- 向量化 = fastembed 本地 BGE-M3（默认，ONNX CPU 推理）/ 智谱 embedding-3 / 内置字符 bigram 兜底
  （DeepSeek 无 embedding 端点，向量与生成按业界惯例分开选型）
"""

import hashlib
import math
import os
import tempfile
from collections.abc import Generator
from functools import lru_cache
from pathlib import Path

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

import core.config as config


def available() -> bool:
    """是否具备对话/起草能力（DEEPSEEK_API_KEY 已配置）。"""
    return len(config.DEEPSEEK_API_KEY) > 0


def _fastembed_cache_dir() -> Path:
    """fastembed 实际使用的缓存目录（对齐其自身解析顺序：显式配置 > FASTEMBED_CACHE_PATH > 系统临时目录）。"""
    if config.FASTEMBED_CACHE_DIR:
        return Path(config.FASTEMBED_CACHE_DIR)
    env_dir = os.environ.get("FASTEMBED_CACHE_PATH")
    if env_dir:
        return Path(env_dir)
    return Path(tempfile.gettempdir()) / "fastembed_cache"


def _fastembed_hf_repo() -> str | None:
    """EMBED_MODEL 在 fastembed 模型表里的真实 HF 源仓库（静态表，离线可查）。

    不能按 EMBED_MODEL 字面量拼缓存目录名：如 bge-small-zh-v1.5 字面量是 BAAI/...，
    实际源是 Qdrant/...——缓存目录 models--<源仓库> 只跟源走。惰性导入避免启动加载 onnxruntime。
    """
    from fastembed.text.text_embedding import TextEmbedding

    for desc in TextEmbedding.list_supported_models():
        if desc["model"] == config.EMBED_MODEL:
            return (desc.get("sources") or {}).get("hf")
    return None


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


# ─────────────── 对话思维链：deepseek-reasoner（OpenAI SDK 直连） ───────────────

_REASONER_TIMEOUT = 300  # 容纳推理长思考（秒），与原 reasoner_model 契约一致
_REASONER_TEMPERATURE = 0.3
_ROLE_MAP = {"system": "system", "human": "user", "ai": "assistant"}  # LangChain 角色名 → OpenAI 角色名


@lru_cache(maxsize=1)
def _reasoner_client():
    """DeepSeek 直连客户端（OpenAI SDK，同 AI_BASE_URL / DEEPSEEK_API_KEY）。

    key 未配置时以占位串构造——openai SDK 在构造期即校验 key 非空，而调用方一律先过
    available() 门，占位串永远不真正发起请求；dev/prod 配置真实 key 时原值直传。
    """
    from openai import OpenAI

    return OpenAI(
        base_url=config.AI_BASE_URL,
        api_key=config.DEEPSEEK_API_KEY or "unset-deepseek-key",
        timeout=_REASONER_TIMEOUT,
    )


def reasoner_stream(messages: list[tuple[str, str]]) -> Generator[dict]:
    """推理模型流式适配器：LangChain 消息元组 → OpenAI SDK 直连 → 统一事件 dict。

    LangChain 不透传 reasoning_content：langchain-openai 1.7.3 的 ChatOpenAI().stream() 会丢弃
    delta.reasoning_content（additional_kwargs 全空），思维链只有裸 SDK 能拿到——此为本适配器存在理由。
    事件 dict 键互斥、逐 chunk 产出：
    - {"reasoning": <delta>}  思维链增量（delta.reasoning_content）
    - {"content": <delta>}    答案增量（delta.content）
    - {"usage": {"prompt_tokens": N, "completion_tokens": M}}  用量包（stream_options.include_usage，
      DeepSeek 末包无 choices 仅带 usage；审计不丢，取代原 ChatOpenAI stream_usage=True）
    """
    payload = [{"role": _ROLE_MAP[role], "content": content} for role, content in messages]
    stream = _reasoner_client().chat.completions.create(
        model=config.AI_REASONER_MODEL,
        messages=payload,
        temperature=_REASONER_TEMPERATURE,
        stream=True,
        stream_options={"include_usage": True},
    )
    for chunk in stream:
        usage = getattr(chunk, "usage", None)
        if usage:
            yield {
                "usage": {
                    "prompt_tokens": int(usage.prompt_tokens or 0),
                    "completion_tokens": int(usage.completion_tokens or 0),
                }
            }
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        reasoning = getattr(delta, "reasoning_content", None)
        if reasoning:
            yield {"reasoning": reasoning}
        content = getattr(delta, "content", None)
        if content:
            yield {"content": content}


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
    grams = [t[i : i + 2] for i in range(len(t) - 1)] + t.split()
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
    """向量供应商是否就绪（fastembed 要求模型已在本地缓存，缓存缺失→检索走 LIKE 降级；
    local 恒真；zhipu 需 key）。判定门 = fastembed 离线加载的同一文件：
    缓存目录下 models--<HF源仓库>/files_metadata.json；运行时禁止外网下载
    （生产服务器直连 HF 不通，首用下载会挂 50~60s 后抛异常 → search 500 / chat 504，
    2026-11-15 事故）。"""
    if config.EMBED_PROVIDER == "zhipu":
        return len(config.ZHIPU_API_KEY) > 0
    if config.EMBED_PROVIDER == "fastembed":
        repo = _fastembed_hf_repo()
        if not repo:
            return False
        metadata = _fastembed_cache_dir() / ("models--" + repo.replace("/", "--")) / "files_metadata.json"
        return metadata.is_file()
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
