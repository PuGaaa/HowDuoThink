"""progress 域：进度云同步三用例（未登录 401 / 上传拉取一致 / 覆盖语义）。"""

from tests.conftest import login_admin, make_client

BLOB_V1 = {
    "cases": {
        "dns-hijack": {"solved": False, "bestGrade": "F", "bestCost": 7, "plays": 2, "fails": 2},
    }
}
BLOB_V2 = {
    "cases": {
        "dns-hijack": {"solved": True, "bestGrade": "A", "bestCost": 4, "plays": 3, "fails": 2},
        "cors-101": {"solved": True, "bestGrade": "B", "bestCost": 5, "plays": 1},
    }
}


def test_progress_requires_auth():
    with make_client() as client:
        assert client.get("/api/me/progress").status_code == 401
        assert client.post("/api/me/progress", json=BLOB_V1).status_code == 401


def test_progress_put_then_get():
    with make_client() as client:
        login_admin(client)
        r = client.post("/api/me/progress", json=BLOB_V1)
        assert r.status_code == 200
        g = client.get("/api/me/progress").json()
        assert g["cases"]["dns-hijack"]["bestGrade"] == "F"
        # 失败留痕字段不被丢弃
        assert g["cases"]["dns-hijack"]["fails"] == 2
        assert g["updatedAt"]


def test_progress_overwrite_semantics():
    with make_client() as client:
        login_admin(client)
        client.post("/api/me/progress", json=BLOB_V1)
        client.post("/api/me/progress", json=BLOB_V2)
        g = client.get("/api/me/progress").json()
        # 整体覆盖：v2 有 cors、dns 被 v2 值覆盖
        assert "cors-101" in g["cases"]
        assert g["cases"]["dns-hijack"]["bestGrade"] == "A"
