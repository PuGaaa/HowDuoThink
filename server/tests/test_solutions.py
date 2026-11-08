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
