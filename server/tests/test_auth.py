"""auth 域：健康检查、账密鉴权、哈希升级、dev 旁路关闭。"""
from tests.conftest import make_client, login_admin


def test_health():
    with make_client() as client:
        assert client.get("/api/health").status_code == 200


def test_login_wrong_password_401():
    with make_client() as client:
        r = client.post("/api/auth/login", json={"login": "admin", "password": "nope"})
        assert r.status_code == 401


def test_login_ok_then_me():
    with make_client() as client:
        login_admin(client)
        r = client.get("/api/me")
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


def test_dev_login_closed_without_env():
    with make_client() as client:
        assert client.get("/api/dev/login?login=adminx").status_code == 403


def test_me_requires_session():
    with make_client() as client:
        assert client.get("/api/me").status_code == 401


def test_bearer_token_access():
    """App 端通道：登录响应体里的 token，经 Authorization: Bearer 调受保护接口。"""
    with make_client() as client:
        r = client.post("/api/auth/login", json={"login": "admin", "password": "test-admin-pw"})
        token = r.json()["token"]
        assert token
        r = client.get("/api/me", headers={"Authorization": "Bearer " + token})
        assert r.status_code == 200
        assert r.json()["role"] == "admin"
    # 无效 token：用无 cookie 的干净 client 验证，排除 cookie 通道干扰
    with make_client() as fresh:
        r = fresh.get("/api/me", headers={"Authorization": "Bearer fake-token"})
        assert r.status_code == 401
