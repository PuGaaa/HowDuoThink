"""auth 域·手机号身份：验证码发送/登录建号/账号互通绑定/限频。"""

import pytest

from tests.conftest import login_admin, make_client

PHONE = "13800001234"
_seq = {"n": 0}


@pytest.fixture(autouse=True)
def _sms_provider(monkeypatch):
    """隔离阿里云 SDK；测试不伪造短信回显。"""
    from core import sms

    monkeypatch.setattr(sms, "_send_aliyun", lambda phone, code: {"ok": True})


def _phone() -> str:
    """每用例独立号码：共享临时库下互不触发 60s 限频。"""
    _seq["n"] += 1
    return f"1380000{_seq['n']:04d}"[:11]


def _send(client, phone: str) -> dict:
    r = client.post("/api/auth/sms/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    return r.json()


def _read_code(client, phone: str) -> str:
    """测试从隔离数据库读取待消费验证码。"""
    import db as dbmod

    row = dbmod.q("SELECT code FROM sms_codes WHERE phone=?", (phone,))
    assert row
    return row[0]["code"]


def test_sms_send_does_not_echo_code():
    with make_client() as client:
        out = _send(client, _phone())
        assert out["ok"] is True
        assert "devEcho" not in out


def test_sms_resend_rate_limited():
    with make_client() as client:
        p = _phone()
        _send(client, p)
        r = client.post("/api/auth/sms/send", json={"phone": p})
        assert r.status_code == 429


def test_phone_login_creates_user():
    with make_client() as client:
        p = _phone()
        _send(client, p)
        code = _read_code(client, p)
        r = client.post("/api/auth/login/phone", json={"phone": p, "code": code})
        assert r.status_code == 200
        assert r.json()["login"].startswith("u")
        assert r.json()["token"]


def test_phone_login_same_user_second_time():
    with make_client() as client:
        p = _phone()
        _send(client, p)
        r1 = client.post("/api/auth/login/phone", json={"phone": p, "code": _read_code(client, p)})
        # 重发 + 二次登录（等待限频不可行，直接改库内 created_at 绕过 60s）
        import db as dbmod

        dbmod.ex("UPDATE sms_codes SET created_at=datetime('now','-120 seconds') WHERE phone=?", (p,))
        _send(client, p)
        r2 = client.post("/api/auth/login/phone", json={"phone": p, "code": _read_code(client, p)})
        assert r2.status_code == 200
        # 两次登录 me 返回同一用户
        t1 = r1.json()["token"]
        t2 = r2.json()["token"]
        me1 = client.get("/api/me", headers={"Authorization": "Bearer " + t1}).json()
        me2 = client.get("/api/me", headers={"Authorization": "Bearer " + t2}).json()
        assert me1["id"] == me2["id"]


def test_phone_login_wrong_code_401():
    with make_client() as client:
        p = _phone()
        _send(client, p)
        r = client.post("/api/auth/login/phone", json={"phone": p, "code": "000000"})
        assert r.status_code == 401


def test_bind_phone_makes_accounts_interoperable():
    """注册互通核心用例：Web 端已有账密账号（pw-admin），绑定手机号后，
    手机验证码登录进的是同一个账号。"""
    with make_client() as client:
        login_admin(client)  # pw-admin 登录（cookie）
        p = _phone()
        _send(client, p)
        r = client.post("/api/me/bind-phone", json={"phone": p, "code": _read_code(client, p)})
        assert r.status_code == 200, r.text
        # 手机验证码登录 → 应返回同一账号
        import db as dbmod

        dbmod.ex("UPDATE sms_codes SET created_at=datetime('now','-120 seconds') WHERE phone=?", (p,))
        _send(client, p)
        r2 = client.post("/api/auth/login/phone", json={"phone": p, "code": _read_code(client, p)})
        assert r2.status_code == 200
        me = client.get("/api/me", headers={"Authorization": "Bearer " + r2.json()["token"]}).json()
        assert me["id"] == "pw-admin"
        assert me["role"] == "admin"


def test_bind_conflict_does_not_burn_code():
    """绑定冲突（409）不得烧码：验码消费与账号写入同事务，回滚后验证码仍可用。
    原实现先消费后检查冲突，验证码被白烧。"""
    with make_client() as client:
        p = _phone()
        _send(client, p)
        r = client.post("/api/auth/login/phone", json={"phone": p, "code": _read_code(client, p)})
        assert r.status_code == 200  # 建号，手机号已归属该用户
        # 重发新码，让 pw-admin 抢绑 → 409
        import db as dbmod

        dbmod.ex("UPDATE sms_codes SET created_at=datetime('now','-120 seconds') WHERE phone=?", (p,))
        _send(client, p)
        code2 = _read_code(client, p)
        login_admin(client)
        r = client.post("/api/me/bind-phone", json={"phone": p, "code": code2})
        assert r.status_code == 409
        # 码未被烧掉：仍可正常登录
        r2 = client.post("/api/auth/login/phone", json={"phone": p, "code": code2})
        assert r2.status_code == 200, f"验证码被白烧：{r2.status_code} {r2.text}"


def test_concurrent_login_same_code_single_winner():
    """同一验证码并发提交：恰有一次成功（原子消费消灭 TOCTOU 双花）。"""
    import threading

    with make_client() as client:
        p = _phone()
        _send(client, p)
        code = _read_code(client, p)
        results: list[int] = []
        lock = threading.Lock()
        barrier = threading.Barrier(4)

        def hit():
            c = make_client()
            barrier.wait()
            r = c.post("/api/auth/login/phone", json={"phone": p, "code": code})
            with lock:
                results.append(r.status_code)

        threads = [threading.Thread(target=hit) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert results.count(200) == 1, results


def test_phone_account_password_login_uses_same_user_id():
    """手机号建号设置密码后，账密入口仍登录同一用户，不依赖 ID 前缀。"""
    with make_client() as client:
        p = _phone()
        _send(client, p)
        phone_login = client.post("/api/auth/login/phone", json={"phone": p, "code": _read_code(client, p)})
        assert phone_login.status_code == 200
        uid = phone_login.json()["userId"]
        login_name = phone_login.json()["login"]
        password = "phone-pw-123"

        r = client.post(
            "/api/me/password",
            json={"oldPassword": "", "newPassword": password},
            headers={"Authorization": "Bearer " + phone_login.json()["token"]},
        )
        assert r.status_code == 200

        password_login = client.post("/api/auth/login", json={"login": login_name, "password": password})
        assert password_login.status_code == 200
        assert password_login.json()["userId"] == uid
        assert password_login.json()["name"] == phone_login.json()["name"]


def test_phone_account_can_password_login_by_phone():
    with make_client() as client:
        p = _phone()
        _send(client, p)
        phone_login = client.post("/api/auth/login/phone", json={"phone": p, "code": _read_code(client, p)})
        assert phone_login.status_code == 200
        assert (
            client.post(
                "/api/me/password",
                json={"newPassword": "phone-pw-456"},
                headers={"Authorization": "Bearer " + phone_login.json()["token"]},
            ).status_code
            == 200
        )

        password_login = client.post("/api/auth/login", json={"login": p, "password": "phone-pw-456"})
        assert password_login.status_code == 200
        assert password_login.json()["userId"] == phone_login.json()["userId"]
