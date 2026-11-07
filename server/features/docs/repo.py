"""docs 数据访问层：应用文档（隐私政策等长文本）读写。SQL 只在本层。"""

import db


def get_doc(doc_key: str) -> dict | None:
    rows = db.q(
        "SELECT doc_key, content, updated_by, updated_at FROM app_docs WHERE doc_key=?",
        (doc_key,),
    )
    return rows[0] if rows else None


def upsert_doc(doc_key: str, content: str, updated_by: str) -> None:
    db.ex(
        "INSERT INTO app_docs(doc_key, content, updated_by, updated_at) "
        "VALUES(?,?,?,datetime('now')) "
        "ON CONFLICT(doc_key) DO UPDATE SET "
        "content=excluded.content, updated_by=excluded.updated_by, updated_at=excluded.updated_at",
        (doc_key, content, updated_by),
    )
