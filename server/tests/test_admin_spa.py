"""管理端独立工程支撑：CORS 放行 admin 源、/admin SPA 静态托管（含前端路由 fallback）。"""
from fastapi.testclient import TestClient

from tests.conftest import make_client


def test_admin_spa_served_with_route_fallback(monkeypatch, tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>admin-spa-ok</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    from core import config
    from main import create_app

    monkeypatch.setattr(config, "ADMIN_DIST_DIR", str(tmp_path), raising=False)
    with TestClient(create_app()) as client:
        assert "admin-spa-ok" in client.get("/admin/").text
        # SPA 前端路由（如 /admin/users）必须回退到 index.html，而不是 404
        assert "admin-spa-ok" in client.get("/admin/users").text
        assert client.get("/admin/assets/app.js").text == "console.log(1)"


def test_admin_spa_absent_returns_404(monkeypatch, tmp_path):
    from core import config
    from main import create_app

    monkeypatch.setattr(config, "ADMIN_DIST_DIR", str(tmp_path / "no-such-dist"), raising=False)
    with TestClient(create_app()) as client:
        assert client.get("/admin/").status_code == 404


def test_cors_allows_admin_origin(monkeypatch):
    from core import config
    from main import create_app

    monkeypatch.setattr(config, "ADMIN_WEB_ORIGIN", "https://admin.example.com", raising=False)
    with TestClient(create_app()) as client:
        r = client.options(
            "/api/health",
            headers={
                "Origin": "https://admin.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert r.status_code in (200, 204), r.text
        assert r.headers["access-control-allow-origin"] == "https://admin.example.com"


def test_cors_admin_origin_empty_not_leaked(monkeypatch):
    # 未配置 ADMIN_WEB_ORIGIN 时不应出现空串源
    from core import config
    from main import create_app

    monkeypatch.setattr(config, "ADMIN_WEB_ORIGIN", "", raising=False)
    with TestClient(create_app()) as client:
        r = client.options(
            "/api/health",
            headers={"Origin": "https://random.example.com", "Access-Control-Request-Method": "GET"},
        )
        assert r.headers.get("access-control-allow-origin") != ""
