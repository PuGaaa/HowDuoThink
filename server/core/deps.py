"""路由层共享依赖：会话鉴权与编辑权限。
身份通道两种：Web 走 session cookie；App 走 Authorization: Bearer <jwt>。"""

from typing import Annotated

from fastapi import Cookie, Header, HTTPException

from core import security

SessionCookie = Annotated[str | None, Cookie(alias="session")]


def _uid_from_token(token: str | None) -> str | None:
    return security.verify_session(token) if token else None


def current_user(web_token: SessionCookie = None, authorization: Annotated[str | None, Header()] = None) -> str:
    token = web_token
    if authorization is not None:
        token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else None
    uid = _uid_from_token(token)
    if not uid:
        raise HTTPException(401, "未登录")
    # 封禁即时生效：每个请求查一次主键（量级小），banned 一律 403
    import db

    rows = db.q("SELECT status FROM users WHERE id=?", (uid,))
    if not rows:
        raise HTTPException(401, "用户不存在")
    if rows[0]["status"] == "banned":
        raise HTTPException(403, "账号已被封禁")
    return uid


def require_editor(uid: str) -> None:
    import db

    rows = db.q("SELECT role FROM users WHERE id=?", (uid,))
    if not rows or rows[0]["role"] not in ("editor", "admin"):
        raise HTTPException(403, "需要 editor 权限")


def require_admin(uid: str) -> None:
    """用户管理等敏感操作：仅 admin。"""
    import db

    rows = db.q("SELECT role FROM users WHERE id=?", (uid,))
    if not rows or rows[0]["role"] != "admin":
        raise HTTPException(403, "需要 admin 权限")
