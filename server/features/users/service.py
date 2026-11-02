"""users 域业务逻辑：管理端用户列表/角色/封禁。
约定：只抛 HTTPException；防自改（角色/封禁）——配合端点 admin-only 即保证系统始终有 admin。"""

from fastapi import HTTPException

import db


def list_users(query: str | None, page: int, page_size: int) -> dict:
    where, params = "1=1", []
    if query:
        where = "(login LIKE ? OR name LIKE ?)"
        like = f"%{query}%"
        params = [like, like]
    total = db.q(f"SELECT COUNT(*) AS n FROM users WHERE {where}", tuple(params))[0]["n"]
    rows = db.q(
        f"SELECT id, login, name, avatar, role, status, created_at FROM users WHERE {where} "
        f"ORDER BY created_at DESC LIMIT ? OFFSET ?",
        tuple(params + [page_size, (page - 1) * page_size]),
    )
    return {"total": total, "items": [dict(r) for r in rows]}


def update_role(target: str, role: str, operator: str) -> dict:
    if target == operator:
        raise HTTPException(400, "不能修改自己的角色")
    if not db.q("SELECT id FROM users WHERE id=?", (target,)):
        raise HTTPException(404, "用户不存在")
    db.ex("UPDATE users SET role=? WHERE id=?", (role, target))
    return {"id": target, "role": role}


def set_status(target: str, status: str, operator: str) -> dict:
    if target == operator:
        raise HTTPException(400, "不能封禁/解封自己")
    if not db.q("SELECT id FROM users WHERE id=?", (target,)):
        raise HTTPException(404, "用户不存在")
    db.ex("UPDATE users SET status=? WHERE id=?", (status, target))
    return {"id": target, "status": status}
