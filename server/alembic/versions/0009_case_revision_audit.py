"""保留案例已发布修订快照；历史只记录可证明字段，不猜发布操作者。"""

import hashlib
import json

import sqlalchemy as sa

from alembic import op

revision = "0009_case_revision_audit"
down_revision = "0008_learning_event_identities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "case_revisions",
        sa.Column("case_id", sa.String(64), primary_key=True),
        sa.Column("content_revision", sa.Integer(), primary_key=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("source_type", sa.String(32)),
        sa.Column("source_commit", sa.String(191)),
        sa.Column("published_by", sa.String(64)),
        sa.Column("published_at", sa.DateTime()),
        sa.Column("recorded_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column("legacy_snapshot", sa.Integer(), nullable=False, server_default="0"),
    )
    bind = op.get_bind()
    meta = sa.Table("meta", sa.MetaData(), autoload_with=bind)
    key = list(meta.primary_key.columns)[0]
    if bind.execute(sa.select(key).where(key == "casepack_version")).first() is None:
        highest = bind.execute(sa.text("SELECT COALESCE(MAX(version),0) FROM cases")).scalar_one()
        bind.execute(meta.insert().values(**{key.name: "casepack_version", "value": str(highest)}))
    controls = {
        "baseRevision",
        "contentRevision",
        "sourceType",
        "sourceCommit",
        "sourceHash",
        "submissionId",
        "authorName",
    }
    for row in bind.execute(
        sa.text(
            "SELECT id,content_revision,payload,source_type,source_commit,published_at FROM cases WHERE status='published'"
        )
    ).mappings():
        payload = json.loads(row["payload"])
        body = {key: value for key, value in payload.items() if key not in controls}
        digest = hashlib.sha256(
            json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        bind.execute(
            sa.text(
                "INSERT INTO case_revisions(case_id,content_revision,content_hash,payload,source_type,source_commit,published_at,legacy_snapshot) VALUES(:id,:rev,:hash,:payload,:source,:commit,:time,1)"
            ),
            dict(
                id=row["id"],
                rev=row["content_revision"],
                hash=digest,
                payload=row["payload"],
                source=row["source_type"],
                commit=row["source_commit"],
                time=row["published_at"],
            ),
        )


def downgrade() -> None:
    op.drop_table("case_revisions")
