"""种子：把 server/seed/*.json（官方案例）注册为 published case + article。
用法：须在项目 venv 下运行（__main__ 经 core.migrate 先 boot-migrate 建表，
依赖 alembic/sqlalchemy，不再是纯标准库）：cd server && .venv/bin/python seed.py。"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import db  # noqa: E402
from features.cases import gate  # noqa: E402
from features.cases.models import CasePayload  # noqa: E402


def seed_case(json_path: Path, author: str = "官方") -> None:
    payload = json.loads(json_path.read_text())
    cp = CasePayload(**payload)
    errors = gate.check_case(cp)
    if errors:
        print(f"✗ {cp.id} 未过门禁: {errors}")
        return
    version = db.next_version()
    d = cp.model_dump(by_alias=True)
    d["submissionId"] = None
    d["authorName"] = "官方"
    exists = db.q("SELECT id FROM cases WHERE id=?", (cp.id,))
    if exists:
        db.ex(
            "UPDATE cases SET payload=?, title=?, domain=?, layer=?, difficulty=?, version=?, status='published', published_at=datetime('now') WHERE id=?",
            (db.jdump(d), cp.title, cp.domain, cp.layer, cp.difficulty, version, cp.id),
        )
    else:
        db.ex(
            "INSERT INTO cases(id, submission_id, author_id, title, domain, layer, difficulty, version, status, payload, published_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'))",
            (cp.id, None, "official", cp.title, cp.domain, cp.layer, cp.difficulty, version, "published", db.jdump(d)),
        )
    # 文章投影
    article_id = "a-" + cp.id
    steps = []
    for st in cp.expert_chain:
        act_name = next((a.name for a in cp.actions if a.id == st.action_id), "")
        steps.append(
            {
                "observe": st.thought,
                "act": act_name if st.action_id else "（推理收束，停止收集）",
                "found": st.conclusion,
            }
        )
    db.ex(
        "INSERT INTO articles(id, source_type, source_id, title, layer, domain, steps, lessons, author) "
        "VALUES(?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET title=excluded.title, steps=excluded.steps, lessons=excluded.lessons, published_at=datetime('now')",
        (
            article_id,
            "case",
            cp.id,
            cp.title,
            cp.layer,
            cp.domain,
            db.jdump(steps),
            db.jdump([it.text for it in cp.lessons]),
            author,
        ),
    )
    print(f"✓ seeded {cp.id} (v{version})")


if __name__ == "__main__":
    from core import migrate

    migrate.upgrade_head()
    seed_dir = HERE / "seed"
    for f in sorted(seed_dir.glob("*.json")):
        seed_case(f)
