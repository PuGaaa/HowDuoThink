"""阿里云号码认证服务（PNVS）短信认证通道。开发和生产使用同一 provider。"""

import json
import secrets

from core import config, settings


class SmsChannelUnavailable(RuntimeError):
    """短信通道不可用：PNVS 配置、SDK 或 API 请求失败。"""


def code_ttl_sec() -> int:
    """验证码有效期（秒）——运行时可在管理端「系统设置」调整（core.settings）。"""
    return int(settings.get("sms.code_ttl_sec"))


def resend_interval_sec() -> int:
    """同号重发限频（秒）——同上，settings 即时可调。"""
    return int(settings.get("sms.resend_interval_sec"))


def new_out_id() -> str:
    """生成与手机号和短信挑战关联的唯一外部流水号。"""
    return secrets.token_hex(16)


def _client():
    """创建阿里云号码认证服务客户端。"""
    if not all(
        (
            config.ALIYUN_PNVS_ACCESS_KEY_ID,
            config.ALIYUN_PNVS_ACCESS_KEY_SECRET,
        )
    ):
        raise SmsChannelUnavailable("阿里云号码认证服务 AccessKey 配置不完整")
    try:
        from alibabacloud_dypnsapi20170525.client import Client
        from alibabacloud_tea_openapi.models import Config
    except ImportError as e:
        raise SmsChannelUnavailable("阿里云号码认证服务 SDK 未安装") from e

    return Client(
        Config(
            access_key_id=config.ALIYUN_PNVS_ACCESS_KEY_ID,
            access_key_secret=config.ALIYUN_PNVS_ACCESS_KEY_SECRET,
            endpoint="dypnsapi.aliyuncs.com",
        )
    )


def _send_aliyun(phone: str, out_id: str) -> dict:
    """使用 PNVS 系统签名和模板，由阿里云生成并保管验证码。"""
    if not all((config.ALIYUN_PNVS_SIGN_NAME, config.ALIYUN_PNVS_TEMPLATE_CODE)):
        raise SmsChannelUnavailable("阿里云号码认证服务签名或模板配置不完整")
    try:
        from alibabacloud_dypnsapi20170525.models import SendSmsVerifyCodeRequest
        from alibabacloud_tea_openapi.exceptions import AlibabaCloudException
    except ImportError as e:
        raise SmsChannelUnavailable("阿里云号码认证服务 SDK 未安装") from e

    ttl = code_ttl_sec()
    try:
        response = _client().send_sms_verify_code(
            SendSmsVerifyCodeRequest(
                phone_number=phone,
                sign_name=config.ALIYUN_PNVS_SIGN_NAME,
                template_code=config.ALIYUN_PNVS_TEMPLATE_CODE,
                template_param=json.dumps(
                    {"code": "##code##", "min": str((ttl + 59) // 60)},
                    ensure_ascii=False,
                ),
                out_id=out_id,
                code_length=6,
                code_type=1,
                valid_time=ttl,
                interval=resend_interval_sec(),
                duplicate_policy=1,
                return_verify_code=False,
            )
        )
    except AlibabaCloudException as e:
        raise SmsChannelUnavailable("阿里云号码认证服务发送请求失败") from e
    body = response.body
    if body.code != "OK" or not body.success:
        raise SmsChannelUnavailable(f"阿里云短信发送失败：{body.message}")
    return {"ok": True}


def _check_aliyun(phone: str, out_id: str, code: str) -> bool:
    """由阿里云校验 PNVS 生成的验证码。"""
    try:
        from alibabacloud_dypnsapi20170525.models import CheckSmsVerifyCodeRequest
        from alibabacloud_tea_openapi.exceptions import AlibabaCloudException
    except ImportError as e:
        raise SmsChannelUnavailable("阿里云号码认证服务 SDK 未安装") from e

    try:
        response = _client().check_sms_verify_code(
            CheckSmsVerifyCodeRequest(
                phone_number=phone,
                out_id=out_id,
                verify_code=code,
            )
        )
    except AlibabaCloudException as e:
        raise SmsChannelUnavailable("阿里云号码认证服务校验请求失败") from e
    body = response.body
    if body.code != "OK" or not body.success:
        raise SmsChannelUnavailable(f"阿里云短信校验失败：{body.message}")
    return body.model.verify_result == "PASS"


def send_code(phone: str, out_id: str) -> dict:
    """统一通过 PNVS 发送验证码；不生成、回显或记录验证码明文。"""
    return _send_aliyun(phone, out_id)


def verify_code(phone: str, out_id: str, code: str) -> bool:
    """统一通过 PNVS 校验验证码。"""
    return _check_aliyun(phone, out_id, code)
