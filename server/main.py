"""排错推理训练场 — 社区后端（FastAPI + SQLite）。
三对象：Submission（投稿）→ Case（关卡，过门禁）→ Article（Web 解决逻辑）。
App 同步：GET /api/casepack?since=version。"""
import logging
import time
import uuid
from pathlib import Path

import jwt
from typing import Annotated
from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

import db
import service_auth as auth_svc
import service_case as case_svc
import oauth_github as gh
from models import (
    CaseDraftBody, CaseMetaBody, CasePayload, LoginBody, PasswordChange,
    ProfileUpdate, SubmissionCreate, SubmissionStatusBody,
)

db.init()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("server")

app = FastAPI(title="排错推理训练场 · 社区后端", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[gh.WEB_ORIGIN, "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """每个请求发 8 位短 id：日志全带 [rid] 前缀，响应头回传，方便对账排查。"""
    rid = uuid.uuid4().hex[:8]
    request.state.rid = rid
    start = time.perf_counter()
    response = await call_next(request)
    logger.info("[%s] %s %s -> %s (%.0fms)", rid, request.method, request.url.path, response.status_code, (time.perf_counter() - start) * 1000)
    response.headers["X-Request-Id"] = rid
    return response


@app.exception_handler(Exception)
def on_unhandled(request: Request, exc: Exception):
    """全局兜底：内部细节（堆栈/SQL）只进服务端日志，响应只给通用文案。"""
    rid = getattr(request.state, "rid", "-")
    logger.exception("[%s] %s %s 未处理异常", rid, request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "服务器内部错误"})


# ---------- 会话 ----------

SessionCookie = Annotated[str | None, Cookie(alias="session")]


def current_user(web_token: SessionCookie = None) -> str:
    if not web_token:
        raise HTTPException(401, "未登录")
    uid = gh.verify_session(web_token)
    if not uid:
        raise HTTPException(401, "会话已过期")
    return uid


def require_editor(uid: str) -> None:
    rows = db.q("SELECT role FROM users WHERE id=?", (uid,))
    if not rows or rows[0]["role"] not in ("editor", "admin"):
        raise HTTPException(403, "需要 editor 权限")


# ---------- GitHub OAuth ----------

@app.get("/api/oauth/github/login")
def oauth_login():
    if not gh.configured():
        raise HTTPException(400, "GitHub OAuth 未配置（GITHUB_CLIENT_ID/SECRET）")
    state = uuid.uuid4().hex
    resp = RedirectResponse(gh.authorize_url(state))
    resp.set_cookie("oauth_state", state, max_age=600, httponly=True)
    return resp


@app.get("/api/oauth/github/callback")
def oauth_callback(code: str, state: str, oauth_state: Annotated[str | None, Cookie()] = None):
    if not oauth_state or oauth_state != state:
        raise HTTPException(400, "state 不匹配")
    try:
        u = gh.exchange_and_fetch(code)
    except Exception:
        logger.warning("[oauth] GitHub 回调失败", exc_info=True)
        raise HTTPException(502, "GitHub 登录失败，请稍后重试")
    auth_svc.upsert_oauth_user(u, gh.role_for(u["login"]))
    token = gh.sign_session(u["github_id"])
    resp = RedirectResponse(gh.WEB_ORIGIN + "/me")
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=gh.COOKIE_SECURE)
    return resp


@app.post("/api/auth/logout")
def logout():
    resp = RedirectResponse(gh.WEB_ORIGIN + "/", status_code=302)
    resp.delete_cookie("session")
    return resp


@app.post("/api/auth/login")
def auth_login(body: LoginBody):
    """账号密码登录：uid = 'pw-' + login（与 GitHub 用户同表不同命名空间）。"""
    user = auth_svc.verify_login(body.login, body.password)
    token = gh.sign_session(user["id"])
    resp = JSONResponse({"ok": True, "login": body.login, "role": user["role"]})
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=gh.COOKIE_SECURE)
    return resp


# 开发绕行：仅显式 ENV=dev 时可用（生产环境无论是否配置 OAuth 都返回 403）
@app.get("/api/dev/login")
def dev_login(login: str = Query(default="devuser")):
    if not gh.DEV_MODE:
        raise HTTPException(403, "开发绕行未开启（需 ENV=dev）")
    uid = auth_svc.dev_upsert_user(login)
    token = gh.sign_session(uid)
    resp = RedirectResponse(gh.WEB_ORIGIN + "/me")
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=gh.COOKIE_SECURE)
    return resp


@app.get("/api/me")
def me(uid: SessionCookie = None):
    uid_decoded = gh.verify_session(uid) if uid else None
    if not uid_decoded:
        raise HTTPException(401, "未登录")
    rows = db.q("SELECT id, login, name, avatar, role FROM users WHERE id=?", (uid_decoded,))
    if not rows:
        # cookie 有效但用户被清库（开发期常见）——按 dev 用户重建
        raise HTTPException(401, "用户不存在")
    r = rows[0]
    return {"id": r["id"], "login": r["login"], "name": r["name"], "avatar": r["avatar"], "role": r["role"]}


@app.patch("/api/me")
def update_me(body: ProfileUpdate, uid: str = Depends(current_user)):
    return auth_svc.update_profile(uid, body.name, body.avatar_url)


@app.post("/api/me/password")
def change_password(body: PasswordChange, uid: str = Depends(current_user)):
    auth_svc.change_password(uid, body.old_password, body.new_password)
    return {"ok": True}


# ---------- 投稿 ----------

@app.post("/api/submissions")
def create_submission(body: SubmissionCreate, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    sid = "s-" + uuid.uuid4().hex[:12]
    db.ex(
        "INSERT INTO submissions(id, user_id, title, symptom, resolution, key_error, timeline, lessons, stack_tags, domain_hint) "
        "VALUES(?,?,?,?,?,?,?,?,?,?)",
        (
            sid, uid, body.title, body.symptom, body.resolution,
            body.key_error, body.timeline, db.jdump(body.lessons), db.jdump(body.stack_tags), body.domain_hint,
        ),
    )
    return {"id": sid, "status": "pending"}


@app.get("/api/me/submissions")
def my_submissions(uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    rows = db.q("SELECT id, title, status, review_note, created_at FROM submissions WHERE user_id=? ORDER BY created_at DESC", (uid,))
    return [
        {"id": r["id"], "title": r["title"], "status": r["status"], "reviewNote": r["review_note"], "createdAt": r["created_at"]}
        for r in rows
    ]


# ---------- 解决逻辑（Web 列表/详情） ----------

@app.get("/api/solutions")
def solutions(layer: str | None = None, page: int = Query(default=1, ge=1), size: int = Query(default=20, ge=1, le=50)):
    where, params = "1=1", []
    if layer:
        where, params = "layer=?", [layer]
    rows = db.q(
        f"SELECT * FROM articles WHERE {where} ORDER BY published_at DESC LIMIT ? OFFSET ?",
        tuple(params) + (size, (page - 1) * size),
    )
    total = db.q(f"SELECT COUNT(*) AS n FROM articles WHERE {where}", tuple(params))[0]["n"]
    return {"total": total, "items": [case_svc.article_view(r) for r in rows]}


@app.get("/api/solutions/{article_id}")
def solution_detail(article_id: str):
    rows = db.q("SELECT * FROM articles WHERE id=?", (article_id,))
    if not rows:
        raise HTTPException(404, "不存在")
    return case_svc.article_view(rows[0])


# ---------- 管理端：投稿审核 ----------

@app.get("/api/admin/submissions")
def admin_submissions(uid: str = Depends(current_user), status: str | None = None):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    where, params = "1=1", []
    if status:
        where, params = "status=?", [status]
    rows = db.q(
        f"SELECT s.*, u.login AS author_login FROM submissions s LEFT JOIN users u ON u.id=s.user_id "
        f"WHERE {where} ORDER BY s.created_at DESC",
        tuple(params),
    )
    return [
        {
            "id": r["id"], "title": r["title"], "symptom": r["symptom"], "resolution": r["resolution"],
            "keyError": r["key_error"], "timeline": r["timeline"],
            "lessons": db.jload(r["lessons"], []), "stackTags": db.jload(r["stack_tags"], []),
            "domainHint": r["domain_hint"], "status": r["status"], "reviewNote": r["review_note"],
            "author": r["author_login"], "createdAt": r["created_at"],
        }
        for r in rows
    ]


@app.post("/api/admin/submissions/{sid}/status")
def set_submission_status(sid: str, body: SubmissionStatusBody, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    rows = db.q("SELECT id FROM submissions WHERE id=?", (sid,))
    if not rows:
        raise HTTPException(404, "投稿不存在")
    db.ex(
        "UPDATE submissions SET status=?, review_note=?, reviewed_at=datetime('now') WHERE id=?",
        (body.status, body.review_note, sid),
    )
    return {"id": sid, "status": body.status}


# ---------- 管理端：Case 草稿 CRUD ----------

@app.get("/api/admin/cases")
def admin_cases(uid: str = Depends(current_user), status: str | None = None):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    where, params = "1=1", []
    if status:
        where, params = "status=?", [status]
    rows = db.q(
        f"SELECT id, title, domain, layer, difficulty, version, status, created_at, published_at FROM cases "
        f"WHERE {where} ORDER BY created_at DESC",
        tuple(params),
    )
    return [dict(r) for r in rows]


@app.get("/api/admin/cases/{cid}")
def admin_case_detail(cid: str, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    rows = db.q("SELECT id, payload, status, version FROM cases WHERE id=?", (cid,))
    if not rows:
        raise HTTPException(404, "不存在")
    return {"id": rows[0]["id"], "payload": db.jload(rows[0]["payload"], {}), "status": rows[0]["status"], "version": rows[0]["version"]}


@app.post("/api/admin/cases")
def save_case_draft(body: CaseDraftBody, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return case_svc.save_case_draft(uid, body)


@app.patch("/api/admin/cases/{cid}/meta")
def update_case_meta(cid: str, body: CaseMetaBody, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return case_svc.update_case_meta(cid, body)


@app.post("/api/admin/submissions/{sid}/draft")
def create_draft_from_submission(sid: str, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return case_svc.create_draft_from_submission(uid, sid)


# ---------- Case 转化与发布（editor） ----------

@app.post("/api/cases")
def publish_case(payload: CasePayload, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    return case_svc.publish_case(uid, payload)


@app.get("/api/casepack")
def casepack(since: int = Query(default=0, ge=0)):
    rows = db.q("SELECT id, version, payload FROM cases WHERE status='published' AND version>? ORDER BY version", (since,))
    cases = [db.jload(r["payload"], {}) for r in rows]
    return {"version": db.current_version(), "count": len(cases), "cases": cases}


# ---------- 健康检查 ----------

@app.get("/api/health")
def health():
    return {"ok": True, "casepackVersion": db.current_version()}


@app.on_event("startup")
def seed_admin():
    """管理员引导：
    - 非 dev：仅当库里没有任何管理员时创建（密码必须来自 ADMIN_PASSWORD 环境变量），绝不覆盖已有密码；
    - ENV=dev：允许用 ADMIN_PASSWORD 重置 pw-admin，方便本地联调。"""
    if gh.JWT_SECRET_EPHEMERAL:
        logger.warning("未设置 JWT_SECRET，本次运行为进程内随机密钥（重启后所有会话失效；生产必须设置）")
    has_admin = db.q("SELECT id FROM users WHERE role='admin' LIMIT 1")
    if has_admin and not gh.DEV_MODE:
        return
    if not gh.ADMIN_PASSWORD:
        if not has_admin:
            logger.warning("库中无管理员且未设置 ADMIN_PASSWORD，跳过创建（设置环境变量后重启生效）")
        return
    db.ex(
        "INSERT INTO users(id, login, name, avatar, role, password_hash) VALUES('pw-admin', 'pw-admin', '管理员', '', 'admin', ?) "
        "ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash, role='admin'",
        (gh.hash_password(gh.ADMIN_PASSWORD),),
    )
