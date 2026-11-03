"""测试环境引导：隔离临时库 + 环境变量必须在导入 app 前就位。
用法：cd server && /tmp/pilvenv/bin/python -m pytest tests/ -q"""

import os
import tempfile
from pathlib import Path

# 环境与隔离库必须在 import main 之前就位
os.environ["JWT_SECRET"] = "test-secret-for-pytest-only-32bytes!!"  # HS256 建议至少 32 字节
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

    # config 在 import 时已读走 os.environ，必须直接改配置模块才能真正切到隔离库
    # （历史 bug：只改 os.environ 不生效，MySQL 轮测试实际跑在配置指向的真实库上）
    from core import config as core_config

    core_config.MYSQL_DATABASE = _TEST_DB
    os.environ["MYSQL_DATABASE"] = _TEST_DB

# 建表必须显式：legacy 靠 import main → create_app → db.init() 的隐式链，init 退役后
# 由 Alembic boot-migrate 接管。位置约束：DB_PATH / config 补丁之后、import main 之前
# （upgrade_head 调用时现读 core.db.DB_PATH 与 core.config，打补丁先于建表才落到隔离库）。
# SQLite 与 MySQL 两分支共用这一次调用。
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
