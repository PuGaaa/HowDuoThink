"""短信验证码发送通道（可插拔）。
- dev（默认 provider）：验证码写日志 + 响应回显，仅 ENV=dev 下生效
- aliyun：阿里云短信服务（占位）——ALIYUN_SMS_* 环境变量齐备后实现 send() 即启用
将来"一键登录"接阿里云号码认证服务 SDK，用户模型已预留 phone 身份位。"""
import logging
import os
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

ALIYUN_SMS_ACCESS_KEY = os.environ.get("ALIYUN_SMS_ACCESS_KEY", "")
ALIYUN_SMS_SECRET = os.environ.get("ALIYUN_SMS_SECRET", "")
ALIYUN_SMS_SIGN = os.environ.get("ALIYUN_SMS_SIGN", "")
ALIYUN_SMS_TEMPLATE = os.environ.get("ALIYUN_SMS_TEMPLATE", "")


def new_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"


PROVIDER = os.environ.get("SMS_PROVIDER", "dev")  # dev（回显联调）| aliyun


def send_code(phone: str, code: str) -> dict:
    """按配置的通道发送验证码。返回 {ok, devEcho?}——devEcho 仅 ENV=dev 存在，生产绝不回显。"""
    if PROVIDER == "aliyun":
        # 阿里云短信通道占位：凭据齐备后接入 dysmsapi SendSms
        raise SmsChannelUnavailable("阿里云短信通道未实现（SMS_PROVIDER=aliyun 但 Sender 未接入）")
    if not config.DEV_MODE:
        # dev 回显是开发联调通道，与"ENV=dev"绑定而非 provider 缺省：生产/预发未接入真实
        # 服务商时显式 503 降级，绝不把验证码回显进响应体或日志
        raise SmsChannelUnavailable("短信通道未接入：非 dev 环境禁用回显通道，请配置真实短信服务商")
    logger.info("[sms:dev] 验证码 %s -> %s", code, phone)
    out: dict = {"ok": True, "devEcho": code}
    return out
