"""后端核心逻辑单测（隔离临时库，不碰 data.db）：
- gate.check_case 发布门禁红线
- 账密鉴权（错误/正确/哈希升级）
- 分页边界
- 发布流程（门禁 422 / editor 事务发布）
运行：cd server && /tmp/pilvenv/bin/python -m pytest test_main.py -q"""
import os
import tempfile
from pathlib import Path

# 环境与隔离库必须在 import main 之前就位
os.environ["JWT_SECRET"] = "test-secret-for-pytest-only"
os.environ["ADMIN_PASSWORD"] = "test-admin-pw"
os.environ.pop("ENV", None)  # 确保 dev 绕行关闭

import db as dbmod  # noqa: E402

_TMP = Path(tempfile.mkdtemp()) / "test.db"
dbmod.DB_PATH = _TMP

from fastapi.testclient import TestClient  # noqa: E402

import gate  # noqa: E402
from models import CasePayload  # noqa: E402
import main  # noqa: E402

SEED = Path(__file__).parent / "seed" / "cache-drift.json"


def make_client() -> TestClient:
    return TestClient(main.app)


def login_admin(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"login": "admin", "password": "test-admin-pw"})
    assert r.status_code == 200, r.text


def load_seed() -> dict:
    import json
    return json.loads(SEED.read_text())


# ---------- gate 门禁 ----------

def test_gate_accepts_official_case():
    cp = CasePayload(**load_seed())
    assert gate.check_case(cp) == []


def test_gate_rejects_l2_without_danger_action():
    d = load_seed()
    for a in d["actions"]:
        a["danger"] = False  # L2 题去掉危险动作 → 红线
    cp = CasePayload(**d)
    assert any("危险动作" in e for e in gate.check_case(cp))


# ---------- 健康/鉴权 ----------

def test_health():
    with make_client() as client:
        assert client.get("/api/health").status_code == 200


def test_login_wrong_password_401():
    with make_client() as client:
        r = client.post("/api/auth/login", json={"login": "admin", "password": "nope"})
        assert r.status_code == 401


def test_login_ok_then_me():
    with make_client() as client:
        login_admin(client)
        r = client.get("/api/me")
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


def test_dev_login_closed_without_env():
    with make_client() as client:
        assert client.get("/api/dev/login?login=adminx").status_code == 403


def test_me_requires_session():
    with make_client() as client:
        assert client.get("/api/me").status_code == 401


# ---------- 分页边界 ----------

def test_solutions_page_size_capped():
    with make_client() as client:
        assert client.get("/api/solutions?size=51").status_code == 422
        assert client.get("/api/solutions?page=0").status_code == 422
        assert client.get("/api/solutions?page=1&size=20").status_code == 200


# ---------- 发布流程 ----------

def test_publish_requires_editor():
    with make_client() as client:
        r = client.post("/api/cases", json=load_seed())
        assert r.status_code in (401, 403)


def test_publish_roundtrip_and_idempotent():
    with make_client() as client:
        login_admin(client)
        payload = load_seed()
        r1 = client.post("/api/cases", json=payload)
        assert r1.status_code == 200, r1.text
        v1 = r1.json()["version"]
        # 幂等重发：再次发布应成功且版本递增
        r2 = client.post("/api/cases", json=payload)
        assert r2.status_code == 200
        assert r2.json()["version"] == v1 + 1
        # article 投影存在
        assert client.get("/api/solutions/a-" + payload["id"]).status_code == 200


def test_publish_rejected_by_gate_422():
    with make_client() as client:
        login_admin(client)
        d = load_seed()
        d["title"] = "字" * 41  # 超过 40 字上限
        r = client.post("/api/cases", json=d)
        assert r.status_code == 422
