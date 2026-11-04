"""CI 专属合成业务样本；只用于全新的 hdt_backup_ci 测试库，不调用外部服务。"""

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from core import config, db, migrate  # noqa: E402

assert config.MYSQL_DATABASE == "hdt_backup_ci" or config.MYSQL_DATABASE.startswith("hdt_backup_ci_t15_")
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
    ("UPDATE meta SET value=? WHERE meta_key=?", ("7", "casepack_version")),
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
assert db.q("SHOW TABLES LIKE 'case_revisions'")
controls = {
    "baseRevision",
    "contentRevision",
    "sourceType",
    "sourceCommit",
    "sourceHash",
    "submissionId",
    "authorName",
}
body = {key: value for key, value in json.loads(payload).items() if key not in controls}
content_hash = hashlib.sha256(
    json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
).hexdigest()
db.ex(
    "INSERT INTO case_revisions(case_id,content_revision,content_hash,payload,source_type,source_commit,published_by,published_at,legacy_snapshot) "
    "VALUES(?,?,?,?,?,?,?,datetime('now'),?)",
    (
        "backup-fixture",
        3,
        content_hash,
        payload,
        "community",
        "submission:backup-submission:material:3",
        "backup-user",
        0,
    ),
)
assert db.q("SELECT content_revision FROM case_revisions WHERE case_id=?", ("backup-fixture",))[0][
    "content_revision"
] == 3
print("Synthetic backup fixture ready at migration head; no external service invoked.")
