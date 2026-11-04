"""PNVS SDK adapter：校验请求字段与返回语义，不访问真实阿里云。"""

import json
from types import SimpleNamespace

from core import config, sms


def test_send_uses_cloud_generated_code_and_system_template(monkeypatch):
    monkeypatch.setattr(config, "ALIYUN_PNVS_SIGN_NAME", "测试系统签名")
    monkeypatch.setattr(config, "ALIYUN_PNVS_TEMPLATE_CODE", "100001")
    monkeypatch.setattr(sms, "code_ttl_sec", lambda: 120)
    monkeypatch.setattr(sms, "resend_interval_sec", lambda: 60)
    request_data = {}

    class Client:
        def send_sms_verify_code(self, request):
            request_data.update(vars(request))
            return SimpleNamespace(body=SimpleNamespace(code="OK", success=True, message="成功"))

    monkeypatch.setattr(sms, "_client", Client)
    assert sms._send_aliyun("13800001234", "challenge-1") == {"ok": True}
    assert request_data["phone_number"] == "13800001234"
    assert request_data["out_id"] == "challenge-1"
    assert request_data["sign_name"] == "测试系统签名"
    assert request_data["template_code"] == "100001"
    assert json.loads(request_data["template_param"]) == {"code": "##code##", "min": "2"}
    assert request_data["valid_time"] == 120
    assert request_data["code_length"] == 6
    assert request_data["code_type"] == 1
    assert request_data["return_verify_code"] is False


def test_check_passes_out_id_and_only_accepts_pass_result(monkeypatch):
    request_data = {}

    class Client:
        def check_sms_verify_code(self, request):
            request_data.update(vars(request))
            return SimpleNamespace(
                body=SimpleNamespace(
                    code="OK",
                    success=True,
                    message="成功",
                    model=SimpleNamespace(verify_result="PASS"),
                )
            )

    monkeypatch.setattr(sms, "_client", Client)
    assert sms._check_aliyun("13800001234", "challenge-1", "246810") is True
    assert request_data["phone_number"] == "13800001234"
    assert request_data["out_id"] == "challenge-1"
    assert request_data["verify_code"] == "246810"


def test_check_rejects_unknown_result(monkeypatch):
    class Client:
        def check_sms_verify_code(self, request):
            return SimpleNamespace(
                body=SimpleNamespace(
                    code="OK",
                    success=True,
                    message="成功",
                    model=SimpleNamespace(verify_result="UNKNOWN"),
                )
            )

    monkeypatch.setattr(sms, "_client", Client)
    assert sms._check_aliyun("13800001234", "challenge-1", "000000") is False
