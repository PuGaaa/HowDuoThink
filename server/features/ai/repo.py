"""AI 排错会话历史的数据访问层：ai_conversations / ai_messages。

SQL 全部写 SQLite 方言（? 占位、datetime('now')），由 core/db._translate 统一翻译，
本模块不感知引擎；sources JSON 列经 db.jdump/jload 序列化。
出参字段名按 Web 端契约钉死：列表出参为 camelCase（updatedAt），会话详情为
id/uid/title/created_at/updated_at。
"""

import uuid

import db

_LIST_SQL_LIMIT = 1_000_000  # OFFSET 无界保留的占位上限：两引擎均可绑定的安全大数


def create_conversation(uid: str, title: str) -> str:
    conv_id = uuid.uuid4().hex
    db.ex(
        "INSERT INTO ai_conversations(id, uid, title) VALUES(?, ?, ?)",
        (conv_id, uid, title),
    )
    return conv_id


def get_conversation(conv_id: str, uid: str) -> dict | None:
    rows = db.q(
        "SELECT id, uid, title, created_at, updated_at FROM ai_conversations WHERE id=? AND uid=?",
        (conv_id, uid),
    )
    return rows[0] if rows else None


def list_conversations(uid: str, limit: int, offset: int) -> list[dict]:
    rows = db.q(
        "SELECT id, title, updated_at FROM ai_conversations WHERE uid=? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
        (uid, limit, offset),
    )
    return [{"id": r["id"], "title": r["title"], "updatedAt": r["updated_at"]} for r in rows]


def delete_conversation(conv_id: str, uid: str) -> bool:
    with db.tx() as conn:
        owned = conn.execute(
            "SELECT id FROM ai_conversations WHERE id=? AND uid=?", (conv_id, uid)
        ).fetchall()
        if not owned:
            return False
        conn.execute("DELETE FROM ai_messages WHERE conversation_id=?", (conv_id,))
        conn.execute("DELETE FROM ai_conversations WHERE id=?", (conv_id,))
    return True


def append_messages(conv_id: str, msgs: list[dict]) -> None:
    """追加一轮消息（元素 {role, content, sources}），同事务把会话 updated_at 拨到当前。"""
    with db.tx() as conn:
        for m in msgs:
            sources = m.get("sources")
            conn.execute(
                "INSERT INTO ai_messages(conversation_id, role, content, sources) VALUES(?, ?, ?, ?)",
                (conv_id, m["role"], m["content"], db.jdump(sources) if sources is not None else None),
            )
        conn.execute(
            "UPDATE ai_conversations SET updated_at=datetime('now') WHERE id=?",
            (conv_id,),
        )


def recent_messages(conv_id: str, limit: int) -> list[dict]:
    rows = db.q(
        "SELECT id, role, content, sources FROM ai_messages WHERE conversation_id=? ORDER BY id DESC LIMIT ?",
        (conv_id, limit),
    )
    rows.reverse()  # 倒序取最后 limit 条，翻回 id 升序
    return [
        {"role": r["role"], "content": r["content"], "sources": db.jload(r["sources"], [])}
        for r in rows
    ]


def all_messages(conv_id: str) -> list[dict]:
    """会话全部消息（详情用）：按 id 升序，sources 经 jload 还原，created_at 保持 snake_case（camelCase 组装归 service）。"""
    rows = db.q(
        "SELECT role, content, sources, created_at FROM ai_messages WHERE conversation_id=? ORDER BY id ASC",
        (conv_id,),
    )
    return [
        {
            "role": r["role"],
            "content": r["content"],
            "sources": db.jload(r["sources"], []),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def count_conversations(uid: str) -> int:
    rows = db.q("SELECT COUNT(*) AS n FROM ai_conversations WHERE uid=?", (uid,))
    return int(rows[0]["n"])


def prune_conversations(uid: str, keep: int) -> None:
    """保留 updated_at 最新的 keep 个会话，其余连同消息同事务删除。"""
    with db.tx() as conn:
        stale = conn.execute(
            "SELECT id FROM ai_conversations WHERE uid=? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            (uid, _LIST_SQL_LIMIT, keep),
        ).fetchall()
        if not stale:
            return
        ids = [r["id"] for r in stale]
        marks = ",".join("?" * len(ids))
        conn.execute(f"DELETE FROM ai_messages WHERE conversation_id IN ({marks})", tuple(ids))
        conn.execute(f"DELETE FROM ai_conversations WHERE id IN ({marks})", tuple(ids))
