"""投稿幂等、受限编审记录与版本化脱敏授权。"""

import hashlib
import json
import unicodedata

import sqlalchemy as sa

from alembic import op

revision = "0006_submission_review"
down_revision = "0005_progress_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in [
        sa.Column("request_id", sa.String(80)),
        sa.Column("content_fingerprint", sa.String(64)),
        sa.Column("linked_case_id", sa.String(64)),
        sa.Column("parent_submission_id", sa.String(64)),
    ]:
        op.add_column("submissions", column)
    # 原稿不改写；完全相同的旧稿仅以最早一份作为今后提交的幂等参照，不自动合并贡献。
    bind = op.get_bind()
    seen = set()
    for row in bind.execute(sa.text("SELECT * FROM submissions ORDER BY created_at,id")).mappings().all():
        material = {
            key: unicodedata.normalize("NFC", (row[key] or "").replace("\r\n", "\n").strip())
            for key in ["title", "symptom", "resolution", "key_error", "timeline", "domain_hint"]
        }
        material["lessons"] = [
            unicodedata.normalize("NFC", value.replace("\r\n", "\n").strip()) for value in json.loads(row["lessons"])
        ]
        material["stack_tags"] = sorted(set(json.loads(row["stack_tags"])))
        digest = hashlib.sha256(json.dumps(material, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        key = (row["user_id"], digest)
        if key not in seen:
            seen.add(key)
            bind.execute(
                sa.text("UPDATE submissions SET content_fingerprint=:digest WHERE id=:sid"),
                {"digest": digest, "sid": row["id"]},
            )
    op.create_index("ux_submission_fingerprint", "submissions", ["user_id", "content_fingerprint"], unique=True)
    op.create_index("ux_submission_request", "submissions", ["user_id", "request_id"], unique=True)
    op.create_table(
        "submission_requests",
        sa.Column("user_id", sa.String(64), primary_key=True),
        sa.Column("request_id", sa.String(80), primary_key=True),
        sa.Column("submission_id", sa.String(64), nullable=False),
    )
    op.create_table(
        "submission_messages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("submission_id", sa.String(64), nullable=False, index=True),
        sa.Column("author_id", sa.String(64), nullable=False),
        sa.Column("visibility", sa.String(16), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
    )
    op.create_table(
        "submission_reviews",
        sa.Column("submission_id", sa.String(64), primary_key=True),
        sa.Column("source_revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("material_source_revision", sa.Integer(), nullable=False, server_default="-1"),
        sa.Column("material_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("material", sa.Text()),
        sa.Column("confirmed_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reviewed_material_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("decision", sa.String(24)),
        sa.Column("mechanism", sa.Text()),
        sa.Column("evidence", sa.Text()),
        sa.Column("reasoning", sa.Text()),
        sa.Column("candidate_ids", sa.Text(), nullable=False),
        sa.Column("reviewer_id", sa.String(64)),
    )

    op.execute("INSERT INTO submission_reviews(submission_id,candidate_ids) SELECT id,'[]' FROM submissions")


def downgrade() -> None:
    for table in ["submission_reviews", "submission_messages", "submission_requests"]:
        op.drop_table(table)
    op.drop_index("ux_submission_request", table_name="submissions")
    op.drop_index("ux_submission_fingerprint", table_name="submissions")
    with op.batch_alter_table("submissions") as batch:
        for column in ["parent_submission_id", "linked_case_id", "content_fingerprint", "request_id"]:
            batch.drop_column(column)
