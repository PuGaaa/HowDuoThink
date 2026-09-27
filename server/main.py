"""排错推理训练场 — 社区后端（FastAPI + SQLite）。
三对象：Submission（投稿）→ Case（关卡，过门禁）→ Article（Web 解决逻辑）。
App 同步：GET /api/casepack?since=version。"""
import uuid
from pathlib import Path

import jwt
from typing import Annotated
from fastapi import Cookie, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

import db
import gate
import oauth_github as gh
from models import ArticleOut, CasePayload, SubmissionCreate, StepOut

db.init()

app = FastAPI(title="排错推理训练场 · 社区后端", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[gh.WEB_ORIGIN, "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- 会话 ----------

SessionCookie = Annotated[str | None, Cookie(alias="session")]


def current_user(web_token: SessionCookie) -> str:
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
    except Exception as e:
        raise HTTPException(502, str(e))
    role = gh.role_for(u["login"])
    db.ex(
        "INSERT INTO users(id, login, name, avatar, role) VALUES(?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET login=excluded.login, name=excluded.name, avatar=excluded.avatar, role=excluded.role",
        (u["github_id"], u["login"], u["name"], u["avatar"], role),
    )
    token = gh.sign_session(u["github_id"])
    resp = RedirectResponse(gh.WEB_ORIGIN + "/me")
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True)
    return resp


# 开发绕行：未配置 GitHub 时本地造会话（生产环境设置 GITHUB_CLIENT_ID 后自动失效）
@app.get("/api/dev/login")
def dev_login(login: str = Query(default="devuser")):
    if gh.configured():
        raise HTTPException(403, "已配置 GitHub OAuth，开发绕行不可用")
    uid = "dev-" + login
    db.ex(
        "INSERT INTO users(id, login, name, avatar, role) VALUES(?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET login=excluded.login",
        (uid, login, login, "", gh.role_for(login)),
    )
    token = gh.sign_session(uid)
    resp = RedirectResponse(gh.WEB_ORIGIN + "/me")
    resp.set_cookie("session", token, max_age=30 * 86400, httponly=True)
    return resp


@app.get("/api/me")
def me(uid: str = Cookie(default=None, alias="session")):
    if not uid:
        raise HTTPException(401, "未登录")
    rows = db.q("SELECT id, login, name, avatar, role FROM users WHERE id=?", (uid,))
    if not rows:
        # cookie 有效但用户被清库（开发期常见）——按 dev 用户重建
        raise HTTPException(401, "用户不存在")
    r = rows[0]
    return {"id": r["id"], "login": r["login"], "name": r["name"], "avatar": r["avatar"], "role": r["role"]}


# ---------- 投稿 ----------

@app.post("/api/submissions")
def create_submission(body: SubmissionCreate, uid: SessionCookie):
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
def my_submissions(uid: SessionCookie):
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
def solutions(layer: str | None = None, page: int = 1, size: int = 20):
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


# ---------- Case 转化与发布（editor） ----------

def upsert_article_from_case(payload: CasePayload, author: str) -> str:
    article_id = "a-" + payload.id
    # 步骤化解决逻辑：从 expertChain 投影（Web 展示"最终解决逻辑"）
    steps = []
    no = 1
    for st in payload.expert_chain:
        act = st.action_id
        act_name = next((a.name for a in payload.actions if a.id == act), "")
        steps.append({
            "observe": st.thought,
            "act": act_name if act else "（推理收束，停止收集）",
            "found": st.conclusion,
        })
        no += 1
    lessons = [l.text for l in payload.lessons]
    db.ex(
        "INSERT INTO articles(id, source_type, source_id, title, layer, domain, steps, lessons, author) "
        "VALUES(?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET title=excluded.title, layer=excluded.layer, steps=excluded.steps, "
        "lessons=excluded.lessons, author=excluded.author, published_at=datetime('now')",
        (article_id, "case", payload.id, payload.title, payload.layer, payload.domain,
         db.jdump(steps), db.jdump(lessons), author),
    )
    return article_id


@app.post("/api/cases")
def publish_case(payload: CasePayload, uid: str = Cookie(default=None, alias="session")):
    if not uid:
        raise HTTPException(401, "未登录")
    require_editor(uid)
    errors = gate.check_case(payload)
    if errors:
        raise HTTPException(422, {"message": "未过发布门禁", "errors": errors})
    version = db.next_version()
    exists = db.q("SELECT id FROM cases WHERE id=?", (payload.id,))
    if exists:
        db.ex(
            "UPDATE cases SET payload=?, title=?, domain=?, layer=?, difficulty=?, version=?, status='published', published_at=datetime('now') WHERE id=?",
            (db.jdump(payload.model_dump(by_alias=True)), payload.title, payload.domain, payload.layer, payload.difficulty, version, payload.id),
        )
    else:
        db.ex(
            "INSERT INTO cases(id, submission_id, author_id, title, domain, layer, difficulty, version, status, payload, published_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'))",
            (payload.id, None, uid, payload.title, payload.domain, payload.layer, payload.difficulty, version, "published",
             db.jdump(payload.model_dump(by_alias=True))),
        )
    article_id = upsert_article_from_case(payload, "社区")
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
