"""短信认证切换到 PNVS：存外部挑战号，不再保存验证码明文。"""

import sqlalchemy as sa

from alembic import op

revision = "0010_pnvs_sms_challenges"
down_revision = "0009_case_revision_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sms_codes",
        sa.Column("out_id", sa.String(191), nullable=False, server_default=""),
    )
    op.execute("UPDATE sms_codes SET out_id='', used=1")
    op.drop_column("sms_codes", "code")


def downgrade() -> None:
    op.add_column(
        "sms_codes",
        sa.Column("code", sa.String(16), nullable=False, server_default=""),
    )
    op.drop_column("sms_codes", "out_id")
