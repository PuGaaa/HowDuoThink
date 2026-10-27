"""auth 域·短信通道门禁：dev 回显仅 ENV=dev；非 dev 环境 503 降级，验证码不回显、不进日志。"""
import pytest
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
    """生产形态（ENV≠dev）：dev 回显通道被门禁挡下 → 503，响应体不含验证码。"""
    phone = _phone()
    with TestClient(main.app, raise_server_exceptions=False) as client:
        r = _send(client, phone)
        assert r.status_code == 503
        assert "devEcho" not in r.text


def test_sms_code_not_logged_when_not_dev_mode(caplog):
    """生产形态：验证码值不得出现在任何日志记录里（dev 回显日志被门禁挡下）。"""
    import db as dbmod

    phone = _phone()
    with TestClient(main.app, raise_server_exceptions=False) as client:
        r = _send(client, phone)
        assert r.status_code == 503
    row = dbmod.q("SELECT code FROM sms_codes WHERE phone=?", (phone,))
    if row:
        assert row[0]["code"] not in caplog.text


def test_sms_dev_echo_present_in_dev_mode(monkeypatch):
    """dev 形态（ENV=dev）：回显可用，前端联调不破。"""
    from core import config

    phone = _phone()
    monkeypatch.setattr(config, "DEV_MODE", True)
    with make_client() as client:
        r = _send(client, phone)
        assert r.status_code == 200, r.text
        assert r.json()["devEcho"].isdigit() and len(r.json()["devEcho"]) == 6


def test_sms_aliyun_unimplemented_maps_503(monkeypatch):
    """provider=aliyun（占位未实现）：映射 503 而不是 500。"""
    from core import sms as sms_core

    phone = _phone()
    monkeypatch.setattr(sms_core, "PROVIDER", "aliyun")
    with TestClient(main.app, raise_server_exceptions=False) as client:
        r = _send(client, phone)
        assert r.status_code == 503
