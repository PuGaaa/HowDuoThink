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


# ---------- 初始管理员自助初始化（bootstrap） ----------

def _remove_admins():
    import db

    db.ex("DELETE FROM users WHERE role='admin'")


def _restore_pw_admin():
    """bootstrap 测试会删掉 admin——恢复 pw-admin，避免污染同套件后续用例。"""
    import db

    from core import security

    db.ex(
        "INSERT INTO users(id, login, name, avatar, role, password_hash) "
        "VALUES('pw-admin','pw-admin','管理员','','admin',?) "
        "ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash, role='admin'",
        (security.hash_password("test-admin-pw"),),
    )


def test_bootstrap_status_reflects_admin_presence():
    with make_client() as client:
        assert client.get("/api/auth/bootstrap").json() == {"needsBootstrap": False}
        _remove_admins()
        assert client.get("/api/auth/bootstrap").json() == {"needsBootstrap": True}


def test_bootstrap_creates_first_admin_then_login():
    with make_client() as client:
        try:
            _remove_admins()  # startup 种子会重建 admin，须在 client 启动后删
            r = client.post("/api/auth/bootstrap", json={"login": "founder", "password": "boot-pw-123"})
            assert r.status_code == 200, r.text
            assert r.json()["ok"] is True
            # 创建后立即可登录，且角色为 admin
            r2 = client.post("/api/auth/login", json={"login": "founder", "password": "boot-pw-123"})
            assert r2.status_code == 200, r2.text
            assert r2.json()["role"] == "admin"
        finally:
            _restore_pw_admin()


def test_bootstrap_closed_once_admin_exists():
    with make_client() as client:
        # pw-admin 已由 ADMIN_PASSWORD 种子创建 → 通道必须关闭
        r = client.post("/api/admin/bootstrap" if False else "/api/auth/bootstrap",
                        json={"login": "hijack", "password": "hijack-pw-1"})
        assert r.status_code == 409
        import db

        assert not db.q("SELECT id FROM users WHERE id=?", ("pw-hijack",))


def test_bootstrap_validation_and_single_use():
    with make_client() as client:
        try:
            _remove_admins()  # startup 种子会重建 admin，须在 client 启动后删
            # 密码过短 / 缺账号
            assert client.post("/api/auth/bootstrap", json={"login": "a", "password": "123"}).status_code == 422
            assert client.post("/api/auth/bootstrap", json={"password": "123456"}).status_code == 422
            # 成功一次后立即关闭
            assert client.post("/api/auth/bootstrap", json={"login": "f1", "password": "boot-pw-123"}).status_code == 200
            assert client.post("/api/auth/bootstrap", json={"login": "f2", "password": "boot-pw-456"}).status_code == 409
        finally:
            _restore_pw_admin()
