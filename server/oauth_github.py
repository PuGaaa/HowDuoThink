"""GitHub OAuth + 自有会话（JWT cookie）。
开发环境未配置 GITHUB_CLIENT_ID 时，提供 /api/dev/login 绕行（仅本地调试）。"""
import hashlib
import os
import time

import httpx
import jwt

CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
WEB_ORIGIN = os.environ.get("WEB_ORIGIN", "http://localhost:3000")
GITHUB_ADMIN_LOGINS = set(filter(None, os.environ.get("GITHUB_ADMIN_LOGINS", "").split(",")))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "think-admin")


def hash_password(password: str) -> str:
    return hashlib.sha256(("think:" + password).encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed


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
    if not configured() and login.startswith("admin"):
        return "admin"  # 本地开发绕行：admin* 默认给 editor 权限
    return "user"
