"""测试环境引导：隔离临时库 + 环境变量必须在导入 app 前就位。
用法：cd server && /tmp/pilvenv/bin/python -m pytest tests/ -q"""
import os
import tempfile
from pathlib import Path

# 环境与隔离库必须在 import main 之前就位
os.environ["JWT_SECRET"] = "test-secret-for-pytest-only"
os.environ["ADMIN_PASSWORD"] = "test-admin-pw"
os.environ.pop("ENV", None)  # 确保 dev 绕行关闭

import db as dbmod  # noqa: E402  (兼容 shim)
from core import db as coredb  # noqa: E402

_TMP = Path(tempfile.mkdtemp()) / "test.db"
# 两处都要指：函数实际读 core.db.DB_PATH；shim 只是历史兼容面
coredb.DB_PATH = _TMP
dbmod.DB_PATH = _TMP

# MySQL 引擎（DB_PROVIDER=mysql）：每轮会话使用全新隔离库，会话结束回收
if os.environ.get("DB_PROVIDER") == "mysql":
    import atexit

    import pymysql

    _MYSQL = dict(
        host=os.environ.get("MYSQL_HOST", "127.0.0.1"),
        port=int(os.environ.get("MYSQL_PORT", "13306")),
        user=os.environ.get("MYSQL_USER", "root"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
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
        try:
            admin = pymysql.connect(**_MYSQL)
            with admin.cursor() as cur:
                cur.execute("DROP DATABASE IF EXISTS " + _TEST_DB)
            admin.commit()
            admin.close()
        except Exception:
            pass

    atexit.register(_drop_test_db)

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


def make_client() -> TestClient:
    return TestClient(main.app)


def login_admin(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"login": "admin", "password": "test-admin-pw"})
    assert r.status_code == 200, r.text


def load_seed(case_id: str = "cache-drift") -> dict:
    import json

    p = Path(__file__).parent.parent / "seed" / f"{case_id}.json"
    return json.loads(p.read_text())
