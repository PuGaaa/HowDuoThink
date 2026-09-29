"""GitHub OAuth 客户端：授权链接、code 换 token、用户信息获取。"""
import uuid

import httpx

from core import config


def configured() -> bool:
    return config.oauth_configured()


def new_state() -> str:
    return uuid.uuid4().hex


def authorize_url(state: str) -> str:
    return (
        "https://github.com/login/oauth/authorize"
        f"?client_id={config.CLIENT_ID}&redirect_uri={config.WEB_ORIGIN}/oauth/github/callback&state={state}&scope=read:user"
    )


def exchange_and_fetch(code: str) -> dict:
    """code → access_token → GitHub 用户信息。"""
    with httpx.Client(timeout=15) as client:
        token_res = client.post(
            "https://github.com/login/oauth/access_token",
            json={"client_id": config.CLIENT_ID, "client_secret": config.CLIENT_SECRET, "code": code},
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


def role_for(login: str) -> str:
    if login in config.GITHUB_ADMIN_LOGINS:
        return "admin"
    if config.DEV_MODE and login.startswith("admin"):
        return "admin"  # 本地开发绕行：仅 ENV=dev 时 admin* 给 editor 权限
    return "user"
