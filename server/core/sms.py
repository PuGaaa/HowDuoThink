"""短信验证码发送通道。开发和生产使用同一 provider 接口。"""

import json
import secrets

from core import config, settings


class SmsChannelUnavailable(RuntimeError):
    """短信通道不可用：阿里云短信配置、SDK或发送结果不满足要求。"""


def code_ttl_sec() -> int:
    """验证码有效期（秒）——运行时可在管理端「系统设置」调整（core.settings）。"""
    return int(settings.get("sms.code_ttl_sec"))


def resend_interval_sec() -> int:
    """同号重发限频（秒）——同上，settings 即时可调。"""
    return int(settings.get("sms.resend_interval_sec"))


def new_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"


def _send_aliyun(phone: str, code: str) -> dict:
    """通过阿里云短信官方 SDK 发送；SDK 延迟导入，隔离测试无需网络或凭据。"""
    if not all(
        (
            config.ALIYUN_SMS_ACCESS_KEY,
            config.ALIYUN_SMS_SECRET,
            config.ALIYUN_SMS_SIGN,
            config.ALIYUN_SMS_TEMPLATE,
        )
    ):
        raise SmsChannelUnavailable("阿里云短信配置不完整")
    try:
        from alibabacloud_dysmsapi20170525.client import Client
        from alibabacloud_dysmsapi20170525.models import SendSmsRequest
        from alibabacloud_tea_openapi.models import Config
    except ImportError as e:
        raise SmsChannelUnavailable("阿里云短信 SDK 未安装") from e

    client = Client(
        Config(
            access_key_id=config.ALIYUN_SMS_ACCESS_KEY,
            access_key_secret=config.ALIYUN_SMS_SECRET,
            endpoint="dysmsapi.aliyuncs.com",
        )
    )
    response = client.send_sms(
        SendSmsRequest(
            phone_numbers=phone,
            sign_name=config.ALIYUN_SMS_SIGN,
            template_code=config.ALIYUN_SMS_TEMPLATE,
            template_param=json.dumps({"code": code}, ensure_ascii=False),
        )
    )
    body = response.body
    if body.code != "OK":
        raise SmsChannelUnavailable(f"阿里云短信发送失败：{body.message}")
    return {"ok": True}


def send_code(phone: str, code: str) -> dict:
    """统一通过阿里云短信发送，永不回显验证码或记录验证码日志。"""
    return _send_aliyun(phone, code)
