"""cases/submissions 域·草稿写路径 status 守卫：非 draft 案例不可经草稿/转稿覆盖正文。"""

import pytest
from fastapi import HTTPException

from tests.conftest import load_seed, login_admin, make_client


def _publish(client, case_id: str) -> dict:
    payload = load_seed()
    payload["id"] = case_id
    r = client.post("/api/cases", json=payload)
    assert r.status_code == 200, r.text
    return payload


def test_published_case_rejects_draft_overwrite():
    """已发布案例经草稿接口保存：409 拒绝，正文保持原样（发布门禁的唯一旁路被堵）。"""
    with make_client() as client:
        login_admin(client)
        payload = _publish(client, "cache-drift")
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
        payload = _publish(client, "cache-drift")
        tampered = dict(payload)
        tampered["title"] = "被转稿篡改"
        with pytest.raises(HTTPException) as ei:
            sub_service.create_draft_with_payload("pw-admin", "s-none", tampered)
        assert ei.value.status_code == 409
        import db

        row = db.q("SELECT payload FROM cases WHERE id=?", (payload["id"],))
        assert db.jload(row[0]["payload"], {})["title"] == payload["title"]


def test_draft_overwrite_races_publish(monkeypatch):
    """check 与 write 之间案例被并发发布：条件 UPDATE（AND status='draft'）仍然拒绝。
    原修复是无谓词 UPDATE + 事务外预检，可被 TOCTOU 打穿：任一次"发布干净版 ×
    草稿保存恶意版"请求对交错成功，未过门禁的 payload 即进入已发布案例。"""
    import db as dbmod
    from features.cases import service as cases_service
    from features.cases.models import CaseDraftBody

    with make_client() as client:
        login_admin(client)
        body = {"id": "c-race-guard-x", "payload": {"id": "c-race-guard-x", "title": "竞态草稿"}}
        assert client.post("/api/admin/cases", json=body).status_code == 200
        real_q = dbmod.q

        def q_then_publish(sql, params=()):
            rows = real_q(sql, params)
            if sql.startswith("SELECT id, status"):
                # 模拟并发发布抢先提交（在预检读到 draft 之后、写入之前）；ex 自带提交
                dbmod.ex("UPDATE cases SET status='published' WHERE id=?", ("c-race-guard-x",))
            return rows

        monkeypatch.setattr(dbmod, "q", q_then_publish)
        draft_body = CaseDraftBody(id="c-race-guard-x", payload={"id": "c-race-guard-x", "title": "被篡改"})
        with pytest.raises(HTTPException) as ei:
            cases_service.save_case_draft("pw-admin", draft_body)
        assert ei.value.status_code == 409
        monkeypatch.undo()
        row = dbmod.q("SELECT status, payload FROM cases WHERE id=?", ("c-race-guard-x",))[0]
        assert row["status"] == "published"
        assert dbmod.jload(row["payload"], {})["title"] == "竞态草稿"  # 正文未被覆盖
