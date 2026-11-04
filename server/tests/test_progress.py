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


def test_progress_sync_is_idempotent_and_account_scoped():
    with make_client() as client:
        login_admin(client)
        op = {
            "opId": "session-1",
            "kind": "session_end",
            "occurredAt": "2026-11-04T10:00:00.000Z",
            "payload": {
                "caseId": "dns-hijack",
                "solved": True,
                "grade": "A",
                "playerCost": 4,
                "mascotEvents": [{"id": "frog"}],
            },
        }
        first = client.post("/api/me/progress/sync", json={"operations": [op]})
        assert first.status_code == 200
        assert first.json()["revision"] == 1
        assert first.json()["cases"]["dns-hijack"]["plays"] == 1
        second = client.post("/api/me/progress/sync", json={"operations": [op]})
        assert second.status_code == 200
        assert second.json()["revision"] == 1
        assert second.json()["cases"]["dns-hijack"]["plays"] == 1
        assert second.json()["mascots"]["frog"] == 1


def test_progress_sync_projects_tasks_by_operation_time():
    with make_client() as client:
        login_admin(client)
        ops = [
            {
                "opId": "task-1",
                "kind": "task_increment",
                "occurredAt": "2026-11-04T15:00:00.000Z",
                "payload": {"metric": "win", "amount": 1},
            },
            {
                "opId": "daily-1",
                "kind": "daily_done",
                "occurredAt": "2026-11-04T15:00:00.000Z",
                "payload": {"day": "2026-11-04"},
            },
        ]
        response = client.post("/api/me/progress/sync", json={"operations": ops})
        assert response.status_code == 200
        assert response.json()["tasks"]["daily"]["win"] == 1
        assert response.json()["dailyDone"] == "2026-11-04"
