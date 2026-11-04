"""真实 MySQL：进度重传、并发、历史导入、版本成绩和迟到事实。"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier
from uuid import uuid4

import pytest

import db
from core import security
from features.progress import projection, repo
from tests.conftest import make_client


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(projection, "today", lambda: date(2026, 11, 4))


@pytest.fixture
def account():
    uid = "progress-" + uuid4().hex
    db.ex("INSERT INTO users(id,login,name,role) VALUES(?,?,?,'user')", (uid, uid, "进度测试"))
    return uid


@pytest.fixture
def client(account):
    with make_client() as c:
        c.headers["Authorization"] = "Bearer " + security.sign_session(account)
        yield c


def op(op_id, kind, payload, at="2026-11-04T10:00:00Z"):
    return {"opId": op_id, "kind": kind, "occurredAt": at, "payload": payload}


def session(op_id, case="case-a", at="2026-11-04T10:00:00Z", **changes):
    payload = {
        "sessionId": op_id,
        "caseId": case,
        "contentRevision": 1,
        "scoringVersion": 1,
        "expertCost": 5,
        "chapterId": "data",
        "solved": True,
        "grade": "A",
        "playerCost": 4,
        "mascotEvents": [{"id": "frog"}],
    }
    payload.update(changes)
    return op(op_id, "session_end", payload, at)


def sync(client, operations):
    response = client.post("/api/me/progress/sync", json={"operations": operations})
    assert response.status_code == 200, response.text
    return response.json()


def archive(archive_id, cases, **changes):
    bundle = {"cases": cases}
    bundle.update(changes)
    return op("import-" + archive_id, "bootstrap", {"archiveId": archive_id, "bundle": bundle})


def test_progress_requires_auth():
    with make_client() as c:
        assert c.get("/api/me/progress").status_code == 401
        assert c.post("/api/me/progress", json={"cases": {}}).status_code == 401


def test_legacy_post_rejected_without_mutation(client):
    sync(client, [session("initial")])
    before = client.get("/api/me/progress").json()
    assert client.post("/api/me/progress", json={"cases": {}}).status_code == 426
    assert client.get("/api/me/progress").json() == before


def test_same_operation_retry_and_session_alias_settle_once(client, account):
    original = session("first")
    first = sync(client, [original])
    again = sync(client, [original] * 10)
    assert first["revision"] == again["revision"] == 1
    alias = session("another-op", sessionId="first")
    result = sync(client, [alias])
    assert result["cases"]["case-a"]["plays"] == 1
    assert result["mascots"]["frog"] == 1
    assert db.q("SELECT COUNT(*) AS n FROM learning_events WHERE user_id=?", (account,))[0]["n"] == 1


def test_first_two_requests_serialize_without_losing_operations(account):
    barrier = Barrier(2)

    def request(operation):
        with make_client() as c:
            c.headers["Authorization"] = "Bearer " + security.sign_session(account)
            barrier.wait()
            return sync(c, [operation])

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(request, [session("one", "one"), session("two", "two")]))
    assert sorted(r["revision"] for r in results) == [1, 2]
    with make_client() as c:
        c.headers["Authorization"] = "Bearer " + security.sign_session(account)
        state = c.get("/api/me/progress").json()
    assert set(state["cases"]) == {"one", "two"}
    assert state["mascots"]["frog"] == 2


def test_concurrent_same_operation_is_idempotent(account):
    barrier = Barrier(2)

    def request(_):
        with make_client() as c:
            c.headers["Authorization"] = "Bearer " + security.sign_session(account)
            barrier.wait()
            return sync(c, [session("same")])

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(request, range(2)))
    assert [r["revision"] for r in results] == [1, 1]
    assert all(r["cases"]["case-a"]["plays"] == 1 for r in results)


def test_success_cost_minimum_ignores_failure_and_accepts_zero(client):
    result = sync(client, [session("success"), session("failed", solved=False, grade="F", playerCost=15)])
    assert result["cases"]["case-a"]["bestCost"] == 4
    result = sync(client, [session("free", playerCost=0, grade="S")])
    assert result["cases"]["case-a"]["bestCost"] == 0
    assert result["cases"]["case-a"]["bestGrade"] == "S"
    assert result["cases"]["case-a"]["fails"] == 1


def test_versions_have_independent_cost_and_grade(client):
    result = sync(client, [session("v1", grade="S", playerCost=0), session("v2", contentRevision=2, playerCost=8)])
    case = result["cases"]["case-a"]
    assert case["contentRevision"] == 2 and case["bestCost"] == 8
    assert case["scores"]["1:1"]["bestCost"] == 0
    result = sync(
        client, [session("new-rule", contentRevision=2, scoringVersion=2, solved=False, grade="F", playerCost=1)]
    )
    case = result["cases"]["case-a"]
    assert case["solved"] is True
    assert case["bestCost"] is None and case["bestGrade"] == "F"
    assert case["scores"]["2:1"]["bestCost"] == 8


def test_existing_cloud_baseline_and_archive_are_separate(client, account):
    cloud = {
        "cases": {"old": {"solved": True, "bestGrade": "S", "bestCost": 2, "plays": 8}},
        "unlockedChapterIds": ["data"],
    }
    db.ex("INSERT INTO progress(user_id,payload,revision) VALUES(?,?,0)", (account, db.jdump(cloud)))
    imported = archive(
        "local-" + account,
        {"old": {"solved": True, "plays": 10}, "new-old": {"solved": True}},
        unlockedChapterIds=["runtime"],
    )
    state = sync(client, [imported, session("fresh", "fresh")])
    assert state["cases"]["old"]["plays"] == 8
    assert state["cases"]["old"]["contentRevision"] is None
    assert state["legacyBaseline"]["cases"]["old"]["bestGrade"] == "S"
    assert state["legacyArchives"]["local-" + account]["cases"]["old"]["plays"] == 10
    assert state["cases"]["new-old"]["solved"] is True
    assert state["cases"]["new-old"]["plays"] == 0
    assert {"data", "runtime", "error-reading", "contract", "concurrency"} <= set(state["unlockedChapterIds"])


def test_bootstrap_snapshot_and_same_batch_session_do_not_double_count(client, account):
    imported = archive("guest-" + account, {"case-a": {"solved": True, "plays": 1}}, mascots={"frog": 1}, checkuse=1)
    operations = [imported, session("guest-session"), op("guest-check", "checklist_use", {})]
    state = sync(client, operations)
    assert state["cases"]["case-a"]["plays"] == 1
    assert state["mascots"]["frog"] == 1
    assert state["checkuse"] == 1
    assert sync(client, operations)["revision"] == state["revision"]


def test_archive_global_ownership_and_whole_batch_rollback(client, account):
    imported = archive("owned-" + account, {"history": {"solved": True}})
    sync(client, [imported])
    other = "other-" + uuid4().hex
    db.ex("INSERT INTO users(id,login,name,role) VALUES(?,?,?,'user')", (other, other, "第二账号"))
    with make_client() as c:
        c.headers["Authorization"] = "Bearer " + security.sign_session(other)
        response = c.post("/api/me/progress/sync", json={"operations": [session("must-rollback"), imported]})
        assert response.status_code == 409
    assert not db.q("SELECT op_id FROM progress_ops WHERE user_id=?", (other,))
    assert not db.q("SELECT id FROM learning_events WHERE user_id=?", (other,))
    assert not db.q("SELECT user_id FROM progress WHERE user_id=?", (other,))


def test_concurrent_archive_claim_has_one_owner_and_no_partial_operations():
    barrier = Barrier(2)
    archive_id = "race-" + uuid4().hex
    users = ["claim-" + uuid4().hex for _ in range(2)]
    for uid in users:
        db.ex("INSERT INTO users(id,login,name,role) VALUES(?,?,?,'user')", (uid, uid, "归属测试"))

    def request(uid):
        with make_client() as c:
            c.headers["Authorization"] = "Bearer " + security.sign_session(uid)
            barrier.wait()
            return uid, c.post("/api/me/progress/sync", json={"operations": [session("new"), archive(archive_id, {})]})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(request, users))
    assert sorted(r.status_code for _, r in results) == [200, 409]
    loser = next(uid for uid, r in results if r.status_code == 409)
    assert not db.q("SELECT op_id FROM progress_ops WHERE user_id=?", (loser,))
    assert not db.q("SELECT id FROM learning_events WHERE user_id=?", (loser,))


def test_late_sunday_failure_monday_success_rebuilds_periods(client, monkeypatch):
    monkeypatch.setattr(projection, "today", lambda: date(2026, 11, 9))
    monday = "2026-11-08T16:01:00Z"
    sunday = "2026-11-08T15:59:00Z"
    before = sync(client, [session("monday-success", at=monday)])
    assert before["tasks"]["daily"].get("retrain", 0) == 0
    state = sync(client, [session("late-sunday-failure", at=sunday, solved=False, grade="F")])
    assert state["tasks"]["day"] == "2026-11-09"
    assert state["tasks"]["daily"]["retrain"] == 1
    assert state["tasks"]["weekly"]["casewin7"] == 1
    assert state["streak"] == {"last": "2026-11-09", "count": 1}


def test_streak_and_tasks_rebuild_when_bridging_day_arrives(client, monkeypatch):
    monkeypatch.setattr(projection, "today", lambda: date(2026, 11, 6))
    sync(client, [session("day4", at="2026-11-03T16:01:00Z"), session("day6", at="2026-11-05T16:01:00Z")])
    result = sync(client, [session("late-day5", at="2026-11-04T16:01:00Z")])
    assert result["streak"] == {"last": "2026-11-06", "count": 3}
    assert result["tasks"]["weekly"]["casewin7"] == 1
    assert result["tasks"]["weekly"]["layers2"] == 1
    result = sync(
        client, [session("case-b", "case-b", chapterId="runtime"), session("case-c", "case-c", chapterId="data")]
    )
    assert result["tasks"]["weekly"]["casewin7"] == 3
    assert result["tasks"]["weekly"]["layers2"] == 2


def test_current_day_checklist_and_hypothesis_and_late_daily_marker(client):
    operations = [
        op("yesterday", "checklist_use", {}, "2026-11-03T10:00:00Z"),
        op("today", "checklist_use", {}),
        op("hypotheses", "task_increment", {"metric": "hypo", "amount": 2}),
    ]
    marker = op("daily-marker", "daily_done", {"caseId": "case-a", "sessionId": "daily-session"})
    result = sync(client, operations + [marker])
    assert result["checkuse"] == 2
    assert result["tasks"]["daily"]["checkuse"] == 1
    assert result["tasks"]["daily"]["hypo"] == 2
    assert result["dailyDone"] == ""
    result = sync(client, [session("daily-session")])
    assert result["dailyDone"] == "2026-11-04"
    assert result["tasks"]["daily"]["dailycase"] == 1


def test_unlocks_union_and_get_rolls_day_without_writes(client, monkeypatch):
    sync(client, [op("unlock1", "unlocked_chapters", {"chapterIds": ["data"]}), op("check", "checklist_use", {})])
    state = sync(client, [op("unlock2", "unlocked_chapters", {"chapterIds": ["runtime"]})])
    assert state["unlockedChapterIds"] == ["data", "runtime"]
    monkeypatch.setattr(projection, "today", lambda: date(2026, 11, 5))
    refreshed = client.get("/api/me/progress").json()
    assert refreshed["tasks"]["day"] == "2026-11-05" and refreshed["tasks"]["daily"] == {}
    assert refreshed["revision"] == state["revision"]


def test_transaction_failure_rolls_back_event_archive_and_projection(client, account, monkeypatch):
    def fail_save(*args):
        raise RuntimeError("模拟提交前故障")

    monkeypatch.setattr(repo, "save", fail_save)
    with pytest.raises(RuntimeError, match="模拟提交前故障"):
        client.post(
            "/api/me/progress/sync",
            json={"operations": [archive("rollback-" + account, {}), session("rollback-session")]},
        )
    assert not db.q("SELECT op_id FROM progress_ops WHERE user_id=?", (account,))
    assert not db.q("SELECT archive_id FROM progress_imports WHERE user_id=?", (account,))
    assert not db.q("SELECT id FROM learning_events WHERE user_id=?", (account,))
    assert not db.q("SELECT user_id FROM progress WHERE user_id=?", (account,))


def test_existing_v1_receipts_are_not_replayed_or_regraded(client, account):
    """切换前投影含的次数已冻结；旧账本可能含重复baseline，不能再次相加。"""
    baseline = {
        "cases": {"old": {"solved": True, "bestGrade": "A", "bestCost": 7, "plays": 3}},
        "streak": {"last": "2026-10-30", "count": 9},
    }
    db.ex(
        "INSERT INTO progress(user_id,payload,legacy_baseline,revision) VALUES(?,?,?,3)",
        (account, db.jdump(baseline), db.jdump(baseline)),
    )
    db.ex(
        "INSERT INTO progress_ops(user_id,op_id,kind,payload,occurred_at,protocol_version) VALUES(?,?,?,?,?,1)",
        (
            account,
            "old-session",
            "session_end",
            db.jdump({"caseId": "old", "solved": True, "grade": "A", "playerCost": 7}),
            "2026-10-30T10:00:00Z",
        ),
    )
    state = sync(client, [session("new-session", "old", playerCost=4)])
    assert state["cases"]["old"]["plays"] == 4
    assert state["cases"]["old"]["bestCost"] == 4
    assert state["legacyBaseline"]["cases"]["old"]["bestCost"] == 7
    assert state["legacyBaseline"]["streak"]["count"] == 9
    assert state["streak"] == {"last": "2026-11-04", "count": 1}


def test_mysql_upgrade_freezes_existing_data_and_replays(monkeypatch):
    """在一次性MySQL实例的独立库重放0004→0005，业务库始终不参与。"""
    from alembic import command
    from core import config, migrate
    from core import db as coredb

    database = "integrity_upgrade_" + uuid4().hex
    admin = coredb.connect()
    admin.execute("CREATE DATABASE " + database)
    try:
        monkeypatch.setattr(config, "MYSQL_DATABASE", database)
        command.upgrade(migrate._cfg(), "0004_learning_events")
        original = {"cases": {"legacy": {"solved": True, "bestGrade": "S", "bestCost": 0, "plays": 8}}}
        db.ex("INSERT INTO progress(user_id,payload,revision) VALUES(?,?,8)", ("legacy-user", db.jdump(original)))
        db.ex(
            "INSERT INTO progress_ops(user_id,op_id,kind,payload,occurred_at) VALUES(?,?,?,?,?)",
            ("legacy-user", "legacy-op", "session_end", "{}", "2026-10-30T00:00:00Z"),
        )
        migrate.upgrade_head()
        migrate.upgrade_head()
        row = db.q("SELECT payload,legacy_baseline,revision FROM progress WHERE user_id=?", ("legacy-user",))[0]
        assert db.jload(row["payload"], {}) == original
        migrated = db.jload(row["legacy_baseline"], {})
        assert migrated["cases"] == original["cases"]
        assert {"error-reading", "contract", "concurrency"} <= set(migrated["unlockedChapterIds"])
        assert row["revision"] == 8
        assert db.q("SELECT protocol_version FROM progress_ops")[0]["protocol_version"] == 1
        assert migrate.current_version() == migrate.head_version()
        command.downgrade(migrate._cfg(), "0004_learning_events")
        migrate.upgrade_head()
        assert (
            db.jload(db.q("SELECT legacy_baseline FROM progress")[0]["legacy_baseline"], {})["cases"]
            == original["cases"]
        )
    finally:
        admin.execute("DROP DATABASE " + database)
        admin.commit()
        admin.close()


def test_operation_time_is_persisted_in_utc(client, account):
    state = sync(client, [session("beijing-midnight", at="2026-11-04T00:00:00+08:00")])
    assert state["tasks"]["daily"]["win"] == 1
    row = db.q("SELECT occurred_at FROM progress_ops WHERE user_id=? AND op_id=?", (account, "beijing-midnight"))[0]
    assert row["occurred_at"] == "2026-11-03T16:00:00+00:00"


def test_equal_timestamps_do_not_invent_an_earlier_failure(client):
    result = sync(client, [session("a-failure", solved=False, grade="F"), session("b-success")])
    assert result["tasks"]["daily"].get("retrain", 0) == 0


def test_frozen_legacy_qualifications_use_old_course_and_preserve_grants(client, account):
    from features.progress.legacy import COURSE

    first = COURSE.chapters[0]
    cases = {cid: {"solved": True} for cid in first.required_case_ids}
    cases["oom-leak"] = {"solved": True}
    original = {"cases": cases, "unlockedChapterIds": ["evolution"]}
    db.ex("INSERT INTO progress(user_id,payload,revision) VALUES(?,?,0)", (account, db.jdump(original)))
    state = sync(client, [])
    assert {"error-reading", "contract", "concurrency", "access", "runtime", "evolution"} <= set(
        state["unlockedChapterIds"]
    )
    assert "build" not in state["unlockedChapterIds"]
    stored = db.jload(
        db.q("SELECT legacy_baseline FROM progress WHERE user_id=?", (account,))[0]["legacy_baseline"], {}
    )
    assert "access" in stored["unlockedChapterIds"] and "runtime" in stored["unlockedChapterIds"]
    assert all("contentRevision" not in result for result in stored["cases"].values())


def test_server_frozen_course_matches_reviewed_source_snapshot():
    import hashlib
    from pathlib import Path

    path = Path(__file__).parents[1] / "features/progress/course-20261104.json"
    assert (
        hashlib.sha256(path.read_bytes()).hexdigest()
        == "98058c75c18ca6e004482351de94a6a6fa1d92056cf9426babb5b28bbf869ea5"
    )
