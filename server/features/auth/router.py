"""auth 路由：GitHub OAuth、账密登录、dev 绕行、个人信息、密码。只做 参数→service→响应。"""
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, RedirectResponse

from core import config, security
from core.deps import SessionCookie
from core.deps import current_user
from core import sms as sms_core
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
    service.ensure_active(u["github_id"])
    from features.stats import service as stats_service

    stats_service.touch(u["github_id"])
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
    from features.stats import service as stats_service

    stats_service.touch(user["id"])  # 活跃打点（旁路）
    token = security.sign_session(user["id"])
    # token 同时放响应体：App 端存 storage 走 Bearer 头；Web 端走 cookie（忽略即可）
    resp = JSONResponse({"ok": True, "login": body.login, "role": user["role"], "token": token})
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


@router.get("/api/auth/bootstrap")
def bootstrap_status():
    """登录页探测：系统是否还没有任何管理员（决定展示初始化向导）。公开只读。"""
    return {"needsBootstrap": service.needs_bootstrap()}


@router.post("/api/auth/bootstrap")
def bootstrap_create(body: models.BootstrapBody):
    """创建首个管理员：仅库中无 admin 时开放，创建后通道即闭。"""
    return service.bootstrap_admin(body.login.strip(), body.password)


@router.get("/api/me")
def me(uid: str = Depends(current_user)):
    import db

    rows = db.q("SELECT id, login, name, avatar, role FROM users WHERE id=?", (uid,))
    r = rows[0]
    return {"id": r["id"], "login": r["login"], "name": r["name"], "avatar": r["avatar"], "role": r["role"]}


@router.patch("/api/me")
def update_me(body: models.ProfileUpdate, uid: str = Depends(current_user)):
    return service.update_profile(uid, body.name, body.avatar_url)


@router.post("/api/me/password")
def change_password(body: models.PasswordChange, uid: str = Depends(current_user)):
    service.change_password(uid, body.old_password, body.new_password)
    return {"ok": True}


@router.post("/api/auth/sms/send")
def sms_send(body: models.SmsSendBody):
    """下发手机验证码；dev 模式响应带 devEcho 供联调（生产由短信服务下发）。"""
    out = service.send_sms_code(body.phone)
    return out


@router.post("/api/auth/login/phone")
def phone_login(body: models.PhoneLoginBody):
    """手机验证码登录：新手机号自动建号（与 Web 注册互通的账号体系）。"""
    user = service.phone_login(body.phone, body.code)
    from features.stats import service as stats_service

    stats_service.touch(user["id"])
    token = security.sign_session(user["id"])
    resp = JSONResponse({"ok": True, "login": user["login"], "role": user["role"], "userId": user["id"], "name": user["name"], "token": token})
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=config.COOKIE_SECURE)
    return resp


@router.post("/api/me/bind-phone")
def bind_phone(body: models.BindPhoneBody, uid: str = Depends(current_user)):
    """绑定手机号到当前账号：绑定后可用验证码登录同一账号。"""
    return service.bind_phone(uid, body.phone, body.code)
