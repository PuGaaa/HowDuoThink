"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision}
Create Date: ${create_date}

本项目惯例（双引擎）：upgrade()/downgrade() 内按 op.get_bind().dialect.name 写分支——
sqlite 分支用 SCHEMA 方言（IF NOT EXISTS / partial index / datetime('now')），
mysql 分支用 SCHEMA_MYSQL 方言（UNIQUE KEY / INDEX 内联 / DATETIME）。
每条 DDL 独立一个 op.execute，禁止两条 CREATE 共用一个 execute 字符串。
"""

# revision identifiers, used by Alembic.
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
