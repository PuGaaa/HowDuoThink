"""候选只供人工查重；文字重合排序不代表同事故概率，也不自动拒稿。"""

import hashlib
import json
import re
import unicodedata
from typing import Any

from features.submissions import repo
from features.submissions.models import SubmissionMaterial


def fingerprint(material: SubmissionMaterial) -> str:
    raw = material.model_dump()
    normalized = {
        key: unicodedata.normalize("NFC", (raw[key] or "").replace("\r\n", "\n").strip())
        for key in ["title", "symptom", "resolution", "key_error", "timeline", "domain_hint"]
    }
    normalized["lessons"] = [
        unicodedata.normalize("NFC", value.replace("\r\n", "\n").strip()) for value in material.lessons
    ]
    normalized["stack_tags"] = sorted(set(material.stack_tags))
    return hashlib.sha256(json.dumps(normalized, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def _tokens(value: str) -> set[str]:
    words = set(re.findall(r"[a-zA-Z0-9_.:-]+", value.lower()))
    for phrase in re.findall(r"[\u4e00-\u9fff]+", value):
        words.update(phrase[i : i + 2] for i in range(len(phrase) - 1))
    return words


def candidates(conn: Any, query: str, sid: str = "", editor: bool = False) -> list[dict]:
    rows = []
    for item in repo.published_candidates(conn):
        if item["submission_id"] == sid:
            continue
        payload = json.loads(item["payload"])
        text = item["title"] + " " + payload.get("intro", "") + " " + payload.get("layer", "")
        rows.append(
            {
                "id": item["id"],
                "kind": "case",
                "status": item["status"],
                "title": item["title"],
                "excerpt": text[:200],
                "url": "/solutions/a-" + item["id"],
                "_revision": item["payload"],
            }
        )
    if editor:
        drafts, submissions = repo.private_candidates(conn, sid)
        for item in drafts:
            payload = json.loads(item["payload"])
            rows.append(
                {
                    "id": item["id"],
                    "kind": "case",
                    "status": "draft",
                    "title": item["title"],
                    "excerpt": str(payload.get("intro", ""))[:200],
                    "url": None,
                    "_revision": item["payload"],
                }
            )
        for item in submissions:
            rows.append(
                {
                    "id": item["id"],
                    "kind": "submission",
                    "status": item["status"],
                    "title": item["title"],
                    "excerpt": item["symptom"][:200],
                    "url": None,
                    "_revision": item["symptom"] + item["resolution"],
                }
            )
    for item in rows:
        item["key"] = (
            item["kind"]
            + ":"
            + item["id"]
            + ":"
            + hashlib.sha256((item.pop("_revision") + item["status"]).encode()).hexdigest()[:16]
        )
    query_tokens = _tokens(query)
    for item in rows:
        words = _tokens(item["title"] + " " + item["excerpt"])
        item["score"] = len(query_tokens & words)
    rows.sort(key=lambda item: (-item["score"], item["kind"], item["id"]))
    return rows[:10]


def for_submission(conn: Any, submission) -> list[dict]:
    review = repo.review(conn, submission["id"])
    source = (
        json.loads(review["material"])
        if review["material"]
        else {"title": submission["title"], "symptom": submission["symptom"]}
    )
    return candidates(conn, source["title"] + " " + source["symptom"], submission["id"], editor=True)
