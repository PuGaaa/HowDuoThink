"""MySQL 8 迁移：基线快照、空库重放、配置切换与工作目录独立。"""

import hashlib
import json
from pathlib import Path
from uuid import uuid4

import pytest
import sqlalchemy as sa

from alembic import command
from core import config, migrate

FIXTURE = Path(__file__).parent / "fixtures" / "schema_baseline.mysql.sql"
BUSINESS_TABLES = {
    "users",
    "submissions",
    "cases",
    "articles",
    "sms_codes",
    "progress",
    "meta",
    "ai_conversations",
    "ai_index",
    "ai_messages",
    "ai_usage",
    "user_activity",
    "ops_snapshots",
    "settings",
    "assets",
    "resource_slots",
    "index_tasks",
    "progress_ops",
    "learning_events",
    "progress_imports",
    "submission_requests",
    "submission_messages",
    "submission_reviews",
    "case_previews",
    "learning_event_identities",
    "case_revisions",
}


@pytest.fixture
def new_database(monkeypatch):
    admin = sa.create_engine(config.mysql_database_url())
    databases = []

    def create():
        name = "migration_" + uuid4().hex
        with admin.begin() as conn:
            conn.exec_driver_sql("CREATE DATABASE " + name + " CHARACTER SET utf8mb4")
        databases.append(name)
        monkeypatch.setattr(config, "MYSQL_DATABASE", name)
        return name

    yield create
    with admin.begin() as conn:
        for name in databases:
            conn.exec_driver_sql("DROP DATABASE " + name)
    admin.dispose()


def schema() -> dict[str, str]:
    engine = sa.create_engine(config.mysql_database_url())
    try:
        with engine.connect() as conn:
            tables = [row[0] for row in conn.exec_driver_sql("SHOW TABLES")]
            result = {}
            for name in sorted(tables):
                lines = conn.exec_driver_sql("SHOW CREATE TABLE " + name).one()[1].splitlines()
                body = [line.rstrip(",") for line in lines[1:-1]]
                columns = [line for line in body if line.lstrip().startswith("`")]
                keys = sorted(line for line in body if not line.lstrip().startswith("`"))
                result[name] = lines[0] + "\n" + ",\n".join(columns + keys) + "\n" + lines[-1]
            return result
    finally:
        engine.dispose()


def test_replay_mysql(new_database):
    new_database()
    migrate.upgrade_head()
    assert migrate.current_version() == migrate.head_version()
    command.downgrade(migrate._cfg(), "base")
    assert not (schema().keys() & BUSINESS_TABLES)
    migrate.upgrade_head()
    assert migrate.current_version() == migrate.head_version()
    assert schema().keys() >= BUSINESS_TABLES


def test_downgrade_to_base_mysql(new_database):
    new_database()
    migrate.upgrade_head()
    migrate.downgrade_to_base()
    assert not (schema().keys() & BUSINESS_TABLES)
    assert migrate.current_version() is None


def test_upgrade_uses_current_config(new_database, monkeypatch):
    first = new_database()
    migrate.upgrade_head()
    first_schema = schema()
    second = new_database()
    assert migrate.current_version() is None
    migrate.upgrade_head()
    assert config.MYSQL_DATABASE == second
    assert schema() == first_schema
    monkeypatch.setattr(config, "MYSQL_DATABASE", first)
    assert migrate.current_version() == migrate.head_version()
    assert schema() == first_schema


def test_mysql_url_keeps_special_characters_in_credentials(monkeypatch):
    monkeypatch.setattr(config, "MYSQL_USER", "user@name")
    monkeypatch.setattr(config, "MYSQL_PASSWORD", "p@ss:/?#[]")
    monkeypatch.setattr(config, "MYSQL_HOST", "127.0.0.1")
    monkeypatch.setattr(config, "MYSQL_PORT", 3306)
    monkeypatch.setattr(config, "MYSQL_DATABASE", "hdt_test")
    url = config.mysql_database_url()
    assert (url.username, url.password, url.host, url.port, url.database) == (
        "user@name",
        "p@ss:/?#[]",
        "127.0.0.1",
        3306,
        "hdt_test",
    )
    assert url.query["charset"] == "utf8mb4"


def test_baseline_matches_fixture(new_database):
    new_database()
    command.upgrade(migrate._cfg(), "0001_baseline")
    rendered = "\n\n".join(name + "\n" + ddl for name, ddl in schema().items() if name != "alembic_version") + "\n"
    assert rendered == FIXTURE.read_text()


def test_case_revision_schema(new_database):
    new_database()
    migrate.upgrade_head()
    engine = sa.create_engine(config.mysql_database_url())
    try:
        inspector = sa.inspect(engine)
        columns = {column["name"] for column in inspector.get_columns("cases")}
        assert {"content_revision", "source_type", "source_commit"} <= columns
        revision_columns = {column["name"] for column in inspector.get_columns("case_revisions")}
        assert {
            "case_id",
            "content_revision",
            "content_hash",
            "payload",
            "source_type",
            "source_commit",
            "published_by",
            "published_at",
            "recorded_at",
            "legacy_snapshot",
        } <= revision_columns
        unique_indexes = [index for index in inspector.get_indexes("index_tasks") if index["unique"]]
        assert any(index["column_names"] == ["case_id", "content_revision"] for index in unique_indexes)
    finally:
        engine.dispose()


def test_0010_discards_legacy_sms_codes_and_adds_provider_challenge(new_database):
    new_database()
    command.upgrade(migrate._cfg(), "0009_case_revision_audit")
    engine = sa.create_engine(config.mysql_database_url())
    try:
        with engine.begin() as conn:
            conn.execute(
                sa.text("INSERT INTO sms_codes(phone,code,expires_at,used) VALUES('13800001234','123456',9999999999,0)")
            )
        command.upgrade(migrate._cfg(), "head")
        with engine.connect() as conn:
            challenge = (
                conn.execute(sa.text("SELECT out_id,used FROM sms_codes WHERE phone='13800001234'")).mappings().one()
            )
            columns = {column["name"] for column in sa.inspect(engine).get_columns("sms_codes")}
            assert challenge == {"out_id": "", "used": 1}
            assert {"out_id", "used"} <= columns
            assert "code" not in columns
    finally:
        engine.dispose()


def test_head_and_stamp(new_database):
    new_database()
    assert migrate.current_version() is None
    migrate.stamp_head()
    assert migrate.current_version() == migrate.head_version()
    assert set(schema()) == {"alembic_version"}


def test_upgrade_head_cwd_independent(new_database, monkeypatch, tmp_path):
    new_database()
    monkeypatch.chdir(tmp_path)
    migrate.upgrade_head()
    assert migrate.current_version() == migrate.head_version()
    assert schema().keys() >= BUSINESS_TABLES


def test_0009_preserves_published_payload_without_guessing_author(new_database):
    new_database()
    command.upgrade(migrate._cfg(), "0008_learning_event_identities")
    payload = {
        "id": "legacy-case",
        "title": "旧案例",
        "sourceType": "official",
        "sourceCommit": "6523490cc6b418070c9efbb7045f47761c7c8aa8",
        "contentRevision": 1,
        "scene": {"timeline": "旧现场"},
    }
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    published_at = "2026-11-01 10:20:30"
    engine = sa.create_engine(config.mysql_database_url())
    try:
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    "INSERT INTO cases "
                    "(id,submission_id,author_id,title,domain,layer,difficulty,version,status,payload,"
                    "content_revision,source_type,source_commit,published_at) "
                    "VALUES(:id,NULL,:author,:title,:domain,:layer,:difficulty,:version,'published',:payload,"
                    ":revision,:source_type,:source_commit,:published_at)"
                ),
                {
                    "id": "legacy-case",
                    "author": "old-editor-id",
                    "title": "旧案例",
                    "domain": "runtime",
                    "layer": "engineer",
                    "difficulty": 2,
                    "version": 7,
                    "payload": payload_json,
                    "revision": 1,
                    "source_type": "official",
                    "source_commit": "6523490cc6b418070c9efbb7045f47761c7c8aa8",
                    "published_at": published_at,
                },
            )
        command.upgrade(migrate._cfg(), "head")
        body = {
            key: value
            for key, value in payload.items()
            if key
            not in {
                "baseRevision",
                "contentRevision",
                "sourceType",
                "sourceCommit",
                "sourceHash",
                "submissionId",
                "authorName",
            }
        }
        expected_hash = hashlib.sha256(
            json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        with engine.connect() as conn:
            revision = (
                conn.execute(sa.text("SELECT * FROM case_revisions WHERE case_id='legacy-case' AND content_revision=1"))
                .mappings()
                .one()
            )
            assert revision["payload"] == payload_json
            assert revision["content_hash"] == expected_hash
            assert revision["published_by"] is None
            assert revision["published_at"].strftime("%Y-%m-%d %H:%M:%S") == published_at
            assert revision["source_type"] == "official"
            assert revision["source_commit"] == "6523490cc6b418070c9efbb7045f47761c7c8aa8"
            assert revision["legacy_snapshot"] == 1
            cursor = conn.execute(sa.text("SELECT value FROM meta WHERE meta_key='casepack_version'")).scalar_one()
            assert cursor == "7"
        command.upgrade(migrate._cfg(), "head")
        with engine.connect() as conn:
            count = conn.execute(
                sa.text("SELECT COUNT(*) FROM case_revisions WHERE case_id='legacy-case'")
            ).scalar_one()
            assert count == 1
    finally:
        engine.dispose()


def test_0009_preserves_existing_casepack_cursor(new_database):
    new_database()
    command.upgrade(migrate._cfg(), "0008_learning_event_identities")
    engine = sa.create_engine(config.mysql_database_url())
    try:
        with engine.begin() as conn:
            conn.execute(sa.text("INSERT INTO meta(meta_key,value) VALUES('casepack_version','19')"))
        command.upgrade(migrate._cfg(), "head")
        with engine.connect() as conn:
            cursor = conn.execute(sa.text("SELECT value FROM meta WHERE meta_key='casepack_version'")).scalar_one()
            assert cursor == "19"
    finally:
        engine.dispose()


def test_article_detail_column(new_database):
    new_database()
    migrate.upgrade_head()
    engine = sa.create_engine(config.mysql_database_url())
    try:
        inspector = sa.inspect(engine)
        assert "detail" in {c["name"] for c in inspector.get_columns("articles")}
    finally:
        engine.dispose()
    command.downgrade(migrate._cfg(), "0011_app_docs")
    engine = sa.create_engine(config.mysql_database_url())
    try:
        inspector = sa.inspect(engine)
        assert "detail" not in {c["name"] for c in inspector.get_columns("articles")}
    finally:
        engine.dispose()
