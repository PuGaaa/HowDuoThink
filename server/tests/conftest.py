"""测试环境引导：隔离临时库 + 环境变量必须在导入 app 前就位。
用法：cd server && /tmp/pilvenv/bin/python -m pytest tests/ -q"""

import atexit
import json
import os
from pathlib import Path

import pymysql
import pytest

# 环境与隔离库必须在 import main 之前就位
os.environ["JWT_SECRET"] = "test-secret-for-pytest-only-32bytes!!"  # HS256 建议至少 32 字节
os.environ["ADMIN_PASSWORD"] = "test-admin-pw"
os.environ.pop("ENV", None)  # 确保 dev 绕行关闭
# COOKIE_SECURE=1（HTTPS 部署用）会把会话 cookie 标 secure，httpx2 在 http 测试请求里
# 不回传 → 登录态全 401。测试是纯 http 环境，显式摘掉，避免被本地 .env.dev.local 泄进来。
os.environ.pop("COOKIE_SECURE", None)
os.environ["DB_PROVIDER"] = "mysql"
os.environ.setdefault("MYSQL_HOST", "127.0.0.1")
os.environ.setdefault("MYSQL_PORT", "3306")

# MySQL 引擎：每轮会话使用全新隔离库，会话结束回收
_MYSQL = dict(
    host=os.environ["MYSQL_HOST"],
    port=int(os.environ["MYSQL_PORT"]),
    user=os.environ["MYSQL_USER"],
    password=os.environ["MYSQL_PASSWORD"],
    charset="utf8mb4",
)
_TEST_DB = "hdt_test"
_admin = pymysql.connect(**_MYSQL)
with _admin.cursor() as cur:
    cur.execute("DROP DATABASE IF EXISTS hdt_test")
    cur.execute("CREATE DATABASE hdt_test CHARACTER SET utf8mb4")
_admin.commit()
_admin.close()
os.environ["MYSQL_DATABASE"] = _TEST_DB


def _drop_test_db() -> None:
    admin = pymysql.connect(**_MYSQL)
    with admin.cursor() as cur:
        cur.execute("DROP DATABASE IF EXISTS hdt_test")
    admin.commit()
    admin.close()


atexit.register(_drop_test_db)

# 配置在导入时读取，测试库必须在导入应用与执行迁移前固定。
from core import config as core_config  # noqa: E402

core_config.MYSQL_DATABASE = _TEST_DB
os.environ["MYSQL_DATABASE"] = _TEST_DB

from core import migrate  # noqa: E402

migrate.upgrade_head()

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


def make_client() -> TestClient:
    # starlette 1.10 的 TestClient 走 httpx2：其 cookie jar 会把单标签主机 testserver
    # 归一化成 testserver.local 存域，回传时与请求域 testserver 不匹配 → 登录态全挂。
    # base_url 换成带点的 testserver.local，两侧一致。
    return TestClient(main.app, base_url="http://testserver.local")


# 模块级 client（不进 with 上下文）不会触发 lifespan，seed_admin 不落库会让
# login_admin 401。引导期先手动跑一次 startup（幂等），此后模块级实例即可登录；
# 既有用例里的 with make_client() 重复执行 startup 也无害。
with TestClient(main.app):
    pass


def login_admin(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"login": "admin", "password": "test-admin-pw"})
    assert r.status_code == 200, r.text


def sse_events(resp) -> list[tuple[str, dict]]:
    """TestClient 收齐的 SSE 正文 → (event, data) 列表（测试专用解析）。"""
    out: list[tuple[str, dict]] = []
    for frame in resp.text.split("\n\n"):
        ev, data = None, {}
        for line in frame.splitlines():
            if line.startswith("event: "):
                ev = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        if ev is not None:
            out.append((ev, data))
    return out


@pytest.fixture(autouse=True)
def _reset_login_throttle():
    """用例间清空登录防爆破计数器：故意输错密码的用例（如 401 测试）会给
    pw:<login> 攒失败数，进程级 _LOGIN_FAILURES 不清就会让同 key 的后续
    用例整片撞 429（CI 上 settings/stats/submissions/users 的顺序耦合失败根源）。"""
    from features.auth import service as auth_service

    auth_service._LOGIN_FAILURES.clear()
    yield
    auth_service._LOGIN_FAILURES.clear()


def load_seed(case_id: str = "cache-drift") -> dict:
    # 测试 fixture 独立提交（server/seed/*.json 是不入 git 的构建产物）
    p = Path(__file__).parent / "fixtures" / f"{case_id}.json"
    return json.loads(p.read_text())
