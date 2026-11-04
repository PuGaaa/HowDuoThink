"""auth 域业务逻辑：登录校验（含哈希升级）、OAuth 用户落库、dev 建号、资料与密码管理。
约定：只抛 HTTPException 表达业务错误，路由层不做业务判断。"""

import secrets
import threading
import time

from fastapi import HTTPException

import db
from core import config, security, settings
from core import sms as sms_core

# ---------- 登录防爆破（进程内滑动窗口；单 worker 部署形态下即全局） ----------

_LOGIN_FAILURES: dict[str, list[float]] = {}
_throttle_lock = threading.Lock()


def _throttle_check(key: str) -> None:
    """窗口内失败次数达上限即拒绝（429）——先于任何校验执行，不再消耗一次 bcrypt。阈值经管理端「系统设置」即时可调。"""
    now = time.time()
    lock_seconds = int(settings.get("login.lock_seconds"))
    max_failures = int(settings.get("login.max_failures"))
    with _throttle_lock:
        fails = [t for t in _LOGIN_FAILURES.get(key, []) if now - t < lock_seconds]
        _LOGIN_FAILURES[key] = fails
        if len(fails) >= max_failures:
            raise HTTPException(429, "尝试次数过多，请稍后再试")


def _throttle_fail(key: str) -> None:
    with _throttle_lock:
        _LOGIN_FAILURES.setdefault(key, []).append(time.time())


def _throttle_clear(key: str) -> None:
    with _throttle_lock:
        _LOGIN_FAILURES.pop(key, None)


def verify_login(login: str, password: str) -> dict:
    """账密校验（带防爆破频控）；按已有 login 或绑定 phone 查询。"""
    key = "pw:" + login.lower()
    _throttle_check(key)
    rows = db.q(
        "SELECT id, login, name, avatar, password_hash, role, status FROM users WHERE login=?",
        (login,),
    )
    if not rows:
        rows = db.q(
            "SELECT id, login, name, avatar, password_hash, role, status FROM users WHERE phone=?",
            (login,),
        )
    if not rows:
        # 兼容历史种子账号：旧数据曾把登录名写成 pw-<login>，仅作为存量读取路径。
        rows = db.q(
            "SELECT id, login, name, avatar, password_hash, role, status FROM users WHERE id=?",
            ("pw-" + login,),
        )
    if not rows or not rows[0]["password_hash"] or not security.verify_password(password, rows[0]["password_hash"]):
        _throttle_fail(key)
        raise HTTPException(401, "账号或密码错误")
    if rows[0]["status"] == "banned":
        # 密码正确但被封禁：同样计入失败——不许被封用户绕开频控无限消耗 bcrypt
        _throttle_fail(key)
        raise HTTPException(403, "账号已被封禁")
    _throttle_clear(key)
    if security.is_legacy_hash(rows[0]["password_hash"]):
        db.ex("UPDATE users SET password_hash=? WHERE id=?", (security.hash_password(password), rows[0]["id"]))
    return {
        "id": rows[0]["id"],
        "login": rows[0]["login"],
        "name": rows[0]["name"] or rows[0]["login"],
        "avatar": rows[0]["avatar"] or "",
        "role": rows[0]["role"],
    }


def ensure_active(uid: str) -> None:
    """封禁账号拒绝登录（三种入口共用：账密/GitHub/手机验证码）。"""
    rows = db.q("SELECT status FROM users WHERE id=?", (uid,))
    if rows and rows[0]["status"] == "banned":
        raise HTTPException(403, "账号已被封禁")


def uses_default_password() -> bool:
    """登录页提示探测：pw-admin 是否还在用初始密码（改过密即 False）。"""
    rows = db.q("SELECT password_hash FROM users WHERE id='pw-admin'")
    if not rows or not rows[0]["password_hash"]:
        return False
    return security.verify_password(config.DEFAULT_ADMIN_PASSWORD, rows[0]["password_hash"])


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


def get_profile(uid: str) -> dict:
    rows = db.q("SELECT id, login, name, avatar, role FROM users WHERE id=?", (uid,))
    if not rows:
        raise HTTPException(401, "用户不存在")
    r = rows[0]
    return {"id": r["id"], "login": r["login"], "name": r["name"], "avatar": r["avatar"], "role": r["role"]}


def update_profile(uid: str, name: str, avatar_url: str | None) -> dict:
    sets, params = ["name=?"], [name]
    if avatar_url is not None:
        sets.append("avatar=?")
        params.append(avatar_url)
    params.append(uid)
    db.ex(f"UPDATE users SET {', '.join(sets)} WHERE id=?", tuple(params))
    return get_profile(uid)


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

_NICK_ADJ = ["机警的", "敏锐的", "沉稳的", "好奇的", "冷静的", "执着的", "灵巧的"]
_NICK_NOUN = ["小海豚", "小柴犬", "小狐狸", "猫头鹰", "小熊猫", "小猎豹", "小海獭"]


def random_nickname() -> str:
    """注册默认昵称：可爱代号（编辑页可随时改）。"""
    import random

    return random.choice(_NICK_ADJ) + random.choice(_NICK_NOUN)


def send_sms_code(phone: str) -> dict:
    """生成并下发验证码；60s 重发限频。dev 模式响应带 devEcho 供联调；通道不可用映射 503。"""
    import db as _db

    last = _db.q("SELECT created_at FROM sms_codes WHERE phone=?", (phone,))
    if last:
        created = last[0]["created_at"]
        # created_at 为 UTC 字符串，用时间差做限频
        import datetime

        t = datetime.datetime.strptime(created, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc).timestamp()
        if time.time() - t < sms_core.resend_interval_sec():
            raise HTTPException(429, "发送太频繁，稍后再试")
    code = sms_core.new_code()
    expires = int(time.time()) + sms_core.code_ttl_sec()
    _db.ex(
        "INSERT INTO sms_codes(phone, code, expires_at, used) VALUES(?,?,?,0) "
        "ON CONFLICT(phone) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, used=0, created_at=datetime('now')",
        (phone, code, expires),
    )
    try:
        return sms_core.send_code(phone, code)
    except sms_core.SmsChannelUnavailable as e:
        raise HTTPException(503, str(e))


def _consume_code(conn, phone: str, code: str) -> None:
    """在给定事务连接上原子消费验证码：单条 UPDATE 的 rowcount 判定。
    原"先读后写"两步在并发下同一验证码可双花；失败/过期在此计一次防爆破失败。"""
    key = "sms:" + phone
    _throttle_check(key)
    now = int(time.time())
    cur = conn.execute(
        "UPDATE sms_codes SET used=1 WHERE phone=? AND used=0 AND code=? AND expires_at>?",
        (phone, code, now),
    )
    if cur.rowcount != 1:
        _throttle_fail(key)
        row = conn.execute("SELECT expires_at FROM sms_codes WHERE phone=?", (phone,)).fetchone()
        if row and row["expires_at"] is not None and int(row["expires_at"]) <= now:
            raise HTTPException(401, "验证码已过期，请重新获取")
        raise HTTPException(401, "验证码错误")
    _throttle_clear(key)


def phone_login(phone: str, code: str) -> dict:
    """验证码登录：验码 → 按手机号找用户/创建 → 返回真实资料。
    验码消费与账号写入同事务（建号失败验证码不被烧掉）；被封禁用户在消费前拦截。"""
    existing = db.q("SELECT id, login, role, name FROM users WHERE phone=?", (phone,))
    if existing:
        ensure_active(existing[0]["id"])
    with db.tx() as conn:
        _consume_code(conn, phone, code)
        if existing:
            return {
                "id": existing[0]["id"],
                "login": existing[0]["login"],
                "role": existing[0]["role"],
                "name": existing[0]["name"],
                "created": False,
            }
        uid = "ph-" + phone
        login_name = "u" + phone[-4:] + phone[:3]
        name = random_nickname()
        try:
            conn.execute(
                "INSERT INTO users(id, login, name, role, phone) VALUES(?,?,?,?,?)",
                (uid, login_name, name, "user", phone),
            )
        except Exception:
            # 唯一冲突（id/phone/login 皆可能）：login 追随机后缀重试一次；仍冲突说明
            # 并发建号已赢，回读返回既有账号——非冲突类异常原样上抛交全局兜底
            login_name = login_name + secrets.token_hex(2)
            try:
                conn.execute(
                    "INSERT INTO users(id, login, name, role, phone) VALUES(?,?,?,?,?)",
                    (uid, login_name, name, "user", phone),
                )
            except Exception:
                winner = db.q("SELECT id, login, role, name FROM users WHERE phone=?", (phone,))
                if not winner:
                    raise
                return {
                    "id": winner[0]["id"],
                    "login": winner[0]["login"],
                    "role": winner[0]["role"],
                    "name": winner[0]["name"],
                    "created": False,
                }
        return {"id": uid, "login": login_name, "role": "user", "name": name, "created": True}


def bind_phone(uid: str, phone: str, code: str) -> dict:
    """已登录用户绑定手机号：绑定后可用验证码登录同一账号（注册互通的关键）。
    验码消费与绑定同事务：绑定冲突回滚后验证码不被烧掉。"""
    with db.tx() as conn:
        _consume_code(conn, phone, code)
        rows = conn.execute("SELECT id FROM users WHERE phone=?", (phone,)).fetchall()
        if rows and rows[0]["id"] != uid:
            raise HTTPException(409, "该手机号已绑定其他账号")
        conn.execute("UPDATE users SET phone=? WHERE id=?", (phone, uid))
    return {"ok": True, "phone": phone}
