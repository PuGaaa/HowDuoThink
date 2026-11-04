"""种子：把 server/seed/*.json（官方案例）注册为 published case + article。
用法：须在项目 venv 下运行（__main__ 经 core.migrate 先 boot-migrate 建表，
依赖 alembic/sqlalchemy，不再是纯标准库）：cd server && .venv/bin/python seed.py。"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

from features.cases import gate, service  # noqa: E402
from features.cases.models import CasePayload  # noqa: E402


def seed_case(json_path: Path, author: str = "官方") -> None:
    payload = json.loads(json_path.read_text())
    cp = CasePayload(**payload)
    errors = gate.check_case(cp)
    if errors:
        print(f"✗ {cp.id} 未过门禁: {errors}")
        return
    result = service.publish_case("official", cp)
    print(f"✓ seeded {cp.id} (v{result['version']}, revision {result['contentRevision']})")


if __name__ == "__main__":
    from core import migrate

    migrate.upgrade_head()
    seed_dir = HERE / "seed"
    for f in sorted(seed_dir.glob("*.json")):
        seed_case(f)
