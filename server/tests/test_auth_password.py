"""auth 域：密码设置/修改与 /api/me 的 hasPassword 资料字段。

测试密码一律从 conftest 注入的 ADMIN_PASSWORD 派生，文件内不落明文凭据。
"""

import os

from core import security
from tests.conftest import login_admin, make_client

# conftest 已 os.environ["ADMIN_PASSWORD"] = ...（见 tests/conftest.py）
_OLD = os.environ["ADMIN_PASSWORD"]
_NEW = _OLD + "-v2"
_WRONG = _OLD + "-wrong"


def _insert_sms_user(uid: str):
    """短信验证码建号用户：未设置过密码（password_hash 为空）。"""
    import db

    db.ex(
        "INSERT INTO users(id, login, name, avatar, role) VALUES(?,?,?,?,?)",
        (uid, uid, uid, "", "user"),
    )


def _bearer(client, uid: str):
    client.headers.update({"Authorization": "Bearer " + security.sign_session(uid)})


def test_me_has_password_false_for_sms_user(): 
    """无密码账号：资料里 hasPassword=False（App 据此显示「设置密码」）。"""
    with make_client() as client:
        _insert_sms_user("pw-less-1")
        _bearer(client, "pw-less-1")
        r = client.get("/api/me")
        assert r.status_code == 200
        assert r.json()["hasPassword"] is False


def test_set_password_without_old_then_flag_flips():
    """无密码账号直接设新密码（无需旧密码），flag 翻转且新密码可登录。"""
    with make_client() as client:
        _insert_sms_user("pw-less-2")
        _bearer(client, "pw-less-2")
        r = client.post("/api/me/password", json={"newPassword": _NEW})
        assert r.status_code == 200
        r = client.get("/api/me")
        assert r.json()["hasPassword"] is True
    with make_client() as fresh:
        r = fresh.post("/api/auth/login", json={"login": "pw-less-2", "password": _NEW})
        assert r.status_code == 200


def test_change_password_requires_old():
    """已设密码账号：必须校验旧密码——缺失/错误都 400，正确才允许修改。"""
    with make_client() as client:
        login_admin(client)
        r = client.post("/api/me/password", json={"newPassword": _NEW})
        assert r.status_code == 400
        r = client.post("/api/me/password", json={"oldPassword": _WRONG, "newPassword": _NEW})
        assert r.status_code == 400
        r = client.post("/api/me/password", json={"oldPassword": _OLD, "newPassword": _NEW})
        assert r.status_code == 200
        r = client.get("/api/me")
        assert r.json()["hasPassword"] is True
