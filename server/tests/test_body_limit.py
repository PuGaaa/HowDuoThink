"""全局请求体上限：声明式 Content-Length 超限直接 413，不进路由逻辑。"""

from tests.conftest import make_client


def test_body_over_limit_413(monkeypatch):
    from core import config

    monkeypatch.setattr(config, "BODY_LIMIT_MB", 1)
    big = b"x" * (1024 * 1024 + 1)
    with make_client() as client:
        r = client.post(
            "/api/auth/login",
            content=big,
            headers={"content-type": "application/json"},
        )
        assert r.status_code == 413


def test_body_under_limit_passes_through():
    """正常大小请求不受影响（路由逻辑照常执行，此处未登录 401 即为穿透证明）。"""
    with make_client() as client:
        r = client.post("/api/auth/login", json={"login": "nobody", "password": "x"})
        assert r.status_code in (401, 429)
