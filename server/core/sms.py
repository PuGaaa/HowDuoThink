"""短信验证码发送通道（可插拔）。
- dev（默认）：验证码写日志 + 允许响应回显（仅 ENV=dev），前端联调完整可用
- aliyun：阿里云短信服务（占位）——ALIYUN_SMS_* 环境变量齐备后实现 send() 即启用
将来"一键登录"接阿里云号码认证服务 SDK，用户模型已预留 phone 身份位。"""
import logging
import os
import secrets

from core import settings

logger = logging.getLogger("server")


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
    """按配置的通道发送验证码。返回 {ok, devEcho?}——devEcho 仅 dev 通道存在。"""
    if PROVIDER == "aliyun":
        # 阿里云短信通道占位：凭据齐备后接入 dysmsapi SendSms
        raise RuntimeError("阿里云短信通道未实现（SMS_PROVIDER=aliyun 但 Sender 未接入）")
    logger.info("[sms:dev] 验证码 %s -> %s", code, phone)
    out: dict = {"ok": True, "devEcho": code}
    return out
