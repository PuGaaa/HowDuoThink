"""真实 MySQL：匿名归属、事实优先级与成熟批次口径。"""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

import db
from core import security
from features.stats import service
from tests.conftest import make_client


def create_account():
    uid = "learn-" + uuid4().hex
    db.ex("INSERT INTO users(id,login,name,role) VALUES(?,?,?,'user')", (uid, uid, uid))
    return uid


@pytest.fixture
def account():
    return create_account()


def event(kind="session_end", **changes):
    serial = uuid4().hex
    body = {
        "eventId": "event-session-end-" + serial,
        "kind": kind,
        "sessionId": serial,
        "caseId": "first-npe",
        "source": "play",
        "contentRevision": 1,
        "anonymousId": "anon-" + serial,
        "occurredAt": "2026-11-01T10:00:00+08:00",
    }
    body.update(changes)
    return body


def test_progress_result_upgrades_earlier_thin_event_and_late_thin_retry_cannot_erase(account):
    body = event()
    with make_client() as c:
        c.headers["Authorization"] = "Bearer " + security.sign_session(account)
        assert c.post("/api/me/learning-events", json=body).status_code == 204
        operation = {
            "opId": body["sessionId"],
            "kind": "session_end",
            "occurredAt": body["occurredAt"],
            "payload": {
                "sessionId": body["sessionId"],
                "caseId": body["caseId"],
                "contentRevision": 1,
                "scoringVersion": 1,
                "expertCost": 5,
                "chapterId": "error-reading",
                "solved": True,
                "grade": "S",
                "playerCost": 4,
                "eventId": body["eventId"],
                "anonymousId": body["anonymousId"],
            },
        }
        for _ in range(2):
            r = c.post("/api/me/progress/sync", json={"operations": [operation]})
            assert r.status_code == 200, r.text
        assert c.post("/api/me/learning-events", json=body).status_code == 204
    rows = db.q("SELECT payload,user_id FROM learning_events WHERE id=?", ("client:" + body["eventId"],))
    assert len(rows) == 1
    assert db.jload(rows[0]["payload"], {}).get("solved") is True


def test_guest_success_and_failure_keep_results_and_duplicate_session_is_one_row():
    with make_client() as c:
        body = event(solved=True)
        assert c.post("/api/learning-events", json=body).status_code == 204
        assert c.post("/api/learning-events", json={**body, "eventId": "another-" + uuid4().hex}).status_code == 204
    rows = db.q("SELECT payload FROM learning_events WHERE anonymous_id=?", (body["anonymousId"],))
    assert len(rows) == 1
    assert db.jload(rows[0]["payload"], {}).get("solved") is True


def test_claim_conflict_is_409_and_the_original_account_keeps_the_event_queue(account):
    other = create_account()
    body = event(kind="session_start")
    with make_client() as c:
        assert c.post("/api/learning-events", json=body).status_code == 204
        c.headers["Authorization"] = "Bearer " + security.sign_session(account)
        assert c.post("/api/me/learning-events/claim", json={"anonymousId": body["anonymousId"]}).status_code == 204
        c.headers["Authorization"] = "Bearer " + security.sign_session(other)
        assert c.post("/api/me/learning-events/claim", json={"anonymousId": body["anonymousId"]}).status_code == 409
        assert c.post("/api/me/learning-events", json=body).status_code == 409
        fresh = event(kind="session_start")
        assert c.post("/api/me/learning-events/claim", json={"anonymousId": fresh["anonymousId"]}).status_code == 204
        assert c.post("/api/me/learning-events", json=fresh).status_code == 204
        c.headers["Authorization"] = "Bearer " + security.sign_session(account)
        assert c.post("/api/me/learning-events", json=body).status_code == 204
    identity = db.q("SELECT user_id FROM learning_event_identities WHERE anonymous_id=?", (body["anonymousId"],))
    assert identity == [{"user_id": account}]
    row = db.q("SELECT user_id FROM learning_events WHERE anonymous_id=?", (body["anonymousId"],))
    assert row == [{"user_id": account}]


def test_two_accounts_claiming_the_same_anonymous_id_have_one_winner(account):
    other = create_account()
    anonymous_id = "anon-" + uuid4().hex
    barrier = Barrier(2)

    def claim(uid):
        with make_client() as c:
            c.headers["Authorization"] = "Bearer " + security.sign_session(uid)
            barrier.wait()
            return c.post("/api/me/learning-events/claim", json={"anonymousId": anonymous_id}).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(pool.map(claim, [account, other]))

    assert statuses == [204, 409]
    identity = db.q("SELECT user_id FROM learning_event_identities WHERE anonymous_id=?", (anonymous_id,))
    assert identity in [[{"user_id": account}], [{"user_id": other}]]


def test_guest_event_racing_with_claim_is_assigned_to_the_claimed_account(account):
    body = event(kind="session_start")
    barrier = Barrier(2)

    def guest_event():
        with make_client() as c:
            barrier.wait()
            return c.post("/api/learning-events", json=body).status_code

    def claim():
        with make_client() as c:
            c.headers["Authorization"] = "Bearer " + security.sign_session(account)
            barrier.wait()
            return c.post("/api/me/learning-events/claim", json={"anonymousId": body["anonymousId"]}).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        guest = pool.submit(guest_event)
        claimant = pool.submit(claim)
        assert guest.result() == 204
        assert claimant.result() == 204

    identity = db.q("SELECT user_id FROM learning_event_identities WHERE anonymous_id=?", (body["anonymousId"],))
    events = db.q("SELECT user_id FROM learning_events WHERE anonymous_id=?", (body["anonymousId"],))
    assert identity == [{"user_id": account}]
    assert events == [{"user_id": account}]
    assert not db.q(
        "SELECT id FROM learning_events WHERE anonymous_id=? AND user_id LIKE ?",
        (body["anonymousId"], "guest:%"),
    )


@pytest.fixture
def isolated_events():
    # 只清当前 pytest 创建的 hdt_test_<pid>；不接触 UI/性能库。
    db.ex("DELETE FROM learning_events")
    yield


def insert(uid, kind, day, session="s", case="first-npe", **payload):
    data = {"sessionId": session, "caseId": case, **payload}
    db.ex(
        "INSERT INTO learning_events(id,user_id,anonymous_id,kind,occurred_at,payload) VALUES(?,?,?,?,?,?)",
        (uuid4().hex, uid, "anon-" + uid, kind, day + "T10:00:00+08:00", db.jdump(data)),
    )


def test_weekly_success_requires_success_in_this_week_and_future_is_excluded(isolated_events):
    insert("u", "session_start", "2026-10-20")
    insert("u", "verification", "2026-10-20")
    insert("u", "session_end", "2026-10-20", solved=True)
    insert("u", "verification", "2026-11-03", "failed")
    insert("u", "session_end", "2026-11-03", "failed", solved=False)
    insert("future", "session_start", "2026-11-05")
    metrics = service.learning_metrics("2026-11-04")
    assert metrics["weeklySolvedUsers"] == 0
    assert metrics["funnel"]["startedUsers"] == 1


def test_three_cases_are_fixed_trial_and_d7_success_uses_same_denominator(isolated_events):
    for uid, cases in [("other", ["x", "y", "z"]), ("trial", ["first-npe", "caused-by", "log-correlation"])]:
        insert(uid, "session_start", "2026-10-25")
        if uid == "trial":
            insert(uid, "trial_enter", "2026-10-25", "trial-first", "first-npe")
        for case in cases:
            insert(uid, "verification", "2026-10-26", case, case)
            insert(uid, "session_end", "2026-10-26", case, case, solved=True)
        insert(uid, "verification", "2026-11-01", "d7")
        insert(uid, "session_end", "2026-11-01", "d7", solved=uid == "trial")
    metrics = service.learning_metrics("2026-11-04")
    assert metrics["threeCase7d"] == {"eligibleUsers": 1, "completedUsers": 1}
    assert metrics["d7"] == {"eligibleUsers": 2, "retainedUsers": 2}
    assert metrics["d7Solved"] == {"eligibleUsers": 2, "retainedUsers": 1}


def test_trial_funnel_uses_trial_entrance_and_beijing_natural_day_maturity(isolated_events):
    insert("formal", "session_start", "2026-10-20")
    insert("trial-mature", "trial_enter", "2026-10-25", "trial", "first-npe")
    insert("trial-mature", "verification", "2026-10-31", "last", "log-correlation")
    insert("trial-mature", "session_end", "2026-10-31", "last", "log-correlation", solved=True)
    insert("trial-young", "trial_enter", "2026-11-01", "trial", "first-npe")
    metrics = service.learning_metrics("2026-11-04")
    assert metrics["threeCase7d"] == {"eligibleUsers": 1, "completedUsers": 0}
    assert metrics["immatureUsers"]["threeCase7d"] == 1


def test_d7_uses_beijing_day_and_excludes_cohorts_one_day_too_young(isolated_events):
    insert("mature", "session_start", "2026-10-27")
    insert("mature", "verification", "2026-11-03")
    insert("mature", "session_end", "2026-11-03", solved=True)
    insert("young", "session_start", "2026-10-29")
    insert("young", "verification", "2026-11-04")
    insert("young", "session_end", "2026-11-04", solved=True)
    metrics = service.learning_metrics("2026-11-04")
    assert metrics["d7"] == {"eligibleUsers": 1, "retainedUsers": 1}
    assert metrics["d7Solved"] == {"eligibleUsers": 1, "retainedUsers": 1}
    assert metrics["immatureUsers"]["d7"] == 1


def test_save_and_continue_windows_are_zero_to_six_natural_days(isolated_events):
    for uid, saved in [("within", "2026-10-31"), ("late", "2026-11-01")]:
        insert(uid, "save_prompt", "2026-10-25")
        insert(uid, "progress_saved", saved)
        insert(uid, "verification", "2026-11-01")
        insert(uid, "session_end", "2026-11-01", solved=False)
    insert("immature", "save_prompt", "2026-11-01")
    metrics = service.learning_metrics("2026-11-07")
    assert metrics["saveConversion7d"] == {"eligibleUsers": 3, "convertedUsers": 1}
    assert metrics["continue7d"] == {"eligibleUsers": 2, "continuedUsers": 2}
