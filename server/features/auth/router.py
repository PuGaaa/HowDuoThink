"""auth 路由：GitHub OAuth、账密登录、dev 绕行、个人信息、密码。只做 参数→service→响应。"""
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, RedirectResponse

from core import config, security
from core.deps import SessionCookie
from core.deps import current_user
from features.auth import models, oauth, service

router = APIRouter(tags=["auth"])


@router.get("/api/oauth/github/login")
def oauth_login():
    if not oauth.configured():
        raise HTTPException(400, "GitHub OAuth 未配置（GITHUB_CLIENT_ID/SECRET）")
    state = oauth.new_state()
    resp = RedirectResponse(oauth.authorize_url(state))
    resp.set_cookie("oauth_state", state, max_age=600, httponly=True)
    return resp


@router.get("/api/oauth/github/callback")
def oauth_callback(code: str, state: str, oauth_state: Annotated[str | None, Cookie()] = None):
    if not oauth_state or oauth_state != state:
        raise HTTPException(400, "state 不匹配")
    try:
        u = oauth.exchange_and_fetch(code)
    except Exception:
        import logging

        logging.getLogger("server").warning("[oauth] GitHub 回调失败", exc_info=True)
        raise HTTPException(502, "GitHub 登录失败，请稍后重试")
    service.upsert_oauth_user(u, oauth.role_for(u["login"]))
    token = security.sign_session(u["github_id"])
    resp = RedirectResponse(config.WEB_ORIGIN + "/me")
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=config.COOKIE_SECURE)
    return resp


@router.post("/api/auth/logout")
def logout():
    resp = RedirectResponse(config.WEB_ORIGIN + "/", status_code=302)
    resp.delete_cookie("session")
    return resp


@router.post("/api/auth/login")
def auth_login(body: models.LoginBody):
    """账号密码登录：uid = 'pw-' + login（与 GitHub 用户同表不同命名空间）。"""
    user = service.verify_login(body.login, body.password)
    token = security.sign_session(user["id"])
    resp = JSONResponse({"ok": True, "login": body.login, "role": user["role"]})
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=config.COOKIE_SECURE)
    return resp


# 开发绕行：仅显式 ENV=dev 时可用（生产环境无论是否配置 OAuth 都返回 403）
@router.get("/api/dev/login")
def dev_login(login: str = Query(default="devuser")):
    if not config.DEV_MODE:
        raise HTTPException(403, "开发绕行未开启（需 ENV=dev）")
    uid = service.dev_upsert_user(login)
    token = security.sign_session(uid)
    resp = RedirectResponse(config.WEB_ORIGIN + "/me")
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=config.COOKIE_SECURE)
    return resp


@router.get("/api/me")
def me(uid: SessionCookie = None):
    uid_decoded = security.verify_session(uid) if uid else None
    if not uid_decoded:
        raise HTTPException(401, "未登录")
    import db

    rows = db.q("SELECT id, login, name, avatar, role FROM users WHERE id=?", (uid_decoded,))
    if not rows:
        raise HTTPException(401, "用户不存在")
    r = rows[0]
    return {"id": r["id"], "login": r["login"], "name": r["name"], "avatar": r["avatar"], "role": r["role"]}


@router.patch("/api/me")
def update_me(body: models.ProfileUpdate, uid: str = Depends(current_user)):
    return service.update_profile(uid, body.name, body.avatar_url)


@router.post("/api/me/password")
def change_password(body: models.PasswordChange, uid: str = Depends(current_user)):
    service.change_password(uid, body.old_password, body.new_password)
    return {"ok": True}
