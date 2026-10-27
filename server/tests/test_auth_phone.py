"""auth 域·手机号身份：验证码发送/登录建号/账号互通绑定/限频。"""
import time

import pytest

from tests.conftest import make_client, login_admin, load_seed

PHONE = "13800001234"
_seq = {"n": 0}


@pytest.fixture(autouse=True)
def _dev_mode(monkeypatch):
    """短信 dev 回显仅 ENV=dev 生效：本文件用例统一在 dev 形态下跑。"""
    from core import config

    monkeypatch.setattr(config, "DEV_MODE", True)


def _phone() -> str:
    """每用例独立号码：共享临时库下互不触发 60s 限频。"""
    _seq["n"] += 1
    return f"1380000{_seq['n']:04d}"[:11]


def _send(client, phone: str) -> dict:
    r = client.post("/api/auth/sms/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    return r.json()


def _read_code(client, phone: str) -> str:
    """测试直读库里的验证码（dev 通道回显亦可，但直读更稳）。"""
    import db as dbmod

    row = dbmod.q("SELECT code FROM sms_codes WHERE phone=?", (phone,))
    assert row
    return row[0]["code"]


def test_sms_send_dev_echo():
    with make_client() as client:
        out = _send(client, _phone())
        assert out["ok"] is True
        assert out["devEcho"].isdigit() and len(out["devEcho"]) == 6


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
