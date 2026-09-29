"""环境变量集中地：所有配置只在这里读 os.environ，其余模块一律 import core.config。
JWT_SECRET 未设置时使用进程内随机密钥（重启后所有会话失效，生产必须显式配置）。"""
import os
import secrets

CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
_jwt_secret_env = os.environ.get("JWT_SECRET", "")
JWT_SECRET = _jwt_secret_env or secrets.token_hex(32)
JWT_SECRET_EPHEMERAL = not bool(_jwt_secret_env)
WEB_ORIGIN = os.environ.get("WEB_ORIGIN", "http://localhost:3000")
GITHUB_ADMIN_LOGINS = set(filter(None, os.environ.get("GITHUB_ADMIN_LOGINS", "").split(",")))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
# 显式开发模式开关：/api/dev/login 与 admin* 提权捷径只在 ENV=dev 下可用
DEV_MODE = os.environ.get("ENV", "").lower() == "dev"
# 生产 HTTPS 部署时设 COOKIE_SECURE=1，会话 cookie 仅经 HTTPS 传输
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "") == "1"


def oauth_configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)
