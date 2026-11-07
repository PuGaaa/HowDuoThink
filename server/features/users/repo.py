"""users 域数据访问：注销账号的匿名化写入（SQL 只在此层）。

约束事实（0001_baseline）：users.phone 为 UNIQUE 但可空——SQLite 是
WHERE phone IS NOT NULL 的部分唯一索引，MySQL UNIQUE KEY 天然允许多个 NULL，
故注销直接置 NULL 即可，无需占位串，也不会挡住同号重新注册。
"""

import db

DELETED_NAME = "已注销用户"


def get_user(uid: str) -> dict | None:
    rows = db.q("SELECT id, login, phone, status FROM users WHERE id=?", (uid,))
    return rows[0] if rows else None


def anonymize_user(conn, uid: str, anon_login: str) -> None:
    """注销写：手机号置 NULL、login 换随机占位（原 login 按手机号生成，不可保留）、
    昵称改占位、头像清空、密码 hash 作废、状态置 banned（deps.current_user 与
    三条登录链路对 banned 一律拒绝，账号即时不可登录）。uid 不动：保留
    progress/learning-events 等按 uid 关联的数据完整性。"""
    conn.execute(
        "UPDATE users SET login=?, phone=NULL, name=?, avatar='', password_hash=NULL, status='banned' WHERE id=?",
        (anon_login, DELETED_NAME, uid),
    )


def delete_sms_codes(conn, phone: str) -> None:
    """sms_codes 以手机号为主键，是 users 表之外唯一存明文手机号的地方：随注销一并清除。"""
    conn.execute("DELETE FROM sms_codes WHERE phone=?", (phone,))


def login_taken(conn, login: str) -> bool:
    return bool(conn.execute("SELECT id FROM users WHERE login=?", (login,)).fetchall())
