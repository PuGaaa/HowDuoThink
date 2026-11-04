"""短信验证码发送通道。开发和生产使用同一 provider 接口。"""

import json
import logging
import secrets

from core import config, settings

logger = logging.getLogger("server")


class SmsChannelUnavailable(RuntimeError):
    """短信通道不可用：provider 未实现，或 dev 回显通道被环境门禁挡下（生产须接入真实服务商）。"""


def code_ttl_sec() -> int:
    """验证码有效期（秒）——运行时可在管理端「系统设置」调整（core.settings）。"""
    return int(settings.get("sms.code_ttl_sec"))


def resend_interval_sec() -> int:
    """同号重发限频（秒）——同上，settings 即时可调。"""
    return int(settings.get("sms.resend_interval_sec"))


def new_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"


PROVIDER = config.SMS_PROVIDER  # dev（回显联调）| aliyun


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
    """按配置的通道发送验证码。返回 {ok, devEcho?}——devEcho 仅 ENV=dev 存在，生产绝不回显。"""
    if PROVIDER == "aliyun":
        return _send_aliyun(phone, code)
    if not config.DEV_MODE:
        # dev 回显是开发联调通道，与"ENV=dev"绑定而非 provider 缺省：生产/预发未接入真实
        # 服务商时显式 503 降级，绝不把验证码回显进响应体或日志
        raise SmsChannelUnavailable("短信通道未接入：非 dev 环境禁用回显通道，请配置真实短信服务商")
    logger.info("[sms:dev] 验证码 %s -> %s", code, phone)
    out: dict = {"ok": True, "devEcho": code}
    return out
