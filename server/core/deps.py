"""路由层共享依赖：会话鉴权与编辑权限。"""
from typing import Annotated

from fastapi import Cookie, HTTPException

from core import security

SessionCookie = Annotated[str | None, Cookie(alias="session")]


def current_user(web_token: SessionCookie = None) -> str:
    if not web_token:
        raise HTTPException(401, "未登录")
    uid = security.verify_session(web_token)
    if not uid:
        raise HTTPException(401, "会话已过期")
    return uid


def require_editor(uid: str) -> None:
    import db

    rows = db.q("SELECT role FROM users WHERE id=?", (uid,))
    if not rows or rows[0]["role"] not in ("editor", "admin"):
        raise HTTPException(403, "需要 editor 权限")
