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
