"""fastembed 本地缓存可用性判定：模型未缓存→不可用（检索毫秒级 LIKE 降级，禁止运行时外网下载），
已缓存→可用。背景：生产服务器直连 huggingface.co 不通（2026-11-15 事故），fastembed 首用运行时
下载挂 50~60s 后抛异常，search 500 / chat 504。"""

import json
import os

from fastapi.testclient import TestClient

import main

_PW = os.environ["ADMIN_PASSWORD"] + "-ai-embed"


def make_user(client, login: str, role: str = "user") -> None:
    import db
    from core import security

    db.ex(
        "INSERT INTO users(id, login, name, role, password_hash) VALUES(?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET role=excluded.role, password_hash=excluded.password_hash",
        (f"pw-{login}", login, login, role, security.hash_password(_PW)),
    )


def user_login(c, login_name: str) -> None:
    r = c.post("/api/auth/login", json={"login": login_name, "password": _PW})
    assert r.status_code == 200, r.text


def add_index_row(case_id: str, vec: list[float], content: str = "内容") -> None:
    import db

    db.ex(
        "INSERT INTO ai_index(source_type, source_id, chunk_kind, content, embedding, model) "
        "VALUES('case', ?, 'overview', ?, ?, 'fake')",
        (case_id, content, json.dumps(vec)),
    )


def _fastembed_offline(monkeypatch, tmp_path):
    """fastembed 供应商 + 空缓存目录；HF_HUB_OFFLINE 保证万一直连下载也是秒级失败不触网。"""
    monkeypatch.setattr("core.config.EMBED_PROVIDER", "fastembed")
    monkeypatch.setattr("core.config.FASTEMBED_CACHE_DIR", str(tmp_path))
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")


def test_fastembed_unavailable_when_cache_empty(monkeypatch, tmp_path):
    """缓存目录为空（模型从未下载成功）→ embed_available 必须快速判 False。"""
    from features.ai import client

    _fastembed_offline(monkeypatch, tmp_path)
    assert client.embed_available() is False


def test_fastembed_available_when_model_cached(monkeypatch, tmp_path):
    """fastembed 真实产出的缓存布局（models--<hf源仓库>/files_metadata.json）→ True。
    仓库 id 必须取自 fastembed 模型表（本模型实际源是 Qdrant/bge-small-zh-v1.5，
    不是 EMBED_MODEL 字面量的 BAAI/...——天真映射会永远判 False，静默降级 LIKE）。"""
    from fastembed.text.text_embedding import TextEmbedding

    from features.ai import client

    _fastembed_offline(monkeypatch, tmp_path)
    desc = next(d for d in TextEmbedding.list_supported_models() if d["model"] == "BAAI/bge-small-zh-v1.5")
    real_repo = desc["sources"]["hf"]
    assert real_repo != "BAAI/bge-small-zh-v1.5"  # 模型表与字面名确实不同，断言才有判别力
    meta = tmp_path / ("models--" + real_repo.replace("/", "--")) / "files_metadata.json"
    meta.parent.mkdir(parents=True)
    meta.write_text("{}", encoding="utf-8")
    assert client.embed_available() is True


def test_fastembed_unavailable_for_naive_name_mapping(monkeypatch, tmp_path):
    """按 EMBED_MODEL 字面量拼目录名（models--BAAI--...）不构成可用性——
    防回归：可用性判定必须跟随 fastembed 模型表的真实 HF 源。"""
    from features.ai import client

    _fastembed_offline(monkeypatch, tmp_path)
    meta = tmp_path / "models--BAAI--bge-small-zh-v1.5" / "files_metadata.json"
    meta.parent.mkdir(parents=True)
    meta.write_text("{}", encoding="utf-8")
    assert client.embed_available() is False


def test_fastembed_unavailable_when_model_not_in_table(monkeypatch, tmp_path):
    """EMBED_MODEL 不在 fastembed 支持表 → 判 False（无法离线加载），不抛异常。"""
    from features.ai import client

    _fastembed_offline(monkeypatch, tmp_path)
    monkeypatch.setattr("core.config.EMBED_MODEL", "no-such-org/no-such-model")
    assert client.embed_available() is False


def test_search_degrades_when_fastembed_uncached(monkeypatch, tmp_path):
    """端到端：fastembed 未缓存时 /api/ai/search 不再 500/挂起，毫秒级降级 LIKE 关键词。"""
    import db
    from features.ai import client as ai_client

    _fastembed_offline(monkeypatch, tmp_path)
    db.ex("DELETE FROM ai_index")  # 全套件共用同一测试库：清掉其他用例残留的索引行，LIKE 全表扫描才可精确断言
    c = TestClient(main.app)
    ai_client.embeddings_model.cache_clear()
    try:
        make_user(c, "embed1")
        user_login(c, "embed1")
        add_index_row("case-embed-kw", [0.0, 0.0], "缓存一致性窗口与回源策略")
        r = c.get("/api/ai/search", params={"q": "缓存一致性"})
        assert r.status_code == 200, r.text
        results = r.json()["results"]
        assert len(results) == 1 and results[0]["caseId"] == "case-embed-kw"
    finally:
        ai_client.embeddings_model.cache_clear()
