"""submissions 域·投稿频控：按用户日限额（DB 计数）防刷审核队列。"""

import time
from uuid import uuid4

from tests.conftest import login_admin, make_client


def _body() -> dict:
    return {
        "requestId": uuid4().hex,
        "title": "测试投稿标题",
        "symptom": "服务启动后接口批量超时",
        "resolution": "扩容连接池并回滚发布",
    }


def test_submission_daily_limit():
    """当日投稿数达限额：429，不再入队（防脚本刷爆管理端审核队列）。"""
    import db
    from features.submissions import service as sub

    with make_client() as client:
        login_admin(client)
        today = time.strftime("%Y-%m-%d", time.gmtime())
        try:
            for i in range(sub.SUBMISSION_DAILY_LIMIT):
                db.ex(
                    "INSERT INTO submissions(id, user_id, title, symptom, resolution, created_at) VALUES(?,?,?,?,?,?)",
                    (f"s-limit-{i:03d}", "pw-admin", "t", "s", "r", today + " 00:00:00"),
                )
            r = client.post("/api/submissions", json=_body())
            assert r.status_code == 429, r.text
            rows = db.q("SELECT COUNT(*) AS n FROM submissions WHERE user_id='pw-admin'")
            assert rows[0]["n"] == sub.SUBMISSION_DAILY_LIMIT  # 未新增
        finally:
            db.ex("DELETE FROM submissions WHERE user_id='pw-admin' AND title='t'")


def test_submission_below_limit_ok():
    """限额内正常投稿不受影响。"""
    import db

    try:
        with make_client() as client:
            login_admin(client)
            r = client.post("/api/submissions", json=_body())
            assert r.status_code == 200, r.text
    finally:
        db.ex("DELETE FROM submissions WHERE title='测试投稿标题'")
