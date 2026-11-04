"""stats 域：活跃底座（touch 幂等）+ 运营概览口径 + 登录/进度打点接线。"""

import uuid

from tests.conftest import login_admin, make_client

_PW = "statpw-123"


def _mkuser(role: str = "user", password: str | None = None, created_sql: str | None = None) -> tuple[str, str]:
    import db

    login = f"stat-{uuid.uuid4().hex[:6]}"
    uid = ("pw-" + login) if password else ("u-" + uuid.uuid4().hex[:8])
    cols = "id, login, name, role"
    vals = "?,?,?,?"
    params: list = [uid, login, login, role]
    if password:
        from core import security

        cols += ", password_hash"
        vals += ",?"
        params.append(security.hash_password(password))
    if created_sql:
        cols += ", created_at"
        vals += f",{created_sql}"  # 仅测试用，值为 datetime('now','±N day') 字面量
    db.ex(f"INSERT INTO users({cols}) VALUES({vals})", tuple(params))
    return uid, login


def test_touch_idempotent_same_day():
    from features.stats import service

    uid, _ = _mkuser()
    service.touch(uid)
    service.touch(uid)
    import db

    rows = db.q("SELECT * FROM user_activity WHERE user_id=?", (uid,))
    assert len(rows) == 1
    assert rows[0]["hits"] == 2


def test_login_and_progress_touch_activity():
    uid, login = _mkuser(password=_PW)
    with make_client() as c:
        r = c.post("/api/auth/login", json={"login": login, "password": _PW})
        assert r.status_code == 200, r.text
        c.post("/api/me/progress", json={"cases": {}})
        import db

        rows = db.q("SELECT * FROM user_activity WHERE user_id=?", (uid,))
        assert len(rows) == 1  # 同一天：登录 + 进度只记一行
        assert rows[0]["hits"] >= 2


def test_learning_event_requires_login_and_is_idempotent():
    uid, login = _mkuser(password=_PW)
    body = {
        "kind": "verification",
        "sessionId": "session-stat-1",
        "caseId": "first-npe",
        "source": "play",
        "contentRevision": 2,
        "anonymousId": "anon-stat-1",
        "occurredAt": "2026-11-04T10:00:00+08:00",
    }
    with make_client() as c:
        assert c.post("/api/me/learning-events", json=body).status_code == 401
        assert c.post("/api/auth/login", json={"login": login, "password": _PW}).status_code == 200
        assert c.post("/api/me/learning-events", json=body).status_code == 204
        assert c.post("/api/me/learning-events", json=body).status_code == 204
    import db

    rows = db.q("SELECT * FROM learning_events WHERE user_id=? AND kind='verification'", (uid,))
    assert len(rows) == 1
    assert db.jload(rows[0]["payload"], {})["contentRevision"] == 2


def test_guest_learning_event_claims_once_and_rejects_a_second_account():
    uid, login = _mkuser(password=_PW)
    other_uid, other_login = _mkuser(password=_PW)
    body = {
        "eventId": "evt-guest-1",
        "kind": "session_start",
        "sessionId": "session-guest-1",
        "caseId": "first-npe",
        "source": "play",
        "anonymousId": "anon-guest-1",
        "occurredAt": "2026-11-04T10:00:00+08:00",
    }
    with make_client() as c:
        assert c.post("/api/learning-events", json=body).status_code == 204
        assert c.post("/api/learning-events", json=body).status_code == 204
        assert c.post("/api/auth/login", json={"login": login, "password": _PW}).status_code == 200
        assert c.post("/api/me/learning-events/claim", json={"anonymousId": "anon-guest-1"}).status_code == 204
    late = {**body, "eventId": "evt-guest-late", "kind": "review_view"}
    with make_client() as guest:
        assert guest.post("/api/learning-events", json=late).status_code == 204
    with make_client() as b:
        assert b.post("/api/auth/login", json={"login": other_login, "password": _PW}).status_code == 200
        assert b.post("/api/me/learning-events/claim", json={"anonymousId": "anon-guest-1"}).status_code == 409
    import db

    rows = db.q("SELECT id, user_id FROM learning_events WHERE id='client:evt-guest-1'")
    assert rows == [{"id": "client:evt-guest-1", "user_id": uid}]
    late_rows = db.q("SELECT user_id FROM learning_events WHERE id='client:evt-guest-late'")
    assert late_rows == [{"user_id": uid}]
    assert other_uid != uid


def test_learning_metrics_use_verified_end_events_and_mature_windows():
    import db
    from features.stats import service

    samples = [
        (
            "m-start",
            "metrics-start",
            "session_start",
            "2026-11-01T09:00:00+08:00",
            {"sessionId": "s-start", "caseId": "c1"},
        ),
        (
            "m-review",
            "metrics-start",
            "review_view",
            "2026-11-02T09:00:00+08:00",
            {"sessionId": "s-start", "caseId": "c1"},
        ),
        (
            "m-unverified",
            "metrics-unverified",
            "session_start",
            "2026-11-01T09:00:00+08:00",
            {"sessionId": "s-unverified", "caseId": "c1"},
        ),
        (
            "m-unverified-end",
            "metrics-unverified",
            "session_end",
            "2026-11-02T09:00:00+08:00",
            {"sessionId": "s-unverified", "caseId": "c1", "solved": True},
        ),
        (
            "m-effective",
            "metrics-effective",
            "session_start",
            "2026-11-01T09:00:00+08:00",
            {"sessionId": "s-effective", "caseId": "c1"},
        ),
        (
            "m-effective-v",
            "metrics-effective",
            "verification",
            "2026-11-02T09:00:00+08:00",
            {"sessionId": "s-effective", "caseId": "c1"},
        ),
        (
            "m-effective-end",
            "metrics-effective",
            "session_end",
            "2026-11-02T09:00:00+08:00",
            {"sessionId": "s-effective", "caseId": "c1", "solved": True},
        ),
    ]
    for event_id, user_id, kind, occurred_at, payload in samples:
        db.ex(
            "INSERT INTO learning_events(id,user_id,anonymous_id,kind,occurred_at,payload) VALUES(?,?,?,?,?,?)",
            (event_id, user_id, "anon-metrics", kind, occurred_at, db.jdump(payload)),
        )
    metrics = service.learning_metrics("2026-11-04")
    assert metrics["d1"] == {"eligibleUsers": 3, "retainedUsers": 1}


def test_overview_endpoint():
    import db

    u1, _ = _mkuser(created_sql="datetime('now','-1 day')")
    u2, _ = _mkuser()
    old, _ = _mkuser(created_sql="datetime('now','-40 day')")
    from features.stats import service

    today = service.today_str()
    yesterday = service.today_str(-1)
    service.touch(u1, today)
    service.touch(u2, today)
    service.touch(u1, yesterday)
    service.touch(old, today)  # 40 天前注册的老用户今天活跃——算 DAU

    db.ex(
        "INSERT INTO submissions(id, user_id, title, symptom, resolution) VALUES('s-st1',?,'t','s','r')",
        (u1,),
    )
    db.ex(
        "INSERT INTO submissions(id, user_id, title, symptom, resolution, status) VALUES('s-st2',?,'t','s','r','accepted')",
        (u1,),
    )
    db.ex(
        "INSERT INTO cases(id, title, domain, layer, difficulty, version, status, payload) VALUES('c-st1','t','d','l',1,1,'published','{}')"
    )
    db.ex(
        "INSERT INTO cases(id, title, domain, layer, difficulty, version, status, payload, published_at) "
        "VALUES('c-st2','t','d','l',1,1,'published','{}', datetime('now'))"
    )
    db.ex(
        "INSERT INTO progress(user_id, payload) VALUES(?, ?)",
        (u1, db.jdump({"cases": {"c-st1": {"solved": True}, "c-st2": {"solved": False}, "c-st3": {"solved": True}}})),
    )

    with make_client() as c:
        login_admin(c)
        r = c.get("/api/admin/stats/overview", params={"days": 7})
        assert r.status_code == 200, r.text
        body = r.json()
        # 今天/窗口内活跃数会被其他测试文件的登录污染，断言端点口径与直接查库一致
        expected_today = db.q("SELECT COUNT(DISTINCT user_id) AS n FROM user_activity WHERE day=?", (today,))[0]["n"]
        expected_window = db.q(
            "SELECT COUNT(DISTINCT user_id) AS n FROM user_activity WHERE day>=?", (service.today_str(-7),)
        )[0]["n"]
        expected_new = db.q(
            "SELECT COUNT(*) AS n FROM users WHERE substr(created_at,1,10)>=?", (service.today_str(-7),)
        )[0]["n"]
        by_day = {d["day"]: d["active"] for d in body["activeDaily"]}
        assert by_day.get(today) == expected_today
        assert by_day.get(yesterday) == 1  # 只有 u1 在昨天活跃
        assert body["dauToday"] == expected_today
        assert body["activeUsersTotal"] == expected_window
        assert body["newUsers"] == expected_new
        assert expected_new >= 3  # u1 昨日 + u2 今日 + pw-admin（启动种子）
        subs_total = db.q("SELECT COUNT(*) AS n FROM submissions")[0]["n"]
        subs_accepted = db.q("SELECT COUNT(*) AS n FROM submissions WHERE status='accepted'")[0]["n"]
        assert body["submissions"]["total"] == subs_total
        assert body["submissions"]["accepted"] == subs_accepted
        assert body["submissions"]["total"] >= 2
        expected_pub = db.q(
            "SELECT COUNT(*) AS n FROM cases WHERE status='published' AND substr(published_at,1,10)>=?",
            (service.today_str(-7),),
        )[0]["n"]
        assert body["publishedInWindow"] == expected_pub
        assert body["publishedInWindow"] >= 1  # c-st2 在窗口内发布
        assert body["publishedTotal"] >= 2
        prog_rows = db.q("SELECT payload FROM progress")
        exp_users_with_prog = sum(1 for r in prog_rows if db.jload(r["payload"], {}).get("cases"))
        exp_solved = sum(
            1 for r in prog_rows for v in db.jload(r["payload"], {}).get("cases", {}).values() if v.get("solved")
        )
        assert body["progress"]["usersWithProgress"] == exp_users_with_prog
        assert body["progress"]["solvedTotal"] == exp_solved
        assert exp_solved >= 2  # u1 的 progress 贡献 2 个 solved
        # 未登录 401/403
        assert make_client().get("/api/admin/stats/overview").status_code in (401, 403)
