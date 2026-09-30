"""auth 域业务逻辑：登录校验（含哈希升级）、OAuth 用户落库、dev 建号、资料与密码管理。
约定：只抛 HTTPException 表达业务错误，路由层不做业务判断。"""
from fastapi import HTTPException

import secrets
import time

import db
from core import config, security
from core import sms as sms_core


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


# ---------- 手机号身份 ----------

def send_sms_code(phone: str) -> dict:
    """生成并下发验证码；60s 重发限频。dev 模式响应带 devEcho 供联调。"""
    import db as _db

    last = _db.q("SELECT created_at FROM sms_codes WHERE phone=?", (phone,))
    if last:
        created = last[0]["created_at"]
        # created_at 为 UTC 字符串，用时间差做限频
        import datetime

        t = datetime.datetime.strptime(created, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc).timestamp()
        if time.time() - t < sms_core.RESEND_INTERVAL_SECONDS:
            raise HTTPException(429, "发送太频繁，稍后再试")
    code = sms_core.new_code()
    expires = int(time.time()) + sms_core.CODE_TTL_SECONDS
    _db.ex(
        "INSERT INTO sms_codes(phone, code, expires_at, used) VALUES(?,?,?,0) "
        "ON CONFLICT(phone) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, used=0, created_at=datetime('now')",
        (phone, code, expires),
    )
    return sms_core.send_code(phone, code)


def _consume_code(phone: str, code: str) -> None:
    row = db.q("SELECT code, expires_at, used FROM sms_codes WHERE phone=?", (phone,))
    if not row or row[0]["used"] or row[0]["code"] != code:
        raise HTTPException(401, "验证码错误")
    if int(time.time()) > int(row[0]["expires_at"]):
        raise HTTPException(401, "验证码已过期，请重新获取")
    db.ex("UPDATE sms_codes SET used=1 WHERE phone=?", (phone,))


def phone_login(phone: str, code: str) -> dict:
    """验证码登录：验码 → 按手机号找用户/创建（ph- 前缀）→ 返回 {id, login, role, created}。"""
    _consume_code(phone, code)
    rows = db.q("SELECT id, login, role FROM users WHERE phone=?", (phone,))
    if rows:
        return {"id": rows[0]["id"], "login": rows[0]["login"], "role": rows[0]["role"], "created": False}
    uid = "ph-" + phone
    login_name = "u" + phone[-4:] + phone[:3]
    try:
        db.ex(
            "INSERT INTO users(id, login, name, role, phone) VALUES(?,?,?,?,?)",
            (uid, login_name, "手机用户" + phone[-4:], "user", phone),
        )
    except Exception:
        # login 唯一冲突（极小概率）：追加随机后缀重试
        login_name = login_name + secrets.token_hex(2)
        db.ex(
            "INSERT INTO users(id, login, name, role, phone) VALUES(?,?,?,?,?)",
            (uid, login_name, "手机用户" + phone[-4:], "user", phone),
        )
    return {"id": uid, "login": login_name, "role": "user", "created": True}


def bind_phone(uid: str, phone: str, code: str) -> dict:
    """已登录用户绑定手机号：绑定后可用验证码登录同一账号（注册互通的关键）。"""
    _consume_code(phone, code)
    rows = db.q("SELECT id, phone FROM users WHERE phone=?", (phone,))
    if rows and rows[0]["id"] != uid:
        raise HTTPException(409, "该手机号已绑定其他账号")
    db.ex("UPDATE users SET phone=? WHERE id=?", (phone, uid))
    return {"ok": True, "phone": phone}
