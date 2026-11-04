"""cases 域：门禁红线、发布流程（403/422/事务+幂等）、分页上限。"""

import uuid
from datetime import datetime, timedelta, timezone

from features.cases import gate
from features.cases.models import CasePayload
from tests.conftest import load_seed, login_admin, make_client


def test_gate_accepts_official_case():
    cp = CasePayload(**load_seed())
    assert gate.check_case(cp) == []


def test_gate_rejects_l2_without_danger_action():
    d = load_seed()
    for a in d["actions"]:
        a["danger"] = False  # L2 题去掉危险动作 → 红线
    cp = CasePayload(**d)
    assert any("危险动作" in e for e in gate.check_case(cp))


def test_solutions_page_size_capped():
    with make_client() as client:
        assert client.get("/api/solutions?size=51").status_code == 422
        assert client.get("/api/solutions?page=0").status_code == 422
        assert client.get("/api/solutions?page=1&size=20").status_code == 200


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
        # 幂等重发：正文不变，不新增修订或 cursor
        r2 = client.post("/api/cases", json={**payload, "baseRevision": 1})
        assert r2.status_code == 200
        assert r2.json()["version"] == v1
        assert r2.json()["unchanged"] is True
        assert r2.json()["contentRevision"] == 1
        # article 投影存在
        assert client.get("/api/solutions/a-" + payload["id"]).status_code == 200


def test_publish_rejected_by_gate_422():
    with make_client() as client:
        login_admin(client)
        d = load_seed()
        d["title"] = "字" * 41  # 超过 40 字上限
        r = client.post("/api/cases", json=d)
        assert r.status_code == 422


def test_admin_cases_list_and_detail():
    with make_client() as client:
        login_admin(client)
        payload = load_seed()
        client.post("/api/cases", json=payload)
        lst = client.get("/api/admin/cases")
        assert lst.status_code == 200, lst.text
        item = next(c for c in lst.json() if c["id"] == payload["id"])
        assert item["status"] == "published"
        assert item["version"] >= 1
        d = client.get("/api/admin/cases/" + payload["id"])
        assert d.status_code == 200
        assert d.json()["payload"]["id"] == payload["id"]


def test_publish_revision_conflict_and_index_task():
    import db

    with make_client() as client:
        login_admin(client)
        payload = load_seed()
        first = client.post("/api/cases", json=payload)
        assert first.status_code == 200
        changed = {**payload, "title": "修订后的标题", "baseRevision": 1}
        second = client.post("/api/cases", json=changed)
        assert second.status_code == 200, second.text
        assert second.json()["contentRevision"] == 2
        stale = {**payload, "title": "陈旧覆盖", "baseRevision": 1}
        assert client.post("/api/cases", json=stale).status_code == 409
        task = db.q("SELECT case_id, content_revision, status FROM index_tasks WHERE case_id=?", (payload["id"],))
        assert [(r["case_id"], r["content_revision"], r["status"]) for r in task] == [
            (payload["id"], 1, "pending"),
            (payload["id"], 2, "pending"),
        ]


def test_admin_cases_list_filters_by_status():
    with make_client() as client:
        login_admin(client)
        payload = load_seed()
        client.post("/api/cases", json=payload)
        drafts = client.get("/api/admin/cases", params={"status": "draft"})
        assert drafts.status_code == 200
        assert all(c["status"] == "draft" for c in drafts.json())
        assert all(c["id"] != payload["id"] for c in drafts.json())


def test_admin_case_detail_404():
    with make_client() as client:
        login_admin(client)
        assert client.get("/api/admin/cases/no-such-case").status_code == 404


def test_case_preview_is_scoped_and_does_not_accept_normal_session():
    import db

    with make_client() as client:
        login_admin(client)
        payload = load_seed()
        payload["id"] = "preview-" + uuid.uuid4().hex[:10]
        assert client.post("/api/admin/cases", json={"id": payload["id"], "payload": payload}).status_code == 200
        created = client.post(f"/api/admin/cases/{payload['id']}/preview", json={"payload": payload})
        assert created.status_code == 200, created.text
        data = created.json()
        preview_id = data["previewId"]
        token = data["previewToken"]

        assert client.get(f"/api/previews/{preview_id}").status_code == 401
        assert (
            client.get(f"/api/previews/{preview_id}", headers={"Authorization": "Bearer " + token}).json()["payload"][
                "id"
            ]
            == payload["id"]
        )
        assert (
            client.get(
                f"/api/previews/{preview_id}", headers={"Authorization": "Bearer " + client.cookies.get("session")}
            ).status_code
            == 401
        )
        assert db.q("SELECT COUNT(*) AS n FROM progress WHERE user_id='admin'")[0]["n"] == 0
        db.ex(
            "UPDATE case_previews SET expires_at=? WHERE id=?",
            ((datetime.now(timezone.utc) - timedelta(minutes=1)).replace(tzinfo=None).isoformat(sep=" "), preview_id),
        )
        assert (
            client.get(f"/api/previews/{preview_id}", headers={"Authorization": "Bearer " + token}).status_code == 401
        )


def test_draft_is_not_in_public_casepack_but_can_be_previewed():
    with make_client() as client:
        login_admin(client)
        payload = load_seed()
        payload["id"] = "preview-draft-" + uuid.uuid4().hex[:8]
        assert client.post("/api/admin/cases", json={"id": payload["id"], "payload": payload}).status_code == 200
        preview = client.post(f"/api/admin/cases/{payload['id']}/preview", json={"payload": payload})
        assert preview.status_code == 200
        public_ids = {item["id"] for item in client.get("/api/casepack?since=0").json()["cases"]}
        assert payload["id"] not in public_ids


def test_admin_cases_require_editor():
    with make_client() as client:
        assert client.get("/api/admin/cases").status_code in (401, 403)


def test_update_meta_bumps_casepack_version():
    """meta 变更必须进 casepack 增量流（version bump），否则 App 永远拉不到章归属/排序调整。"""
    import db

    with make_client() as client:
        login_admin(client)
        payload = load_seed()
        r = client.post("/api/cases", json=payload)
        assert r.status_code == 200, r.text
        cid = payload["id"]
        since = db.current_version()
        r = client.patch(f"/api/admin/cases/{cid}/meta", json={"order": 42})
        assert r.status_code == 200, r.text
        assert db.current_version() > since  # 版本推进
        pack = client.get(f"/api/casepack?since={since}").json()
        hit = [c for c in pack["cases"] if c["id"] == cid]
        assert hit and hit[0]["order"] == 42  # casepack 项即 payload，order 在顶层


def test_update_meta_unknown_case_404_no_version_bump():
    import db

    with make_client() as client:
        login_admin(client)
        v0 = db.current_version()
        assert client.patch("/api/admin/cases/no-such-case/meta", json={"order": 1}).status_code == 404
        assert db.current_version() == v0  # 不虚增版本
