"""安全原语：bcrypt 密码哈希（含历史无盐哈希兼容升级）+ JWT 会话签发/校验。"""

import hashlib
import hmac
import time

import bcrypt
import jwt

from core.config import JWT_SECRET


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def is_legacy_hash(hashed: str) -> bool:
    return not hashed.startswith("$2")


def _legacy_sha256(password: str) -> str:
    return hashlib.sha256(("think:" + password).encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    """兼容历史无盐 SHA256 哈希（登录成功后由调用方升级为 bcrypt）。"""
    if hashed.startswith("$2"):
        try:
            return bcrypt.checkpw(password.encode(), hashed.encode())
        except ValueError:
            return False
    return hmac.compare_digest(_legacy_sha256(password), hashed)


def sign_session(user_id: str, days: int = 30) -> str:
    return jwt.encode({"uid": user_id, "exp": int(time.time()) + days * 86400}, JWT_SECRET, algorithm="HS256")


def verify_session(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload["uid"]
    except Exception:
        return None


def sign_preview(preview_id: str, expires_at: int) -> str:
    return jwt.encode({"pid": preview_id, "purpose": "case_preview", "exp": expires_at}, JWT_SECRET, algorithm="HS256")


def sign_password_reset(user_id: str, minutes: int = 10) -> str:
    """忘记密码重置票据：短时有效。载荷故意不带 uid 字段——verify_session 取不到 uid 即拒绝，
    票据无法冒充登录会话。"""
    return jwt.encode(
        {"rid": user_id, "purpose": "password_reset", "exp": int(time.time()) + minutes * 60},
        JWT_SECRET,
        algorithm="HS256",
    )


def verify_password_reset(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("purpose") != "password_reset":
            return None
        return payload["rid"]
    except Exception:
        return None


def verify_preview(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("purpose") != "case_preview":
            return None
        return payload["pid"]
    except Exception:
        return None
