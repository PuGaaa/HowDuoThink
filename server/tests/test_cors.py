"""前端独立部署时的 API CORS 边界。"""

from fastapi.testclient import TestClient


def test_api_does_not_serve_admin_frontend():
    from main import create_app

    with TestClient(create_app()) as client:
        assert client.get("/admin/").status_code == 404


def test_cors_allows_admin_origin(monkeypatch):
    from core import config
    from main import create_app

    monkeypatch.setattr(config, "ADMIN_WEB_ORIGIN", "https://admin.example.com", raising=False)
    with TestClient(create_app()) as client:
        response = client.options(
            "/api/health",
            headers={
                "Origin": "https://admin.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code in (200, 204), response.text
        assert response.headers["access-control-allow-origin"] == "https://admin.example.com"


def test_cors_allows_local_h5_origin():
    from main import create_app

    with TestClient(create_app()) as client:
        response = client.options(
            "/api/health",
            headers={"Origin": "http://127.0.0.1:5183", "Access-Control-Request-Method": "GET"},
        )
        assert response.status_code in (200, 204)
        assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5183"


def test_cors_admin_origin_empty_not_leaked(monkeypatch):
    from core import config
    from main import create_app

    monkeypatch.setattr(config, "ADMIN_WEB_ORIGIN", "", raising=False)
    with TestClient(create_app()) as client:
        response = client.options(
            "/api/health",
            headers={"Origin": "https://random.example.com", "Access-Control-Request-Method": "GET"},
        )
        assert response.headers.get("access-control-allow-origin") != ""
