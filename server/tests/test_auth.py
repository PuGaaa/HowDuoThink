"""auth 域：健康检查、账密鉴权、哈希升级、dev 旁路关闭。"""

from tests.conftest import login_admin, make_client


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


def test_new_database_requires_admin_password(monkeypatch):
    """新库未配 ADMIN_PASSWORD 时启动失败，不创建已知默认凭据。"""
    import pytest

    from core import config

    monkeypatch.setattr(config, "ADMIN_PASSWORD", "")
    _remove_admins()
    try:
        with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
            with make_client():
                pass
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
        _restore_pw_admin()


def test_default_account_hint_is_false_without_default_password(monkeypatch):
    from core import config

    monkeypatch.setattr(config, "ADMIN_PASSWORD", "")
    monkeypatch.setattr(config, "DEV_MODE", True)  # 提示端点只在 dev 暴露（生产 404，见下方收紧用例）
    with make_client() as client:
        assert client.get("/api/auth/default-account").json() == {"default": False}


def test_bootstrap_endpoints_removed():
    with make_client() as client:
        assert client.post("/api/auth/bootstrap", json={"login": "x", "password": "x12345"}).status_code in (404, 405)


# ---------- 默认密码探测收紧：公开情报只许 dev 看 ----------


def test_default_account_hint_hidden_outside_dev():
    """安全：/api/auth/default-account 会暴露「初始密码是否还在用」，生产/未设 ENV 必须 404。"""
    with make_client() as client:
        assert client.get("/api/auth/default-account").status_code == 404


# ---------- 登录防爆破：账密与短信验码共用频控 ----------


def _isolate_throttle(monkeypatch):
    """每个用例独享空的失败计数（service 模块级 dict，monkeypatch 自动还原）。"""
    from features.auth import service

    monkeypatch.setattr(service, "_LOGIN_FAILURES", {}, raising=False)


def _set_throttle(max_failures: int, lock_seconds: int):
    """阈值经 settings 下发生效（与生产同链路）；返回还原函数，用例 finally 里调用恢复默认。"""
    from core import settings

    settings.update_many({"login.max_failures": max_failures, "login.lock_seconds": lock_seconds}, "test")

    def _restore():
        import db

        db.ex("DELETE FROM settings WHERE setting_key IN ('login.max_failures','login.lock_seconds')")
        settings.reset_cache()

    return _restore


def test_login_rate_limited_after_repeated_failures(monkeypatch):
    _restore = _set_throttle(3, 300)
    _isolate_throttle(monkeypatch)
    try:
        with make_client() as client:
            for _ in range(3):
                assert client.post("/api/auth/login", json={"login": "admin", "password": "bad"}).status_code == 401
            # 第 4 次即使密码正确也先被频控挡下，不再消耗一次 bcrypt 校验
            r = client.post("/api/auth/login", json={"login": "admin", "password": "test-admin-pw"})
            assert r.status_code == 429, r.text
    finally:
        _restore()


def test_login_rate_limit_window_expires(monkeypatch):
    """窗口滑动释放：失败记录滑出窗口后不再计数（lock_seconds 下限 30，回拨时间戳免真实等待）。"""
    from features.auth import service

    _restore = _set_throttle(2, 30)
    _isolate_throttle(monkeypatch)
    try:
        with make_client() as client:
            for _ in range(2):
                assert client.post("/api/auth/login", json={"login": "admin", "password": "bad"}).status_code == 401
            assert client.post("/api/auth/login", json={"login": "admin", "password": "bad"}).status_code == 429
            with service._throttle_lock:
                service._LOGIN_FAILURES["pw:admin"] = [t - 31 for t in service._LOGIN_FAILURES["pw:admin"]]
            assert (
                client.post("/api/auth/login", json={"login": "admin", "password": "test-admin-pw"}).status_code == 200
            )
    finally:
        _restore()


def test_phone_code_rate_limited(monkeypatch):
    import time

    import db

    _restore = _set_throttle(3, 300)
    _isolate_throttle(monkeypatch)
    phone, code = "13900000001", "246810"
    db.ex(
        "INSERT INTO sms_codes(phone, code, expires_at, used) VALUES(?,?,?,0) "
        "ON CONFLICT(phone) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, used=0",
        (phone, code, int(time.time()) + 600),
    )
    try:
        with make_client() as client:
            for _ in range(3):
                r = client.post("/api/auth/login/phone", json={"phone": phone, "code": "000000"})
                assert r.status_code == 401
            # 连错封窗后，正确验证码也不放行（防止用 401/429 差异爆破验证码）
            r = client.post("/api/auth/login/phone", json={"phone": phone, "code": code})
            assert r.status_code == 429
    finally:
        _restore()


def test_banned_account_login_also_throttled(monkeypatch):
    """被禁账号连正确密码登录也要计失败：知道密码的被封用户不许无限消耗 bcrypt。"""
    import db
    from core import security

    _restore = _set_throttle(3, 300)
    _isolate_throttle(monkeypatch)
    db.ex(
        "INSERT INTO users(id, login, name, avatar, role, status, password_hash) "
        "VALUES('pw-victim','victim','受害者','','user','banned',?) "
        "ON CONFLICT(id) DO UPDATE SET status='banned', password_hash=excluded.password_hash",
        (security.hash_password("victim-pw-1"),),
    )
    try:
        with make_client() as client:
            for _ in range(3):
                r = client.post("/api/auth/login", json={"login": "victim", "password": "victim-pw-1"})
                assert r.status_code == 403  # 密码正确但被封禁
            # 第 4 次正确密码也要被频控挡下
            r = client.post("/api/auth/login", json={"login": "victim", "password": "victim-pw-1"})
            assert r.status_code == 429, r.text
    finally:
        _restore()
