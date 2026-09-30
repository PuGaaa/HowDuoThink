"""路由层共享依赖：会话鉴权与编辑权限。
身份通道两种：Web 走 session cookie；App 走 Authorization: Bearer <jwt>。"""
from typing import Annotated

from fastapi import Cookie, Header, HTTPException

from core import security

SessionCookie = Annotated[str | None, Cookie(alias="session")]


def _uid_from_token(token: str | None) -> str | None:
    return security.verify_session(token) if token else None


def current_user(web_token: SessionCookie = None, authorization: Annotated[str | None, Header()] = None) -> str:
    uid = _uid_from_token(web_token)
    if not uid and authorization and authorization.lower().startswith("bearer "):
        uid = _uid_from_token(authorization[7:].strip())
    if not uid:
        raise HTTPException(401, "未登录")
    return uid


def require_editor(uid: str) -> None:
    import db

    rows = db.q("SELECT role FROM users WHERE id=?", (uid,))
    if not rows or rows[0]["role"] not in ("editor", "admin"):
        raise HTTPException(403, "需要 editor 权限")
