"""保留旧投影与账本，建立全局档案归属和对局唯一结算约束。"""

import json
from pathlib import Path

import sqlalchemy as sa

from alembic import op

revision = "0005_progress_integrity"
down_revision = "0004_learning_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("progress", sa.Column("legacy_baseline", sa.Text(), nullable=True))
    op.execute("UPDATE progress SET legacy_baseline=payload")
    bind = op.get_bind()
    # 迁移保留当时算法与冻结数据，不依赖后续可能变化的业务模型。
    course = json.loads((Path(__file__).resolve().parents[2] / "features/progress/course-20261104.json").read_text())
    for row in bind.execute(sa.text("SELECT user_id,legacy_baseline FROM progress")).mappings().all():
        baseline = json.loads(row["legacy_baseline"])
        solved = {cid for cid, result in baseline.get("cases", {}).items() if result.get("solved")}
        unlocked = set(baseline.get("unlockedChapterIds", []))
        previous = {}
        for chapter in course["chapters"]:
            prior = previous.get(chapter["part"])
            if prior is None or chapter["challengeCaseId"] in solved or set(prior["requiredCaseIds"]) <= solved:
                unlocked.add(chapter["id"])
            previous[chapter["part"]] = chapter
        baseline["unlockedChapterIds"] = sorted(unlocked)
        bind.execute(
            sa.text("UPDATE progress SET legacy_baseline=:baseline WHERE user_id=:uid"),
            {"baseline": json.dumps(baseline, ensure_ascii=False), "uid": row["user_id"]},
        )
    op.add_column("progress_ops", sa.Column("protocol_version", sa.Integer(), nullable=False, server_default="2"))
    op.execute("UPDATE progress_ops SET protocol_version=1")
    op.add_column("progress_ops", sa.Column("session_id", sa.String(191), nullable=True))
    op.create_index("ux_progress_session", "progress_ops", ["user_id", "session_id"], unique=True)
    op.create_table(
        "progress_imports",
        sa.Column("archive_id", sa.String(191), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
    )


def downgrade() -> None:
    op.drop_table("progress_imports")
    op.drop_index("ux_progress_session", table_name="progress_ops")
    with op.batch_alter_table("progress_ops") as batch:
        batch.drop_column("session_id")
        batch.drop_column("protocol_version")
    with op.batch_alter_table("progress") as batch:
        batch.drop_column("legacy_baseline")
