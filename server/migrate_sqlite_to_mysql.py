"""一次性数据迁移：SQLite data.db → MySQL。

前置：.env.dev.local 或环境变量已配好 MYSQL_*（host/port/user/password/database），
      且目标库已建表（启动一次后端即自动建表）。
用法：cd server && DB_PROVIDER=mysql MYSQL_*... ./.venv/bin/python migrate_sqlite_to_mysql.py [sqlite路径]
幂等：按主键 ON DUPLICATE KEY UPDATE，可重复执行。
"""
import os
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import core.config as config  # noqa: E402

if config.DB_PROVIDER != "mysql":
    sys.exit("请先设置 DB_PROVIDER=mysql（以及 MYSQL_HOST/PORT/USER/PASSWORD/DATABASE）")

from core import db as mysql_db  # noqa: E402

SQLITE_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "data.db"

# 迁移顺序：无外键约束，但按业务依赖排序便于阅读
TABLES = ["users", "submissions", "cases", "articles", "sms_codes", "progress", "meta", "ai_index"]

# 历史列名 → 目标列名（progress.blob 在双引擎改造时更名 payload）
COLUMN_RENAMES = {"progress": {"blob": "payload"}}


def main() -> None:
    src = sqlite3.connect(SQLITE_PATH)
    src.row_factory = sqlite3.Row

    total_rows = 0
    for table in TABLES:
        rows = src.execute(f"SELECT * FROM {table}").fetchall()
        if not rows:
            print(f"  {table}: 0 行，跳过")
            continue
        renames = COLUMN_RENAMES.get(table, {})
        cols = [renames.get(c, c) for c in rows[0].keys()]
        col_list = ", ".join(cols)
        ph_list = ", ".join("?" for _ in cols)
        for row in rows:
            mysql_db.ex(
                f"INSERT INTO {table}({col_list}) VALUES({ph_list}) "
                f"ON DUPLICATE KEY UPDATE {', '.join(c + '=VALUES(' + c + ')' for c in cols)}",
                tuple(row[src] for src in rows[0].keys()),
            )
        total_rows += len(rows)
        print(f"  {table}: {len(rows)} 行 ✓")

    counts = ", ".join(f"{t}={mysql_db.q(f'SELECT COUNT(*) AS n FROM {t}')[0]['n']}" for t in TABLES)
    print(f"迁移完成：共 {total_rows} 行。MySQL 侧计数：{counts}")


if __name__ == "__main__":
    main()
