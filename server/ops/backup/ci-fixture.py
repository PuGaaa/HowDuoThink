"""CI 专属合成业务样本；只用于全新 hdt_backup_ci，不调用外部服务。"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from core import config, db, migrate  # noqa: E402

assert config.MYSQL_DATABASE == "hdt_backup_ci" or config.MYSQL_DATABASE.startswith("hdt_restore_")
assert migrate.current_version() == migrate.head_version()
assert db.q("SELECT COUNT(*) AS n FROM users")[0]["n"] == 0

payload = json.dumps(
    {"id": "backup-fixture", "contentRevision": 3, "text": "中文、引号'、换行\n与emoji🌟"}, ensure_ascii=False
)
statements = [
    ("INSERT INTO users(id,login,name) VALUES(?,?,?)", ("backup-user", "backup-fixture", "合成作者")),
    (
        "INSERT INTO submissions(id,user_id,title,symptom,resolution,request_id,linked_case_id,status) VALUES(?,?,?,?,?,?,?,?)",
        (
            "backup-submission",
            "backup-user",
            "合成原稿",
            "证据",
            "处理",
            "stable-request",
            "backup-fixture",
            "accepted",
        ),
    ),
    (
        "INSERT INTO submission_reviews(submission_id,source_revision,material_source_revision,material_version,material,confirmed_version,reviewed_material_version,decision,candidate_ids) VALUES(?,?,?,?,?,?,?,?,?)",
        ("backup-submission", 2, 2, 3, payload, 3, 3, "distinct", "[]"),
    ),
    (
        "INSERT INTO submission_requests(user_id,request_id,submission_id) VALUES(?,?,?)",
        ("backup-user", "stable-request", "backup-submission"),
    ),
    (
        "INSERT INTO submission_messages(submission_id,author_id,visibility,kind,body) VALUES(?,?,?,?,?)",
        ("backup-submission", "backup-user", "author", "consent", "确认第3版公开范围"),
    ),
    (
        "INSERT INTO cases(id,submission_id,author_id,title,domain,layer,difficulty,version,status,payload,content_revision,source_type,source_commit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            "backup-fixture",
            "backup-submission",
            "backup-user",
            "恢复样本",
            "other",
            "运行",
            1,
            7,
            "published",
            payload,
            3,
            "community",
            "submission:backup-submission:material:3",
        ),
    ),
    ("INSERT INTO meta(meta_key,value) VALUES(?,?)", ("casepack_version", "7")),
    (
        "INSERT INTO articles(id,source_type,source_id,title,layer,domain,steps,lessons,author) VALUES(?,?,?,?,?,?,?,?,?)",
        ("backup-article", "case", "backup-fixture", "恢复文章", "运行", "other", "[]", "[]", "合成作者"),
    ),
    (
        "INSERT INTO progress(user_id,payload,revision,legacy_baseline) VALUES(?,?,?,?)",
        ("backup-user", '{"cases":{"backup-fixture":{"solved":true}}}', 4, '{"unlockedChapterIds":["error-reading"]}'),
    ),
    (
        "INSERT INTO progress_ops(user_id,op_id,kind,payload,occurred_at,protocol_version,session_id) VALUES(?,?,?,?,?,?,?)",
        ("backup-user", "backup-op", "finishRun", payload, "2026-11-04T00:00:00Z", 2, "backup-session"),
    ),
    (
        "INSERT INTO progress_imports(archive_id,user_id,payload) VALUES(?,?,?)",
        ("backup-archive", "backup-user", payload),
    ),
    (
        "INSERT INTO learning_events(id,user_id,anonymous_id,kind,occurred_at,payload) VALUES(?,?,?,?,?,?)",
        ("backup-event", "backup-user", "backup-anon", "run_finished", "2026-11-04T00:00:00Z", payload),
    ),
    ("INSERT INTO learning_event_identities(anonymous_id,user_id) VALUES(?,?)", ("backup-anon", "backup-user")),
]
conn = db.connect()
try:
    for sql, params in statements:
        conn.execute(sql, params)
    conn.commit()
finally:
    conn.close()
print("Synthetic backup fixture ready at migration head; no external service invoked.")
