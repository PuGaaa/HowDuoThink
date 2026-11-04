"""已校准完整内容的独立社区测试稿，不复用数据库中的官方 ID。"""

from uuid import uuid4

from tests.conftest import load_seed


def community_payload(case_id: str | None = None) -> dict:
    payload = load_seed("first-npe")
    for key in ("contentRevision", "sourceType", "sourceCommit", "sourceHash"):
        payload.pop(key, None)
    payload["id"] = case_id or "c-test-" + uuid4().hex[:12]
    return payload
