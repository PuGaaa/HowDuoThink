"""AI 会话历史 repo 层：直接 import db 造数据，不走 HTTP。

会话按 updated_at 倒序是排序契约，而同一秒内批量创建的 updated_at 并列，
排序相关用例先把 updated_at 拨到分明的过去时刻，保证断言确定。
"""

import db
from features.ai import repo


def test_create_and_get_owned():
    uid = "u-owner"
    conv_id = repo.create_conversation(uid, "连接池耗尽排查")
    conv = repo.get_conversation(conv_id, uid)
    assert conv is not None
    assert conv["id"] == conv_id
    assert conv["uid"] == uid
    assert conv["title"] == "连接池耗尽排查"
    assert conv["created_at"] and conv["updated_at"]
    # uid 不符视同不存在
    assert repo.get_conversation(conv_id, "u-stranger") is None


def test_list_order_and_fields():
    uid = "u-list"
    first = repo.create_conversation(uid, "最早")
    second = repo.create_conversation(uid, "居中")
    third = repo.create_conversation(uid, "最新")
    # 同秒并列会让倒序不确定：拨成分明的过去时刻
    for cid, ts in [(first, "2026-01-01 00:00:01"), (second, "2026-01-01 00:00:02"), (third, "2026-01-01 00:00:03")]:
        db.ex("UPDATE ai_conversations SET updated_at=? WHERE id=?", (ts, cid))
    rows = repo.list_conversations(uid, 10, 0)
    assert [r["title"] for r in rows] == ["最新", "居中", "最早"]
    assert rows[0]["id"] == third
    # 字段名钉死为 id/title/updatedAt（camelCase 出参）
    assert set(rows[0].keys()) == {"id", "title", "updatedAt"}
    assert rows[0]["updatedAt"] == "2026-01-01 00:00:03"
    # 分页：offset 跳过最新 1 条
    paged = repo.list_conversations(uid, 1, 1)
    assert [r["title"] for r in paged] == ["居中"]


def test_append_and_recent():
    uid = "u-msgs"
    conv_id = repo.create_conversation(uid, "多轮排错")
    msgs = []
    for i in range(8):
        role = "user" if i % 2 == 0 else "assistant"
        msgs.append({"role": role, "content": f"消息{i}", "sources": None if role == "user" else [f"case-{i}-片段"]})
    db.ex("UPDATE ai_conversations SET updated_at='2020-01-01 00:00:00' WHERE id=?", (conv_id,))
    repo.append_messages(conv_id, msgs)
    # 同一事务内 updated_at 被拨回当前
    conv = repo.get_conversation(conv_id, uid)
    assert conv["updated_at"] > "2020-01-01 00:00:00"
    # 最后 6 条按 id 升序返回，sources 已还原
    recent = repo.recent_messages(conv_id, 6)
    assert [m["content"] for m in recent] == [f"消息{i}" for i in range(2, 8)]
    assert [m["role"] for m in recent] == ["user", "assistant", "user", "assistant", "user", "assistant"]
    assert recent[0]["sources"] == []
    assert recent[1]["sources"] == ["case-3-片段"]
    assert recent[-1]["sources"] == ["case-7-片段"]


def test_delete_scoped():
    uid = "u-del"
    conv_id = repo.create_conversation(uid, "要删的会话")
    repo.append_messages(conv_id, [{"role": "user", "content": "接口 500 了", "sources": None}])
    # 他人删除返回 False 且两表不动
    assert repo.delete_conversation(conv_id, "u-stranger") is False
    assert repo.get_conversation(conv_id, uid) is not None
    assert len(db.q("SELECT * FROM ai_messages WHERE conversation_id=?", (conv_id,))) == 1
    # 属主删除返回 True，两表皆空
    assert repo.delete_conversation(conv_id, uid) is True
    assert repo.get_conversation(conv_id, uid) is None
    assert db.q("SELECT * FROM ai_messages WHERE conversation_id=?", (conv_id,)) == []
    assert db.q("SELECT * FROM ai_conversations WHERE id=?", (conv_id,)) == []


def test_prune_keeps_latest():
    uid = "u-prune"
    ids = [repo.create_conversation(uid, f"会话{i}") for i in range(105)]
    for cid in ids[:5]:
        repo.append_messages(cid, [{"role": "user", "content": f"旧消息{cid}", "sources": None}])
    # 最旧 5 个拨回过去，避免与其余 100 个同秒并列
    for cid in ids[:5]:
        db.ex("UPDATE ai_conversations SET updated_at='2020-01-01 00:00:00' WHERE id=?", (cid,))
    repo.prune_conversations(uid, 100)
    assert repo.count_conversations(uid) == 100
    remaining = {r["id"] for r in repo.list_conversations(uid, 500, 0)}
    assert not (set(ids[:5]) & remaining)
    assert set(ids[5:]) <= remaining
    # 被裁剪会话的消息同事务连删
    for cid in ids[:5]:
        assert db.q("SELECT * FROM ai_messages WHERE conversation_id=?", (cid,)) == []
