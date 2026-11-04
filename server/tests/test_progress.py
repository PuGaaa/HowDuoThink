"""progress 域：旧全量写入停用边界与进度读取。"""

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


def test_legacy_progress_put_is_rejected_without_mutation():
    with make_client() as client:
        login_admin(client)
        r = client.post("/api/me/progress", json=BLOB_V1)
        assert r.status_code == 426
        g = client.get("/api/me/progress").json()
        assert g["cases"] == {}
