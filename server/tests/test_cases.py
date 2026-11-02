"""cases 域：门禁红线、发布流程（403/422/事务+幂等）、分页上限。"""

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
