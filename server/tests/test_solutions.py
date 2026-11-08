"""articles 三段式投影（detail）与 solutions 展示域测试。"""

import db
from features.cases.models import CasePayload
from tests.case_fixtures import community_payload
from tests.conftest import login_admin, make_client

client = make_client()


def _publish() -> dict:
    login_admin(client)
    payload = community_payload()
    r = client.post("/api/cases", json=payload)
    assert r.status_code == 200, r.text
    return payload


def test_publish_writes_detail_projection():
    payload = _publish()
    row = db.q("SELECT detail FROM articles WHERE id=?", ("a-" + payload["id"],))[0]
    detail = db.jload(row["detail"], None)
    assert detail is not None
    scene = CasePayload.model_validate(payload).scene
    assert detail["problem"]["intro"] == payload["intro"]
    assert detail["problem"]["impactHint"] == scene.impact_hint
    assert detail["problem"]["role"] == scene.role
    assert [s["title"] for s in detail["problem"]["symptoms"]] == [s.title for s in scene.symptoms]
    correct = next(rc["text"] for rc in payload["rootCauses"] if rc["correct"])
    assert detail["root_cause"] == correct
    assert detail["principles"] == [lesson["principle"] for lesson in payload["lessons"]]


def test_solution_detail_api_has_three_sections():
    payload = _publish()
    body = client.get("/api/solutions/a-" + payload["id"]).json()
    assert body["problem"]["impactHint"] == payload["scene"]["impactHint"]
    assert body["problem"]["symptoms"][0]["type"] == payload["scene"]["symptoms"][0]["type"]
    assert body["root_cause"]
    assert len(body["principles"]) == len(payload["lessons"])
    assert set(body["steps"][0]) == {"no", "observe", "act", "found"}
    assert isinstance(body["lessons"], list)


def test_solution_detail_degrades_when_detail_null():
    payload = _publish()
    db.ex("UPDATE articles SET detail=NULL WHERE id=?", ("a-" + payload["id"],))
    body = client.get("/api/solutions/a-" + payload["id"]).json()
    assert body["problem"] is None
    assert body["root_cause"] is None
    assert body["principles"] == []


def test_solution_list_carries_problem():
    payload = _publish()
    body = client.get("/api/solutions?page=1&size=20").json()
    item = next(i for i in body["items"] if i["id"] == "a-" + payload["id"])
    assert item["problem"]["intro"] == payload["intro"]


def test_rebuild_restores_detail_and_keeps_published_at():
    payload = _publish()
    article_id = "a-" + payload["id"]
    before = db.q("SELECT published_at FROM articles WHERE id=?", (article_id,))[0]["published_at"]
    db.ex("UPDATE articles SET detail=NULL WHERE id=?", (article_id,))
    from ops.rebuild_articles import rebuild_all

    rebuilt, total = rebuild_all()
    assert rebuilt >= 1 and total >= 1
    row = db.q("SELECT detail, published_at FROM articles WHERE id=?", (article_id,))[0]
    assert db.jload(row["detail"], None) is not None
    assert row["published_at"] == before
