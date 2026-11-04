"""core/db MySQL基础：MySQL 连接参数固定 UTC 会话时区（时间基线统一）。"""


def test_mysql_connect_kwargs_pin_utc_timezone():
    """MySQL 会话时区必须固定 UTC：SQLite 的 datetime('now') 是 UTC，翻译后的
    NOW()/CURRENT_TIMESTAMP 若随服务器本地时区漂移，短信限频/日分组/用量窗口
    会在两引擎下行为分叉（env-drift 红线）。"""
    from core import db as coredb

    kwargs = coredb._mysql_connect_kwargs()
    assert kwargs["init_command"] == "SET time_zone='+00:00'"
    assert kwargs["charset"] == "utf8mb4"
    assert kwargs["autocommit"] is False
    assert kwargs["database"] == coredb.config.MYSQL_DATABASE


def test_current_read_marker_translates_only_at_mysql_boundary():
    from core import db
    from core.db import _translate

    sql = "SELECT 1 AS owner WHERE ?=1 /* FOR UPDATE */"
    assert _translate(sql) == "SELECT 1 AS owner WHERE %s=1 FOR UPDATE"
    with db.tx() as conn:
        assert conn.execute(sql, (1,)).fetchone()["owner"] == 1
