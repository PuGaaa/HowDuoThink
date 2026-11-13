"""auth 路由：账密登录、手机验证码、dev 绕行、个人信息、密码。只做 参数→service→响应。"""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse

from core import config, security
from core.deps import current_user
from features.assets import oss
from features.assets import service as assets_service
from features.auth import models, service

logger = logging.getLogger("server")

router = APIRouter(tags=["auth"])


@router.post("/api/auth/logout")
def logout():
    resp = RedirectResponse(config.WEB_ORIGIN + "/", status_code=302)
    resp.delete_cookie("session")
    return resp


@router.post("/api/auth/login")
def auth_login(body: models.LoginBody):
    """账号密码登录：按已有账号或绑定手机号返回真实身份。"""
    user = service.verify_login(body.login, body.password)
    from features.stats import service as stats_service

    stats_service.touch(user["id"])  # 活跃打点（旁路）
    token = security.sign_session(user["id"])
    # token 同时放响应体：App 端存 storage 走 Bearer 头；Web 端走 cookie（忽略即可）
    resp = JSONResponse(
        {
            "ok": True,
            "login": user["login"],
            "role": user["role"],
            "userId": user["id"],
            "name": user["name"],
            "avatar": user["avatar"],
            "token": token,
        }
    )
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


@router.get("/api/auth/default-account")
def default_account_hint():
    """登录页提示探测：仅 ENV=dev。公开暴露等于给攻击者「初始密码是否还在用」的免费情报。"""
    if not config.DEV_MODE:
        raise HTTPException(404, "Not Found")
    return {"default": service.uses_default_password()}


@router.get("/api/me")
def me(uid: str = Depends(current_user)):
    return service.get_profile(uid)


@router.patch("/api/me")
def update_me(body: models.ProfileUpdate, uid: str = Depends(current_user)):
    return service.update_profile(uid, body.name, body.avatar_url)


@router.post("/api/me/password")
def change_password(body: models.PasswordChange, uid: str = Depends(current_user)):
    service.change_password(uid, body.old_password, body.new_password)
    return {"ok": True}


@router.post("/api/me/avatar")
def upload_my_avatar(file: UploadFile = File(...), uid: str = Depends(current_user)):
    """普通用户上传自己的头像：写 OSS（user-avatar 分类）→ 更新 users.avatar → 返回全量资料。"""
    # 读文件前的两道闸（同 assets 路由）：未配置先 503（不吃一次内存）；声明大小超限先 413
    if not oss.configured():
        raise HTTPException(503, "OSS 未配置：部署环境需补齐 OSS_* 环境变量")
    if file.size is not None and file.size > assets_service.USER_AVATAR_MAX_BYTES:
        raise HTTPException(413, "头像超过上限 2MB")
    # 整条同步路由在线程池执行：鉴权DB、读文件、OSS SDK和落库都不占事件循环。
    data = file.file.read()
    try:
        url = assets_service.upload_user_avatar(data, file.filename or "", uid)
    except assets_service.NotConfiguredError:
        raise HTTPException(503, "OSS 未配置：部署环境需补齐 OSS_* 环境变量")
    except assets_service.RateLimitError as e:
        raise HTTPException(429, str(e))
    except assets_service.AssetError as e:
        raise HTTPException(400, str(e))
    except assets_service.AssetUnavailableError as e:
        logger.warning("用户头像上传 OSS 写入失败：%s", e)
        raise HTTPException(502, "OSS 暂不可用，请稍后重试")
    profile = service.get_profile(uid)
    return service.update_profile(uid, profile["name"], url)


@router.post("/api/auth/sms/send")
def sms_send(body: models.SmsSendBody):
    """下发手机验证码；短信服务不可用时返回 503，不回显验证码。"""
    out = service.send_sms_code(body.phone)
    return out


@router.post("/api/auth/login/phone")
def phone_login(body: models.PhoneLoginBody):
    """手机验证码登录：新手机号自动建号（与 Web 注册互通的账号体系）。"""
    user = service.phone_login(body.phone, body.code)
    from features.stats import service as stats_service

    stats_service.touch(user["id"])
    token = security.sign_session(user["id"])
    resp = JSONResponse(
        {
            "ok": True,
            "login": user["login"],
            "role": user["role"],
            "userId": user["id"],
            "name": user["name"],
            "token": token,
        }
    )
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=config.COOKIE_SECURE)
    return resp


@router.post("/api/me/bind-phone")
def bind_phone(body: models.BindPhoneBody, uid: str = Depends(current_user)):
    """绑定手机号到当前账号：绑定后可用验证码登录同一账号。"""
    return service.bind_phone(uid, body.phone, body.code)


@router.post("/api/auth/password/reset/verify")
def password_reset_verify(body: models.PasswordResetVerifyBody):
    """忘记密码第一步：短信验证已注册手机号，换取短时重置票据（无需登录）。"""
    return {"resetToken": service.verify_password_reset_code(body.phone, body.code)}


@router.post("/api/auth/password/reset")
def password_reset(body: models.PasswordResetBody):
    """忘记密码第二步：凭重置票据免旧密码设新密码。"""
    service.reset_password_with_token(body.reset_token, body.new_password)
    return {"ok": True}
