"""users 域业务逻辑：管理端用户列表/角色/封禁 + 用户自助注销账号。
约定：只抛 HTTPException；防自改（角色/封禁）——配合端点 admin-only 即保证系统始终有 admin。"""

import secrets

from fastapi import HTTPException

import db
from features.users import repo


def delete_account(uid: str) -> dict:
    """注销账号（Apple 5.1.1(v)）：匿名化而非硬删，uid 保留。

    匿名化（PII 不可回溯）：
    - 手机号置 NULL（users.phone 唯一但可空，两引擎都允许多 NULL；sms_codes 里
      以手机号为主键的短信挑战一并删除——注销后该号不再有任何可核验挑战）；
    - login 换随机占位 deleted-<hex>：原 login 按手机号生成（u+尾4+前3），不能保留，
      且列 UNIQUE NOT NULL 必须有唯一值；事务内查重，撞车换随机串重试；
    - 昵称 →「已注销用户」；头像清空；密码 hash 作废（账密登录即失效）；
    - status → banned：core/deps.current_user 每请求检查，旧 token 立即 403；
      三条登录链路（账密/手机验证码/GitHub）同样拒绝 banned。

    保留（按 uid 关联、无 PII、不指向个人身份）：progress 云进度、learning-events、
    user_activity、ai_usage、submissions/cases 作者引用。解封（admin 改 status）也
    无法恢复登录：无手机号、无密码、login 为随机串。
    """
    user = repo.get_user(uid)
    if not user:
        raise HTTPException(404, "用户不存在")
    phone = user["phone"]
    with db.tx() as conn:
        for _ in range(5):
            anon_login = "deleted-" + secrets.token_hex(8)
            if not repo.login_taken(conn, anon_login):
                break
        else:
            raise HTTPException(500, "注销失败，请稍后再试")
        repo.anonymize_user(conn, uid, anon_login)
        if phone:
            repo.delete_sms_codes(conn, phone)
    return {"ok": True}


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
