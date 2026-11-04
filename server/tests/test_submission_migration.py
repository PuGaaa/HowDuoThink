"""MySQL8 存量投稿升级：原稿保留、重复旧稿不强合并、重复升级不改数据。"""

from uuid import uuid4

import sqlalchemy as sa

from alembic import command
from core import config, migrate


def test_existing_submissions_keep_originals_and_receive_one_dedupe_anchor(monkeypatch):
    database = "submission_migration_" + uuid4().hex
    admin = sa.create_engine(config.mysql_database_url())
    with admin.begin() as conn:
        conn.exec_driver_sql("CREATE DATABASE " + database + " CHARACTER SET utf8mb4")
    try:
        monkeypatch.setattr(config, "MYSQL_DATABASE", database)
        command.upgrade(migrate._cfg(), "0005_progress_integrity")
        engine = sa.create_engine(config.mysql_database_url())
        try:
            with engine.begin() as conn:
                conn.execute(
                    sa.text("INSERT INTO users(id,login,name) VALUES('legacy-review','legacy-review','旧作者')")
                )
                for sid, title in [("s-old-first", "旧稿 SQL 500"), ("s-old-copy", "  旧稿 SQL 500  ")]:
                    conn.execute(
                        sa.text(
                            "INSERT INTO submissions(id,user_id,title,symptom,resolution,lessons,stack_tags,created_at) VALUES(:id,'legacy-review',:title,'原始敏感日志不应在升级时改变','原来的解决过程','[]','[]',:created)"
                        ),
                        {
                            "id": sid,
                            "title": title,
                            "created": "2026-10-01 00:00:00" if sid == "s-old-first" else "2026-10-02 00:00:00",
                        },
                    )
            migrate.upgrade_head()
            migrate.upgrade_head()
            with engine.connect() as conn:
                originals = (
                    conn.execute(
                        sa.text("SELECT id,title,symptom,content_fingerprint FROM submissions ORDER BY created_at")
                    )
                    .mappings()
                    .all()
                )
                assert len(originals) == 2
                assert originals[0]["content_fingerprint"] and originals[1]["content_fingerprint"] is None
                assert originals[1]["title"] == "  旧稿 SQL 500  "
                assert {row["symptom"] for row in originals} == {"原始敏感日志不应在升级时改变"}
                reviews = (
                    conn.execute(
                        sa.text("SELECT material,confirmed_version,decision,candidate_ids FROM submission_reviews")
                    )
                    .mappings()
                    .all()
                )
                assert len(reviews) == 2
                assert all(
                    row["material"] is None
                    and row["confirmed_version"] == 0
                    and row["decision"] is None
                    and row["candidate_ids"] == "[]"
                    for row in reviews
                )
        finally:
            engine.dispose()
    finally:
        with admin.begin() as conn:
            conn.exec_driver_sql("DROP DATABASE " + database)
        admin.dispose()
