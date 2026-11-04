"""auth 域·短信通道门禁：统一真实 provider，缺配置时 503，验证码不回显、不进日志。"""

from fastapi.testclient import TestClient

import main  # noqa: F401  (确保 app 已初始化)
from tests.conftest import make_client

_seq = {"n": 0}


def _phone() -> str:
    """每用例独立号码：共享临时库下互不触发 60s 重发限频。"""
    _seq["n"] += 1
    return f"1389999{_seq['n']:04d}"[:11]


def _send(client, phone: str) -> object:
    return client.post("/api/auth/sms/send", json={"phone": phone})


def test_sms_send_503_when_not_dev_mode():
    """缺少真实短信配置时返回 503，响应体不含验证码。"""
    phone = _phone()
    with TestClient(main.app, raise_server_exceptions=False) as client:
        r = _send(client, phone)
        assert r.status_code == 503
        assert "devEcho" not in r.text


def test_sms_send_without_credentials_stores_no_challenge():
    """短信配置缺失时响应 503，不创建本地验证码挑战。"""
    import db as dbmod

    phone = _phone()
    with TestClient(main.app, raise_server_exceptions=False) as client:
        r = _send(client, phone)
        assert r.status_code == 503
    assert not dbmod.q("SELECT out_id FROM sms_codes WHERE phone=?", (phone,))


def test_sms_aliyun_provider_isolates_sdk(monkeypatch):
    """阿里云 SDK 由测试隔离，HTTP 层不暴露验证码。"""
    phone = _phone()
    from core import sms as sms_core

    monkeypatch.setattr(sms_core, "_send_aliyun", lambda phone, out_id: {"ok": True})
    with make_client() as client:
        r = _send(client, phone)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
