"""auth 域业务逻辑：登录校验（含哈希升级）、OAuth 用户落库、dev 建号、资料与密码管理。
约定：只抛 HTTPException 表达业务错误，路由层不做业务判断。"""
from fastapi import HTTPException

import db
from core import config, security


def verify_login(login: str, password: str) -> dict:
    """账密校验；历史无盐哈希在登录成功时静默升级为 bcrypt。返回 {id, role}。"""
    rows = db.q("SELECT id, password_hash, role FROM users WHERE id=?", ("pw-" + login,))
    if not rows or not rows[0]["password_hash"] or not security.verify_password(password, rows[0]["password_hash"]):
        raise HTTPException(401, "账号或密码错误")
    if security.is_legacy_hash(rows[0]["password_hash"]):
        db.ex("UPDATE users SET password_hash=? WHERE id=?", (security.hash_password(password), rows[0]["id"]))
    return {"id": rows[0]["id"], "role": rows[0]["role"]}


def upsert_oauth_user(u: dict, role: str) -> None:
    db.ex(
        "INSERT INTO users(id, login, name, avatar, role) VALUES(?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET login=excluded.login, name=excluded.name, avatar=excluded.avatar, role=excluded.role",
        (u["github_id"], u["login"], u["name"], u["avatar"], role),
    )


def dev_upsert_user(login: str) -> str:
    """开发绕行建号（仅 ENV=dev 下被路由调用）。返回 uid。"""
    uid = "dev-" + login
    role = "admin" if (config.DEV_MODE and login.startswith("admin")) else "user"
    db.ex(
        "INSERT INTO users(id, login, name, avatar, role) VALUES(?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET login=excluded.login",
        (uid, login, login, "", role),
    )
    return uid


def update_profile(uid: str, name: str, avatar_url: str | None) -> dict:
    sets, params = ["name=?"], [name]
    if avatar_url is not None:
        sets.append("avatar=?")
        params.append(avatar_url)
    params.append(uid)
    db.ex(f"UPDATE users SET {', '.join(sets)} WHERE id=?", tuple(params))
    rows = db.q("SELECT id, login, name, avatar, role FROM users WHERE id=?", (uid,))
    r = rows[0]
    return {"id": r["id"], "login": r["login"], "name": r["name"], "avatar": r["avatar"], "role": r["role"]}


def change_password(uid: str, old_password: str, new_password: str) -> None:
    rows = db.q("SELECT password_hash FROM users WHERE id=?", (uid,))
    if not rows:
        raise HTTPException(404, "用户不存在")
    current_hash = rows[0]["password_hash"]
    # GitHub 用户没有密码：允许直接设置；账密用户必须校验旧密码
    if current_hash:
        if not old_password:
            raise HTTPException(400, "请输入当前密码")
        if not security.verify_password(old_password, current_hash):
            raise HTTPException(400, "当前密码错误")
    db.ex("UPDATE users SET password_hash=? WHERE id=?", (security.hash_password(new_password), uid))
