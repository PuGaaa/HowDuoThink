"""测试环境引导：隔离临时库 + 环境变量必须在导入 app 前就位。
用法：cd server && /tmp/pilvenv/bin/python -m pytest tests/ -q"""

import atexit
import os
from pathlib import Path

import pymysql

# 环境与隔离库必须在 import main 之前就位
os.environ["JWT_SECRET"] = "test-secret-for-pytest-only-32bytes!!"  # HS256 建议至少 32 字节
os.environ["ADMIN_PASSWORD"] = "test-admin-pw"
os.environ.pop("ENV", None)  # 确保 dev 绕行关闭
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
_TEST_DB = "hdt_test_%d" % os.getpid()
_admin = pymysql.connect(**_MYSQL)
with _admin.cursor() as cur:
    cur.execute("DROP DATABASE IF EXISTS " + _TEST_DB)
    cur.execute("CREATE DATABASE " + _TEST_DB + " CHARACTER SET utf8mb4")
_admin.commit()
_admin.close()
os.environ["MYSQL_DATABASE"] = _TEST_DB


def _drop_test_db() -> None:
    admin = pymysql.connect(**_MYSQL)
    with admin.cursor() as cur:
        cur.execute("DROP DATABASE IF EXISTS " + _TEST_DB)
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
    return TestClient(main.app)


def login_admin(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"login": "admin", "password": "test-admin-pw"})
    assert r.status_code == 200, r.text


def load_seed(case_id: str = "cache-drift") -> dict:
    import json

    # 测试 fixture 独立提交（server/seed/*.json 是不入 git 的构建产物）
    p = Path(__file__).parent / "fixtures" / f"{case_id}.json"
    return json.loads(p.read_text())
