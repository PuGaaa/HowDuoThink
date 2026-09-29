"""GitHub OAuth + 自有会话（JWT cookie）。
凭据全部走环境变量：
- JWT_SECRET 未设置时使用进程内随机密钥（无法伪造，但重启后所有会话失效）；
- ADMIN_PASSWORD 无默认值：非 dev 环境仅在库里没有管理员时创建，绝不覆盖已有密码。"""
import hashlib
import hmac
import os
import secrets
import time

import bcrypt
import httpx
import jwt

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


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def is_legacy_hash(hashed: str) -> bool:
    return not hashed.startswith("$2")


def _legacy_sha256(password: str) -> str:
    return hashlib.sha256(("think:" + password).encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    """兼容历史无盐 SHA256 哈希（登录成功后由调用方升级为 bcrypt）。"""
    if hashed.startswith("$2"):
        try:
            return bcrypt.checkpw(password.encode(), hashed.encode())
        except ValueError:
            return False
    return hmac.compare_digest(_legacy_sha256(password), hashed)


def configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


def authorize_url(state: str) -> str:
    return (
        "https://github.com/login/oauth/authorize"
        f"?client_id={CLIENT_ID}&redirect_uri={WEB_ORIGIN}/oauth/github/callback&state={state}&scope=read:user"
    )


def exchange_and_fetch(code: str) -> dict:
    """code → access_token → GitHub 用户信息。"""
    with httpx.Client(timeout=15) as client:
        token_res = client.post(
            "https://github.com/login/oauth/access_token",
            json={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET, "code": code},
            headers={"Accept": "application/json"},
        )
        token = token_res.json().get("access_token")
        if not token:
            raise RuntimeError("GitHub 换 token 失败")
        user_res = client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        u = user_res.json()
    return {"github_id": str(u["id"]), "login": u["login"], "name": u.get("name") or u["login"], "avatar": u.get("avatar_url", "")}


def sign_session(user_id: str, days: int = 30) -> str:
    return jwt.encode({"uid": user_id, "exp": int(time.time()) + days * 86400}, JWT_SECRET, algorithm="HS256")


def verify_session(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload["uid"]
    except Exception:
        return None


def role_for(login: str) -> str:
    if login in GITHUB_ADMIN_LOGINS:
        return "admin"
    if DEV_MODE and login.startswith("admin"):
        return "admin"  # 本地开发绕行：仅 ENV=dev 时 admin* 给 editor 权限
    return "user"
