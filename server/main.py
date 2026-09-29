"""排错推理训练场 — 社区后端（FastAPI + SQLite）。
Feature 架构：core/（横切）+ features/<域>/（router/service/models）。
本文件只做 app 工厂：中间件、日志、异常兜底、路由挂载、启动种子。
三对象：Submission（投稿）→ Case（关卡，过门禁）→ Article（Web 解决逻辑）。
App 同步：GET /api/casepack?since=version。"""
import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core import config
from features.auth.router import router as auth_router
from features.cases.router import router as cases_router
from features.submissions.router import router as submissions_router
from features.solutions.router import router as solutions_router
from features.sync.router import router as sync_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("server")


def create_app() -> FastAPI:
    """app 工厂：无 import 副作用（建库/建表由 db.init 显式调用）。"""
    import db

    db.init()

    app = FastAPI(title="排错推理训练场 · 社区后端", version="0.2.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[config.WEB_ORIGIN, "http://localhost:3000", "http://localhost:5173"],
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

    app.include_router(auth_router)
    app.include_router(submissions_router)
    app.include_router(solutions_router)
    app.include_router(cases_router)
    app.include_router(sync_router)

    @app.get("/api/health")
    def health():
        return {"ok": True, "casepackVersion": db.current_version()}

    @app.on_event("startup")
    def seed_admin():
        """管理员引导：
        - 非 dev：仅当库里没有任何管理员时创建（密码必须来自 ADMIN_PASSWORD 环境变量），绝不覆盖已有密码；
        - ENV=dev：允许用 ADMIN_PASSWORD 重置 pw-admin，方便本地联调。"""
        if config.JWT_SECRET_EPHEMERAL:
            logger.warning("未设置 JWT_SECRET，本次运行为进程内随机密钥（重启后所有会话失效；生产必须设置）")
        has_admin = db.q("SELECT id FROM users WHERE role='admin' LIMIT 1")
        if has_admin and not config.DEV_MODE:
            return
        if not config.ADMIN_PASSWORD:
            if not has_admin:
                logger.warning("库中无管理员且未设置 ADMIN_PASSWORD，跳过创建（设置环境变量后重启生效）")
            return
        from core import security

        db.ex(
            "INSERT INTO users(id, login, name, avatar, role, password_hash) VALUES('pw-admin', 'pw-admin', '管理员', '', 'admin', ?) "
            "ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash, role='admin'",
            (security.hash_password(config.ADMIN_PASSWORD),),
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
