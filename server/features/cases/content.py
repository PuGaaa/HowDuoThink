"""发布正文的唯一哈希口径：模型默认值规范化，剔除版本与追溯字段。"""

import hashlib
import json
from pathlib import Path

from features.cases.models import CasePayload

CONTROL_FIELDS = {
    "baseRevision",
    "contentRevision",
    "sourceType",
    "sourceCommit",
    "sourceHash",
    "submissionId",
    "authorName",
    "calibrationStatus",
}
_catalog = json.loads((Path(__file__).with_name("official_ids.json")).read_text())
OFFICIAL_IDS = set(_catalog["ids"])
LEGACY_HASHES = _catalog["legacyContentHashes"]
LEGACY_SOURCE_COMMIT = _catalog["legacySourceCommit"]
OFFICIAL_PUBLICATIONS = _catalog["publications"]


def body(payload: CasePayload) -> dict:
    return {key: value for key, value in payload.model_dump(by_alias=True).items() if key not in CONTROL_FIELDS}


def content_hash(payload: CasePayload) -> str:
    canonical = json.dumps(body(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()
