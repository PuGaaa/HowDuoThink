"""好多星 — 社区后端（FastAPI + SQLite）。
Feature 架构：core/（横切）+ features/<域>/（router/service/models）。
本文件只做 app 工厂：中间件、日志、异常兜底、路由挂载、启动种子。
三对象：Submission（投稿）→ Case（关卡，过门禁）→ Article（Web 解决逻辑）。
App 同步：GET /api/casepack?since=version。"""

import logging
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from core import config
from features.ai.router import router as ai_router
from features.assets.router import router as assets_router
from features.auth.router import router as auth_router
from features.cases.router import router as cases_router
from features.ops.router import router as ops_router
from features.progress.router import router as progress_router
from features.settings.router import router as settings_router
from features.solutions.router import router as solutions_router
from features.stats.router import router as stats_router
from features.submissions.router import router as submissions_router
from features.sync.router import router as sync_router
from features.users.router import router as users_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("server")


def _init_sentry() -> None:
    """错误追踪：无 DSN 不启用（运行时降级；同一份代码所有环境）。"""
    if not config.SENTRY_DSN:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(
            dsn=config.SENTRY_DSN,
            environment=config.SENTRY_ENV,
            integrations=[FastApiIntegration()],
            send_default_pii=False,
        )
        logger.info("[sentry] 已启用（env=%s）", config.SENTRY_ENV)
    except Exception:
        logger.warning("[sentry] 初始化失败，错误追踪未启用", exc_info=True)


def create_app() -> FastAPI:
    """app 工厂：无 import 副作用（建库/建表由 Alembic boot-migrate 显式调用）。
    启动 fail-fast 三道检查按序执行（①JWT ②MySQL 连通 ③schema 版本），
    带病配置当场拒绝启动；短信缺少真实配置时在请求处返回 503；每次调用重复执行（幂等）。"""
    import db
    from core import db as coredb
    from core import migrate

    # ① 生产（非 dev）禁止进程内随机 JWT_SECRET：重启即全体会话失效
    if config.JWT_SECRET_EPHEMERAL and not config.DEV_MODE:
        raise RuntimeError("生产必须显式配置 JWT_SECRET（重启即全体会话失效）")

    # ② MySQL 连通：连不上当场拒绝，不带病进入服务
    try:
        conn = coredb.connect()
        try:
            conn.execute("SELECT 1")
        finally:
            conn.close()
    except Exception as e:
        raise RuntimeError("MySQL 连不通：检查 MYSQL_* 配置与服务状态") from e

    # ③ boot-migrate 到 head 后断言 schema 版本一致：防"入口没跑迁移就服务"的旁路
    migrate.upgrade_head()
    if migrate.current_version() != migrate.head_version():
        raise RuntimeError("schema 版本落后：容器入口未执行迁移，拒绝启动")

    _init_sentry()

    app = FastAPI(title="好多星 HowDuoThink · 社区后端", version="0.2.0")
    origins = [config.WEB_ORIGIN, "http://localhost:3000", "http://localhost:5173", config.APP_H5_ORIGIN]
    if config.ADMIN_WEB_ORIGIN:
        origins.append(config.ADMIN_WEB_ORIGIN)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def body_limit_guard(request: Request, call_next):
        """请求体上限（声明式 Content-Length）：无上限 body 是内存 DoS 面。
        分块传输无 Content-Length 时由端点级校验兜底（如上传的 file.size 检查）。"""
        cl = request.headers.get("content-length", "")
        if cl.isdigit() and int(cl) > config.BODY_LIMIT_MB * 1024 * 1024:
            return JSONResponse(status_code=413, content={"detail": "请求体过大"})
        return await call_next(request)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        """每个请求发 8 位短 id：日志全带 [rid] 前缀，响应头回传，方便对账排查。"""
        from features.ops import metrics

        rid = uuid.uuid4().hex[:8]
        request.state.rid = rid
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            metrics.record(500, duration_ms)
            raise
        duration_ms = (time.perf_counter() - start) * 1000
        metrics.record(response.status_code, duration_ms)
        logger.info(
            "[%s] %s %s -> %s (%.0fms)", rid, request.method, request.url.path, response.status_code, duration_ms
        )
        response.headers["X-Request-Id"] = rid
        return response

    @app.exception_handler(Exception)
    def on_unhandled(request: Request, exc: Exception):
        """全局兜底：内部细节（堆栈/SQL）只进服务端日志，响应只给通用文案。"""
        rid = getattr(request.state, "rid", "-")
        logger.exception("[%s] %s %s 未处理异常", rid, request.method, request.url.path)
        response = JSONResponse(status_code=500, content={"detail": "服务器内部错误"})
        response.headers["X-Request-Id"] = rid
        return response

    app.include_router(auth_router)
    app.include_router(ai_router)
    app.include_router(submissions_router)
    app.include_router(solutions_router)
    app.include_router(cases_router)
    app.include_router(sync_router)
    app.include_router(progress_router)
    app.include_router(users_router)
    app.include_router(stats_router)
    app.include_router(ops_router)
    app.include_router(settings_router)
    app.include_router(assets_router)

    # 管理端 SPA（独立工程构建产物）：目录存在才挂载，未构建时 /admin 404 不影响 API。
    # 手写 catch-all 而非 StaticFiles(html=True)：前端路由（/admin/users 等）需回退 index.html。
    admin_dist = Path(config.ADMIN_DIST_DIR)
    if not admin_dist.is_absolute():
        admin_dist = Path(__file__).resolve().parent / admin_dist
    if admin_dist.is_dir():
        admin_root = admin_dist.resolve()

        @app.get("/admin")
        def admin_root_redirect():
            return RedirectResponse("/admin/")

        @app.get("/admin/{path:path}")
        def admin_spa(path: str):
            candidate = (admin_root / path).resolve()
            if path and candidate.is_file() and candidate.is_relative_to(admin_root):
                return FileResponse(candidate)
            return FileResponse(admin_root / "index.html")

    @app.get("/api/health")
    def health():
        return {"ok": True, "casepackVersion": db.current_version()}

    @app.on_event("startup")
    def start_ops_snapshot():
        from features.ops import metrics

        metrics.start_snapshot_thread()

    @app.on_event("startup")
    def seed_admin():
        """管理员引导：
        - ADMIN_PASSWORD 已设置：用它（部署自动化）；ENV=dev 时每次重置，方便本地联调；
        - 未设置且库中无管理员：拒绝启动，避免新库带出已知凭据。"""
        if config.JWT_SECRET_EPHEMERAL:
            logger.warning("未设置 JWT_SECRET，本次运行为进程内随机密钥（重启后所有会话失效；生产必须设置）")
        has_admin = db.q("SELECT id FROM users WHERE role='admin' LIMIT 1")
        if not has_admin and not config.ADMIN_PASSWORD:
            raise RuntimeError("新库初始化必须显式配置 ADMIN_PASSWORD")
        if not config.ADMIN_PASSWORD:
            return
        if has_admin and not config.DEV_MODE:
            return
        pw = config.ADMIN_PASSWORD
        from core import security

        db.ex(
            "INSERT INTO users(id, login, name, avatar, role, password_hash) VALUES('pw-admin', 'pw-admin', '管理员', '', 'admin', ?) "
            "ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash, role='admin'",
            (security.hash_password(pw),),
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
