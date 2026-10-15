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


# ---------- 初始管理员种子（惯例：自带默认账号，README 注明，上线前改密） ----------

def _remove_admins():
    import db

    db.ex("DELETE FROM users WHERE role='admin'")


def _restore_pw_admin(password="test-admin-pw"):
    """种子类测试会动 pw-admin——恢复成套件约定的 test-admin-pw，避免污染后续用例。"""
    import db

    from core import security

    db.ex(
        "INSERT INTO users(id, login, name, avatar, role, password_hash) "
        "VALUES('pw-admin','pw-admin','管理员','','admin',?) "
        "ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash, role='admin'",
        (security.hash_password(password),),
    )


def test_default_admin_seeded_without_env_password(monkeypatch):
    """未配 ADMIN_PASSWORD 时：startup 自动种子 admin / HaoDuo@2026。"""
    from core import config

    monkeypatch.setattr(config, "ADMIN_PASSWORD", "")
    _remove_admins()
    try:
        with make_client() as client:  # startup 重新种子
            r = client.post("/api/auth/login", json={"login": "admin", "password": "HaoDuo@2026"})
            assert r.status_code == 200, r.text
            assert r.json()["role"] == "admin"
    finally:
        _restore_pw_admin()


def test_admin_password_env_overrides_default(monkeypatch):
    from core import config

    monkeypatch.setattr(config, "ADMIN_PASSWORD", "custom-pw-1")
    _remove_admins()
    try:
        with make_client() as client:
            assert client.post("/api/auth/login", json={"login": "admin", "password": "custom-pw-1"}).status_code == 200
            # 默认密码必须失效
            assert client.post("/api/auth/login", json={"login": "admin", "password": "HaoDuo@2026"}).status_code == 401
    finally:
        _restore_pw_admin("custom-pw-1")


def test_default_account_hint_flips_after_password_change(monkeypatch):
    from core import config

    monkeypatch.setattr(config, "ADMIN_PASSWORD", "")
    _remove_admins()
    try:
        with make_client() as client:
            assert client.get("/api/auth/default-account").json() == {"default": True}
            # 登录并改密 → 提示消失
            token = client.post("/api/auth/login", json={"login": "admin", "password": "HaoDuo@2026"}).json()["token"]
            h = {"Authorization": "Bearer " + token}
            r = client.post("/api/me/password", headers=h, json={"oldPassword": "HaoDuo@2026", "newPassword": "new-pw-123"})
            assert r.status_code == 200, r.text
            assert client.get("/api/auth/default-account").json() == {"default": False}
            # 旧默认密码失效，新密码可登录
            assert client.post("/api/auth/login", json={"login": "admin", "password": "HaoDuo@2026"}).status_code == 401
            assert client.post("/api/auth/login", json={"login": "admin", "password": "new-pw-123"}).status_code == 200
    finally:
        _restore_pw_admin()


def test_bootstrap_endpoints_removed():
    with make_client() as client:
        assert client.post("/api/auth/bootstrap", json={"login": "x", "password": "x12345"}).status_code in (404, 405)
