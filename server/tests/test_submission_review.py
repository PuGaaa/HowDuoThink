"""MySQL编审闭环：请求与内容幂等、授权、候选权限和补证投影。"""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException

import db
from core import security
from features.submissions import service
from tests.conftest import make_client


@pytest.fixture
def people():
    clients = []
    for role in ["user", "editor", "user"]:
        uid = "sub-" + uuid4().hex
        db.ex(
            "INSERT INTO users(id,login,name,role) VALUES(?,?,?,?)",
            (uid, uid, "作者" if role == "user" else "编辑", role),
        )
        client = make_client()
        client.headers["Authorization"] = "Bearer " + security.sign_session(uid)
        clients.append((uid, client))
    yield clients
    for _, client in clients:
        client.close()


def body(**changes):
    material = {
        "requestId": uuid4().hex,
        "title": "线上接口持续超时",
        "symptom": "数据库连接等待增加并且仅部分实例报错",
        "resolution": "根据实例关联日志定位连接池占用，修复未释放连接",
        "keyError": "SQL 500 timeout",
        "timeline": "部署后开始",
        "lessons": ["先确认影响实例"],
        "stackTags": ["mysql"],
        "domainHint": "data",
    }
    material.update(changes)
    return material


def submit(client, **changes):
    response = client.post("/api/submissions", json=body(**changes))
    assert response.status_code == 200, response.text
    return response.json()["id"]


def review_body(candidates, **changes):
    value = {
        "decision": "distinct",
        "mechanism": "与候选事故的连接生命周期机制不同",
        "evidence": "增加实例与连接持有时间的可验证证据",
        "reasoning": "需要比较线程持有者才能收束假设",
        "candidateIds": [item["key"] for item in candidates],
        "publicNote": "已收到材料，进入制作",
        "internalNote": "编辑内部核查记录不提供作者",
    }
    value.update(changes)
    return value


def authorize(people, sid, material=None):
    author, editor = people[0][1], people[1][1]
    cleaned = material or {key: value for key, value in body().items() if key != "requestId"}
    response = editor.put(f"/api/admin/submissions/{sid}/material", json={"material": cleaned})
    assert response.status_code == 200, response.text
    version = response.json()["version"]
    assert author.post(f"/api/me/submissions/{sid}/consent", json={"version": version}).status_code == 200
    candidates = editor.get(f"/api/admin/submissions/{sid}/similar").json()["items"]
    response = editor.post(f"/api/admin/submissions/{sid}/review", json=review_body(candidates))
    assert response.status_code == 200, response.text
    return cleaned


def add_case(cid, status="published", submission_id=None):
    db.ex(
        "INSERT INTO cases(id,submission_id,title,domain,layer,difficulty,version,status,payload) VALUES(?,?,?,'data','连接生命周期',1,1,?,?)",
        (
            cid,
            submission_id,
            "连接超时案例",
            status,
            db.jdump({"title": "连接超时案例", "intro": "连接等待和实例关联排查", "layer": "连接生命周期"}),
        ),
    )


def test_same_request_and_normalized_content_return_original(people):
    author = people[0][1]
    material = body()
    first = author.post("/api/submissions", json=material).json()
    material["resolution"] = "改变内容也不能把同一个请求变成另一张工单"
    second = author.post("/api/submissions", json=material).json()
    assert first["id"] == second["id"] and second["duplicate"] is True
    normalized = body(title="  线上接口持续超时  ", requestId="alias-" + uuid4().hex)
    third = author.post("/api/submissions", json=normalized).json()
    assert third["id"] == first["id"] and third["duplicate"] is True
    normalized["resolution"] = "重试别名时修改内容也仍返回第一次关联的稿件"
    assert author.post("/api/submissions", json=normalized).json()["id"] == first["id"]
    assert db.q("SELECT COUNT(*) AS n FROM submissions WHERE user_id=?", (people[0][0],))[0]["n"] == 1


def test_concurrent_requests_with_same_content_are_one_submission(people):
    uid = people[0][0]
    barrier = Barrier(2)

    def request(_):
        with make_client() as client:
            client.headers["Authorization"] = "Bearer " + security.sign_session(uid)
            barrier.wait()
            return client.post("/api/submissions", json=body()).json()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(request, range(2)))
    assert results[0]["id"] == results[1]["id"]
    assert db.q("SELECT COUNT(*) AS n FROM submission_requests WHERE user_id=?", (uid,))[0]["n"] == 2


def test_distinct_authors_keep_originals_and_version_tokens_are_not_normalized_away(people):
    first = submit(people[0][1])
    second = submit(people[2][1])
    third = submit(people[0][1], keyError="SQL 404 timeout")
    assert len({first, second, third}) == 3


def test_author_cannot_read_others_or_internal_review(people):
    author, editor, other = people[0][1], people[1][1], people[2][1]
    sid = submit(author)
    authorize(people, sid)
    own = author.get(f"/api/me/submissions/{sid}").json()
    assert "review" not in own
    assert all(note["visibility"] == "author" for note in own["messages"])
    assert "编辑内部核查" not in str(own)
    assert other.get(f"/api/me/submissions/{sid}").status_code == 403
    assert other.post(f"/api/me/submissions/{sid}/supplements", json={"text": "他人不能添加补充"}).status_code == 403
    assert author.get(f"/api/admin/submissions/{sid}").status_code == 403
    assert "编辑内部核查" in str(editor.get(f"/api/admin/submissions/{sid}").json())


def test_ai_source_requires_current_author_consent_and_contains_only_sanitized_material(people):
    author, editor = people[0][1], people[1][1]
    sid = submit(author, keyError="原始内部敏感日志，不能送往模型")
    with pytest.raises(HTTPException) as exc:
        service.authorized_draft_source(sid)
    assert exc.value.status_code == 409
    cleaned = authorize(people, sid)
    source = service.authorized_draft_source(sid)
    assert source == cleaned
    assert "原始内部敏感" not in str(source) and "internalNote" not in source
    assert (
        author.post(
            f"/api/me/submissions/{sid}/supplements", json={"text": "发现新的实例证据，需重新核实公开范围"}
        ).status_code
        == 200
    )
    view = author.get(f"/api/me/submissions/{sid}").json()
    assert view["materialCurrent"] is False and view["materialConfirmed"] is False
    with pytest.raises(HTTPException) as exc:
        service.authorized_draft_source(sid)
    assert exc.value.status_code == 409
    assert author.post(f"/api/me/submissions/{sid}/consent", json={"version": 1}).status_code == 409
    next_material = editor.put(f"/api/admin/submissions/{sid}/material", json={"material": cleaned}).json()
    assert next_material["version"] == 2
    assert author.post(f"/api/me/submissions/{sid}/consent", json={"version": 1}).status_code == 409


def test_public_candidates_exclude_pending_and_draft_material(people):
    author, editor = people[0][1], people[1][1]
    private = submit(author, title="未公开连接超时事故", symptom="未公开客户与集群实例日志，等待作者补证")
    target = submit(people[2][1], title="另一份连接超时报告")
    draft_id = "draft-" + uuid4().hex[:12]
    public_id = "public-" + uuid4().hex[:12]
    add_case(draft_id, "draft")
    add_case(public_id)
    public = author.get("/api/submissions/similar", params={"q": "连接超时"}).json()["items"]
    assert all(item["status"] == "published" and item["kind"] == "case" for item in public)
    assert private not in str(public) and draft_id not in str(public) and "未公开客户" not in str(public)
    candidates = editor.get(f"/api/admin/submissions/{target}/similar").json()["items"]
    assert {private, draft_id, public_id} <= {item["id"] for item in candidates}


def test_human_difference_review_is_required_for_manual_draft(people):
    sid = submit(people[0][1])
    assert people[1][1].post(f"/api/admin/submissions/{sid}/draft").status_code == 409
    material = authorize(people, sid)
    response = people[1][1].post(f"/api/admin/submissions/{sid}/draft")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "draft"
    case = db.q("SELECT payload,source_type FROM cases WHERE id=?", (response.json()["caseId"],))[0]
    assert db.jload(case["payload"], {})["part"] == "engineer"
    assert case["source_type"] == "community"
    assert service.authorized_draft_source(sid) == material


def test_new_candidate_requires_recheck_before_publish(people):
    sid = submit(people[0][1])
    authorize(people, sid)
    service.require_publication_review(sid)
    new_sid = submit(people[2][1], title="连接超时新补充事故")
    with pytest.raises(HTTPException) as exc:
        service.require_publication_review(sid)
    assert exc.value.status_code == 409
    assert new_sid in str(people[1][1].get(f"/api/admin/submissions/{sid}/similar").json())


def test_merge_retains_original_and_projects_actual_publication(people):
    author, editor = people[0][1], people[1][1]
    sid = submit(author)
    cid = "merged-" + uuid4().hex[:12]
    add_case(cid, "draft")
    authorize(people, sid)
    candidates = editor.get(f"/api/admin/submissions/{sid}/similar").json()["items"]
    response = editor.post(
        f"/api/admin/submissions/{sid}/review",
        json=review_body(candidates, decision="merge", linkedCaseId=cid, publicNote="已作为主案例补证，保留你的署名"),
    )
    assert response.status_code == 200, response.text
    view = author.get(f"/api/me/submissions/{sid}").json()
    assert view["displayStatus"] == "producing" and view["articlePath"] is None
    assert editor.post(f"/api/admin/submissions/{sid}/draft").status_code == 409
    db.ex("UPDATE cases SET status='published' WHERE id=?", (cid,))
    view = author.get(f"/api/me/submissions/{sid}").json()
    assert view["displayStatus"] == "published" and view["articlePath"] == "/solutions/a-" + cid
    assert view["resolution"] == body()["resolution"]
    assert db.q("SELECT COUNT(*) AS n FROM cases WHERE submission_id=?", (sid,))[0]["n"] == 0


def test_no_threshold_rejects_same_symptom_different_mechanism(people):
    sid = submit(people[0][1])
    submit(people[2][1], title="线上接口持续超时", resolution="此次原因是DNS负缓存，与连接池未释放无关")
    authorize(people, sid)
    assert people[1][1].post(f"/api/admin/submissions/{sid}/draft").status_code == 200


def test_draft_write_rejects_authorization_changed_during_generation(people):
    sid = submit(people[0][1])
    source = authorize(people, sid)
    payload = service.draft_skeleton_from_submission(sid)
    newer = dict(source, resolution="经过新的实例核对，修复过程需以最新证据为准")
    authorize(people, sid, newer)
    with pytest.raises(HTTPException) as exc:
        service.create_draft_with_payload(people[1][0], sid, payload, source_material=source)
    assert exc.value.status_code == 409
    assert not db.q("SELECT id FROM cases WHERE submission_id=?", (sid,))


def test_candidate_body_changes_require_fresh_review(people):
    cid = "candidate-" + uuid4().hex[:12]
    add_case(cid, "draft")
    db.ex(
        "UPDATE cases SET title=?,payload=? WHERE id=?", (body()["title"], db.jdump({"intro": body()["symptom"]}), cid)
    )
    sid = submit(people[0][1])
    authorize(people, sid)
    service.require_publication_review(sid)
    db.ex(
        "UPDATE cases SET payload=? WHERE id=?",
        (db.jdump({"intro": body()["symptom"], "expertChain": [{"thought": "新的证据改变判断"}]}), cid),
    )
    with pytest.raises(HTTPException) as exc:
        service.require_publication_review(sid)
    assert exc.value.status_code == 409


def test_merge_contributors_require_consent_and_remain_private_until_published(people):
    cid = "credits-" + uuid4().hex[:12]
    source = submit(people[0][1])
    evidence = submit(people[2][1])
    add_case(cid, "draft", source)
    editor = people[1][1]
    candidates = editor.get(f"/api/admin/submissions/{evidence}/similar").json()["items"]
    payload = review_body(candidates, decision="merge", linkedCaseId=cid)
    assert editor.post(f"/api/admin/submissions/{evidence}/review", json=payload).status_code == 409
    cleaned = {key: value for key, value in body().items() if key != "requestId"}
    version = editor.put(f"/api/admin/submissions/{evidence}/material", json={"material": cleaned}).json()["version"]
    assert people[2][1].post(f"/api/me/submissions/{evidence}/consent", json={"version": version}).status_code == 200
    candidates = editor.get(f"/api/admin/submissions/{evidence}/similar").json()["items"]
    assert (
        editor.post(
            f"/api/admin/submissions/{evidence}/review",
            json=review_body(candidates, decision="merge", linkedCaseId=cid),
        ).status_code
        == 200
    )
    assert service.contributors_for_case(cid) == []
    db.ex("UPDATE cases SET status='published' WHERE id=?", (cid,))
    credits = service.contributors_for_case(cid)
    assert {item["role"] for item in credits} == {"source", "evidence"}
    assert {item["authorId"] for item in credits} == {people[0][0], people[2][0]}
    assert "resolution" not in str(credits) and "internal" not in str(credits)


def test_request_retry_returns_current_status(people):
    request = body()
    author = people[0][1]
    sid = author.post("/api/submissions", json=request).json()["id"]
    db.ex("UPDATE submissions SET status='needs_more' WHERE id=?", (sid,))
    result = author.post("/api/submissions", json=request).json()
    assert result == {"id": sid, "status": "needs_more", "duplicate": True}


def test_submission_and_request_alias_rollback_together(people, monkeypatch):
    from features.submissions import repo
    from features.submissions.models import SubmissionCreate

    original = repo.register_request

    def fail_after_request(*args):
        original(*args)
        raise RuntimeError("事务回滚验证")

    monkeypatch.setattr(repo, "register_request", fail_after_request)
    with pytest.raises(RuntimeError, match="事务回滚验证"):
        service.create_submission(people[0][0], SubmissionCreate.model_validate(body()))
    assert db.q("SELECT id FROM submissions WHERE user_id=?", (people[0][0],)) == []
    assert db.q("SELECT request_id FROM submission_requests WHERE user_id=?", (people[0][0],)) == []
