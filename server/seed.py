"""从受信 Git 发布产物导入官方案例；正文/修订/hash不匹配即停止，不猜版本。"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

from features.cases import service  # noqa: E402
from features.cases.models import CasePayload, OfficialRelease  # noqa: E402


def seed_case(json_path: Path) -> dict:
    artifact = json.loads(json_path.read_text())
    payload = CasePayload.model_validate(artifact["payload"])
    release = OfficialRelease.model_validate(artifact["publication"])
    result = service.import_official(payload, release)
    print(
        f"✓ {payload.id} revision={result['contentRevision']} cursor={result['version']} unchanged={result['unchanged']}"
    )
    return result


if __name__ == "__main__":
    from core import migrate

    migrate.upgrade_head()
    for file in sorted((HERE / "seed").glob("*.json")):
        seed_case(file)
