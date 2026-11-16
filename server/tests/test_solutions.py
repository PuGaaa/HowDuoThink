"""articles 三段式投影（detail）与 solutions 展示域测试。"""

import pytest

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


def test_solution_list_filters_by_domain():
    """列表页分类 chip 按 domain 过滤：夹具案例 domain=runtime，命它与不命它各验一次。"""
    payload = _publish()
    hit = client.get("/api/solutions?domain=runtime").json()
    assert hit["total"] >= 1
    assert all(i["domain"] == "runtime" for i in hit["items"])
    assert any(i["id"] == "a-" + payload["id"] for i in hit["items"])
    miss = client.get("/api/solutions?domain=network").json()
    assert not any(i["id"] == "a-" + payload["id"] for i in miss["items"])


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


def test_rebuild_parse_error_carries_case_id():
    """payload 解析失败（schema 漂移）也要带案例 id 重抛，与派生错误同一契约。"""
    payload = _publish()
    cid = payload["id"]
    db.ex("UPDATE cases SET payload=? WHERE id=?", ("{}", cid))
    from ops.rebuild_articles import rebuild_all

    with pytest.raises(RuntimeError, match=cid):
        rebuild_all()


def test_solution_list_pagination_is_stable_across_pages():
    """同秒批量发布（published_at 全并列）时 OFFSET 翻页不得跨页重复/漏行：
    排序键并列会让各页窗口重叠，必须带唯一 tiebreaker（id）构成全序。"""
    ids = ["a-" + _publish()["id"] for _ in range(8)]
    # 只冻结自己发布的 8 行为同一时间戳（制造排序键全并列）：全表 UPDATE 会污染
    # 共享测试库，破坏后续用例（如 test_submission_review）的数据前提
    marks = ",".join("?" * len(ids))
    db.ex(f"UPDATE articles SET published_at='2026-01-01 00:00:00' WHERE id IN ({marks})", tuple(ids))
    seen: list[str] = []
    page = 1
    while True:
        body = client.get(f"/api/solutions?page={page}&size=3").json()
        seen += [i["id"] for i in body["items"]]
        if len(seen) >= body["total"] or not body["items"]:
            break
        page += 1
    assert len(seen) == len(set(seen)), f"跨页重复: {[i for i in seen if seen.count(i) > 1]}"
    assert set(ids) <= set(seen), "翻页漏行"
    # 清场：本用例批量制造了 8 个同题已发布案例，会挤占 matching.candidates 的
    # top-10 槽位（零分候选拼 id 字典序，a-c-test- 前缀极靠前），破坏共享库中
    # 后续用例（test_submission_review）的相似候选前提——删干净自己造的数据。
    case_ids = tuple(i.removeprefix("a-") for i in ids)
    marks = ",".join("?" * len(ids))
    db.ex(f"DELETE FROM articles WHERE id IN ({marks})", ids)
    db.ex(f"DELETE FROM cases WHERE id IN ({marks})", case_ids)
    db.ex(f"DELETE FROM index_tasks WHERE case_id IN ({marks})", case_ids)
    db.ex(f"DELETE FROM case_revisions WHERE case_id IN ({marks})", case_ids)
