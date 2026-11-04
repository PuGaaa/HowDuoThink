"""cases/submissions 域·草稿写路径 status 守卫：非 draft 案例不可经草稿/转稿覆盖正文。"""

from uuid import uuid4

import pytest
from fastapi import HTTPException

from tests.case_fixtures import community_payload
from tests.conftest import login_admin, make_client


@pytest.fixture(autouse=True)
def clean_created_cases():
    import db

    existing = {row["id"] for row in db.q("SELECT id FROM cases")}
    yield
    created = {row["id"] for row in db.q("SELECT id FROM cases")} - existing
    for cid in created:
        db.ex("DELETE FROM index_tasks WHERE case_id=?", (cid,))
        db.ex("DELETE FROM case_revisions WHERE case_id=?", (cid,))
        db.ex("DELETE FROM case_previews WHERE case_id=?", (cid,))
        db.ex("DELETE FROM articles WHERE source_type='case' AND source_id=?", (cid,))
        db.ex("DELETE FROM cases WHERE id=?", (cid,))


def _publish(client) -> dict:
    payload = community_payload("c-guard-" + uuid4().hex[:12])
    r = client.post("/api/cases", json=payload)
    assert r.status_code == 200, r.text
    return payload


def test_published_case_rejects_draft_overwrite():
    """已发布案例经草稿接口保存：409 拒绝，正文保持原样（发布门禁的唯一旁路被堵）。"""
    with make_client() as client:
        login_admin(client)
        payload = _publish(client)
        tampered = dict(payload)
        tampered["title"] = "被草稿路径篡改的标题"
        r = client.post("/api/admin/cases", json={"id": payload["id"], "payload": tampered})
        assert r.status_code == 409
        d = client.get("/api/admin/cases/" + payload["id"]).json()
        assert d["payload"]["title"] == payload["title"]


def test_draft_case_still_savable_and_meta_synced():
    """draft 案例可反复保存；重存时 domain/layer/difficulty 元数据随 payload 同步。"""
    with make_client() as client:
        login_admin(client)
        body = {
            "id": "c-draft-guard-x",
            "payload": {
                "id": "c-draft-guard-x",
                "title": "草稿一",
                "domain": "network",
                "layer": "契约层",
                "difficulty": 2,
            },
        }
        assert client.post("/api/admin/cases", json=body).status_code == 200, client.post(
            "/api/admin/cases", json=body
        ).text
        body["payload"]["title"] = "草稿一改"
        assert client.post("/api/admin/cases", json=body).status_code == 200
        item = next(c for c in client.get("/api/admin/cases").json() if c["id"] == "c-draft-guard-x")
        assert item["title"] == "草稿一改"
        assert item["domain"] == "network" and item["difficulty"] == 2


def test_published_case_rejects_transcript_overwrite():
    """转稿唯一写入口（机械骨架与 AI 起草共用）同样不得覆盖已发布案例。"""
    from features.submissions import service as sub_service

    with make_client() as client:
        login_admin(client)
        payload = _publish(client)
        tampered = dict(payload)
        tampered["title"] = "被转稿篡改"
        with pytest.raises(HTTPException) as ei:
            sub_service.create_draft_with_payload("pw-admin", "s-none", tampered, source_material={})
        assert ei.value.status_code == 409
        import db

        row = db.q("SELECT payload FROM cases WHERE id=?", (payload["id"],))
        assert db.jload(row[0]["payload"], {})["title"] == payload["title"]


def test_draft_overwrite_races_publish(monkeypatch):
    """写入前读取已经发布的最新行，不再使用事务外旧快照。"""
    import db
    from features.cases import repo
    from features.cases import service as cases_service
    from features.cases.models import CaseDraftBody

    with make_client() as client:
        login_admin(client)
        cid = "c-race-guard-x"
        assert client.post("/api/admin/cases", json={"id": cid, "payload": {"title": "竞态草稿"}}).status_code == 200
        original = repo.get

        def published_before_lock(conn, case_id, lock=False):
            if lock:
                db.ex("UPDATE cases SET status='published' WHERE id=?", (cid,))
            return original(conn, case_id, lock)

        monkeypatch.setattr(repo, "get", published_before_lock)
        with pytest.raises(HTTPException) as exc:
            cases_service.save_case_draft("pw-admin", CaseDraftBody(id=cid, payload={"title": "被篡改"}))
        assert exc.value.status_code == 409
        assert db.jload(db.q("SELECT payload FROM cases WHERE id=?", (cid,))[0]["payload"], {})["title"] == "竞态草稿"
