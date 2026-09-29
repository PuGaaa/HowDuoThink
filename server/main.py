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
import gate
import oauth_github as gh
from models import (
    ArticleOut, CaseDraftBody, CaseMetaBody, CasePayload, LoginBody,
    PasswordChange, ProfileUpdate, SubmissionCreate, SubmissionStatusBody, StepOut,
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
    role = gh.role_for(u["login"])
    db.ex(
        "INSERT INTO users(id, login, name, avatar, role) VALUES(?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET login=excluded.login, name=excluded.name, avatar=excluded.avatar, role=excluded.role",
        (u["github_id"], u["login"], u["name"], u["avatar"], role),
    )
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
    rows = db.q("SELECT id, password_hash, role FROM users WHERE id=?", ("pw-" + body.login,))
    if not rows or not rows[0]["password_hash"] or not gh.verify_password(body.password, rows[0]["password_hash"]):
        raise HTTPException(401, "账号或密码错误")
    # 历史无盐哈希在登录成功时静默升级为 bcrypt
    if gh.is_legacy_hash(rows[0]["password_hash"]):
        db.ex("UPDATE users SET password_hash=? WHERE id=?", (gh.hash_password(body.password), rows[0]["id"]))
    token = gh.sign_session(rows[0]["id"])
    resp = JSONResponse({"ok": True, "login": body.login, "role": rows[0]["role"]})
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True, samesite="lax", secure=gh.COOKIE_SECURE)
    return resp


# 开发绕行：仅显式 ENV=dev 时可用（生产环境无论是否配置 OAuth 都返回 403）
@app.get("/api/dev/login")
def dev_login(login: str = Query(default="devuser")):
    if not gh.DEV_MODE:
        raise HTTPException(403, "开发绕行未开启（需 ENV=dev）")
    uid = "dev-" + login
    db.ex(
        "INSERT INTO users(id, login, name, avatar, role) VALUES(?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET login=excluded.login",
        (uid, login, login, "", gh.role_for(login)),
    )
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
    sets, params = ["name=?"], [body.name]
    if body.avatar_url is not None:
        sets.append("avatar=?")
        params.append(body.avatar_url)
    params.append(uid)
    db.ex(f"UPDATE users SET {', '.join(sets)} WHERE id=?", tuple(params))
    rows = db.q("SELECT id, login, name, avatar, role FROM users WHERE id=?", (uid,))
    r = rows[0]
    return {"id": r["id"], "login": r["login"], "name": r["name"], "avatar": r["avatar"], "role": r["role"]}


@app.post("/api/me/password")
def change_password(body: PasswordChange, uid: str = Depends(current_user)):
    rows = db.q("SELECT password_hash FROM users WHERE id=?", (uid,))
    if not rows:
        raise HTTPException(404, "用户不存在")
    current_hash = rows[0]["password_hash"]
    # GitHub 用户没有密码：允许直接设置；账密用户必须校验旧密码
    if current_hash:
        if not body.old_password:
            raise HTTPException(400, "请输入当前密码")
        if not gh.verify_password(body.old_password, current_hash):
            raise HTTPException(400, "当前密码错误")
    db.ex("UPDATE users SET password_hash=? WHERE id=?", (gh.hash_password(body.new_password), uid))
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

def article_out(r) -> dict:
    steps = [StepOut(no=i + 1, observe=s["observe"], act=s["act"], found=s["found"]) for i, s in enumerate(db.jload(r["steps"], []))]
    return ArticleOut(
        id=r["id"], title=r["title"], layer=r["layer"], domain=r["domain"],
        steps=steps, lessons=db.jload(r["lessons"], []), author=r["author"], published_at=r["published_at"],
    ).model_dump()


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
    return {"total": total, "items": [article_out(r) for r in rows]}


@app.get("/api/solutions/{article_id}")
def solution_detail(article_id: str):
    rows = db.q("SELECT * FROM articles WHERE id=?", (article_id,))
    if not rows:
        raise HTTPException(404, "不存在")
    return article_out(rows[0])


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
    """保存草稿：不跑门禁（draft 允许半成品），只要求 id。发布走 POST /api/cases。"""
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    cid = body.id
    payload = body.payload or {}
    payload["id"] = cid
    exists = db.q("SELECT id, status, version FROM cases WHERE id=?", (cid,))
    if exists:
        db.ex("UPDATE cases SET payload=?, title=? WHERE id=?",
              (db.jdump(payload), str(payload.get("title", "")), cid))
        return {"id": cid, "status": exists[0]["status"]}
    db.ex(
        "INSERT INTO cases(id, submission_id, author_id, title, domain, layer, difficulty, version, status, payload) "
        "VALUES(?,?,?,?,?,?,?,?,?,?)",
        (cid, body.submission_id, uid, str(payload.get("title", "")), "", "", 1, 0, "draft", db.jdump(payload)),
    )
    return {"id": cid, "status": "draft"}


def draft_from_submission(sid: str) -> dict:
    """投稿 → Case 草稿骨架：必填字段自动映射，重字段填占位（编辑器里可见待补）。"""
    rows = db.q("SELECT * FROM submissions WHERE id=?", (sid,))
    if not rows:
        raise HTTPException(404, "投稿不存在")
    s = rows[0]
    title = s["title"]
    symptoms = [{"type": "text", "title": "现象描述", "text": s["symptom"]}]
    if s["key_error"]:
        symptoms.insert(0, {"type": "error", "title": "关键报错", "text": s["key_error"]})
    timeline = s["timeline"] or "时间线待补充"
    # 解决过程按行拆分为专家链骨架：每行 → 观察( thought )，动作占位
    chain = []
    lines = [ln.strip() for ln in s["resolution"].replace("；", "\n").replace("。", "\n").split("\n") if ln.strip()]
    for i, ln in enumerate(lines[:8]):
        chain.append({
            "thought": ln[:120],
            "update": "（待补充：这一步假设如何更新）",
            "actionId": "",
            "why": "（待补充：为什么这一步值这个成本）",
            "conclusion": "（待补充：排除了什么/确认了什么）",
        })
    if not chain:
        chain.append({"thought": "（待补充）", "update": "（待补充）", "actionId": "", "why": "（待补充）", "conclusion": "（待补充）"})
    while len(chain) < 4:
        chain.append({"thought": "（待补充）", "update": "（待补充）", "actionId": "", "why": "（待补充）", "conclusion": "（待补充）"})
    lessons = db.jload(s["lessons"], [])
    lesson_list = [{"text": l, "principle": "（待补充：这一层的契约）"} for l in lessons]
    lesson_list.append({"text": "（待补充检查单）", "principle": "（待补充原理）"})
    pid = "c-" + sid.replace("s-", "")
    part_guess = {"network": "access", "data": "data", "build": "build", "runtime": "runtime", "concurrency": "concurrency", "deploy": "access"}.get(s["domain_hint"] or "", "")
    return {
        "id": pid,
        "title": title,
        "intro": title,
        "domain": s["domain_hint"] or "network",
        "layer": "（待补充层契约）",
        "part": part_guess or "apprentice",
        "chapterId": part_guess or "",
        "order": 99,
        "typeTags": [],
        "difficulty": 1,
        "scene": {
            "role": "（待补充：玩家角色代入）",
            "architecture": "（待补充：链路图）",
            "symptoms": symptoms,
            "timeline": timeline,
            "impactHint": "（待补充）",
        },
        "hypotheses": [
            {"id": "h-a", "text": "（待补充假设A）", "excludeActionId": ""},
            {"id": "h-b", "text": "（待补充假设B）", "excludeActionId": ""},
            {"id": "h-c", "text": "（待补充假设C）", "excludeActionId": ""},
        ],
        "actions": [
            {"id": "act-1", "name": "（待补充动作）", "desc": "（待补充）", "cost": 1, "gain": "high",
             "danger": False, "effects": [], "tests": [], "hypotheses": [],
             "result": {"type": "text", "title": "（待补充）", "text": "（待补充）"}},
        ],
        "rootCauses": [
            {"id": "rc-a", "text": "（待补充根因A）", "correct": False},
            {"id": "rc-b", "text": "（待补充根因B）", "correct": False},
            {"id": "rc-c", "text": "（待补充根因C）", "correct": False},
        ],
        "expertCost": 5,
        "restartActionId": "",
        "expertChain": chain,
        "lessons": lesson_list,
    }


@app.patch("/api/admin/cases/{cid}/meta")
def update_case_meta(cid: str, body: CaseMetaBody, uid: str = Depends(current_user)):
    """结构化更新三级架构元数据（part/chapterId/order/typeTags），不动正文。"""
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    rows = db.q("SELECT payload FROM cases WHERE id=?", (cid,))
    if not rows:
        raise HTTPException(404, "不存在")
    payload = db.jload(rows[0]["payload"], {})
    if body.part:
        payload["part"] = body.part
    if body.chapter_id is not None:
        payload["chapterId"] = body.chapter_id
    if body.order is not None:
        payload["order"] = body.order
    if body.type_tags is not None:
        payload["typeTags"] = [t.strip() for t in body.type_tags if t.strip()]
    db.ex("UPDATE cases SET payload=? WHERE id=?", (db.jdump(payload), cid))
    return {"ok": True, "meta": {"part": payload.get("part"), "chapterId": payload.get("chapterId"), "order": payload.get("order"), "typeTags": payload.get("typeTags")}}


@app.post("/api/admin/submissions/{sid}/draft")
def create_draft_from_submission(sid: str, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    payload = draft_from_submission(sid)
    with db.tx() as conn:
        conn.execute(
            "INSERT INTO cases(id, submission_id, author_id, title, domain, layer, difficulty, version, status, payload) "
            "VALUES(?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
            (payload["id"], sid, uid, payload["title"], payload["domain"], payload["layer"], payload["difficulty"], 0, "draft", db.jdump(payload)),
        )
        conn.execute(
            "UPDATE submissions SET status='accepted', reviewed_at=datetime('now') WHERE id=? AND status='pending'", (sid,)
        )
    return {"caseId": payload["id"], "submissionId": sid, "status": "draft"}


# ---------- Case 转化与发布（editor） ----------

def upsert_article_from_case(conn, payload: CasePayload, author: str) -> str:
    """在给定事务连接上投影 Case → Article（发布流程的原子部分）。"""
    article_id = "a-" + payload.id
    # 步骤化解决逻辑：从 expertChain 投影（Web 展示"最终解决逻辑"）
    steps = []
    for st in payload.expert_chain:
        act = st.action_id
        act_name = next((a.name for a in payload.actions if a.id == act), "")
        steps.append({
            "observe": st.thought,
            "act": act_name if act else "（推理收束，停止收集）",
            "found": st.conclusion,
        })
    lessons = [l.text for l in payload.lessons]
    conn.execute(
        "INSERT INTO articles(id, source_type, source_id, title, layer, domain, steps, lessons, author) "
        "VALUES(?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET title=excluded.title, layer=excluded.layer, steps=excluded.steps, "
        "lessons=excluded.lessons, author=excluded.author, published_at=datetime('now')",
        (article_id, "case", payload.id, payload.title, payload.layer, payload.domain,
         db.jdump(steps), db.jdump(lessons), author),
    )
    return article_id


@app.post("/api/cases")
def publish_case(payload: CasePayload, uid: str = Depends(current_user)):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    errors = gate.check_case(payload)
    if errors:
        raise HTTPException(422, {"message": "未过发布门禁", "errors": errors})
    # 来源与署名：关联投稿 → 投稿者昵称；官方题 → "官方"
    sub_id = None
    author_name = "官方"
    crow = db.q("SELECT submission_id, author_id FROM cases WHERE id=?", (payload.id,))
    if crow and crow[0]["submission_id"]:
        sub_id = crow[0]["submission_id"]
        srow = db.q(
            "SELECT u.name, u.login FROM submissions s LEFT JOIN users u ON u.id=s.user_id WHERE s.id=?",
            (sub_id,),
        )
        if srow and (srow[0]["name"] or srow[0]["login"]):
            author_name = srow[0]["name"] or ("@" + srow[0]["login"])
    d = payload.model_dump(by_alias=True)
    d["submissionId"] = sub_id
    d["authorName"] = author_name
    exists = db.q("SELECT id FROM cases WHERE id=?", (payload.id,))
    # 版本号 + cases + articles 三写同事务：中途失败整体回滚，版本号不虚增
    with db.tx() as conn:
        version_row = conn.execute("SELECT value FROM meta WHERE key='casepack_version'").fetchone()
        version = (int(version_row["value"]) if version_row else 0) + 1
        conn.execute(
            "INSERT INTO meta(key, value) VALUES('casepack_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (str(version),),
        )
        if exists:
            conn.execute(
                "UPDATE cases SET payload=?, title=?, domain=?, layer=?, difficulty=?, version=?, status='published', published_at=datetime('now') WHERE id=?",
                (db.jdump(d), payload.title, payload.domain, payload.layer, payload.difficulty, version, payload.id),
            )
        else:
            conn.execute(
                "INSERT INTO cases(id, submission_id, author_id, title, domain, layer, difficulty, version, status, payload, published_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'))",
                (payload.id, sub_id, uid, payload.title, payload.domain, payload.layer, payload.difficulty, version, "published",
                 db.jdump(d)),
            )
        article_id = upsert_article_from_case(conn, payload, author_name)
    return {"id": payload.id, "version": version, "articleId": article_id}


# ---------- App 同步 ----------

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
