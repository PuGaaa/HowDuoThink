"""users 域：管理端用户列表/角色/封禁 + 封禁在登录与请求链路的生效 + 用户自助注销（匿名化）。"""

import os
import uuid

from core import security
from tests.conftest import login_admin, make_client


def _mkuser(login: str, role: str = "user", password: str | None = None) -> str:
    """建测试用户：带密码的走 pw- 命名空间（与 /api/auth/login 的 id 约定一致）；
    login 追加随机后缀，避免与其他测试文件的固定数据撞唯一约束。"""
    import db

    login = f"{login}-{uuid.uuid4().hex[:6]}"
    uid = ("pw-" + login) if password else ("u-" + uuid.uuid4().hex[:8])
    db.ex(
        "INSERT INTO users(id, login, name, role, password_hash) VALUES(?,?,?,?,?)",
        (uid, login, login, role, security.hash_password(password) if password else None),
    )
    return uid


def test_users_list_requires_auth():
    with make_client() as client:
        assert client.get("/api/admin/users").status_code in (401, 403)


def test_users_list_search_and_page_cap():
    with make_client() as client:
        login_admin(client)
        _mkuser("find-me-1")
        _mkuser("find-me-2")
        _mkuser("other")
        r = client.get("/api/admin/users", params={"query": "find-me"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 2
        assert sum(1 for u in body["items"] if u["login"].startswith("find-me-")) == 2
        assert all(u["status"] == "active" for u in body["items"])
        # 页容量上限 100、页码从 1 起
        assert client.get("/api/admin/users", params={"page_size": 101}).status_code == 422
        assert client.get("/api/admin/users", params={"page": 0}).status_code == 422


def test_role_change_rules():
    with make_client() as client:
        login_admin(client)  # 操作者 pw-admin（admin）
        u1 = _mkuser("u1")
        # 正常提权
        r = client.patch(f"/api/admin/users/{u1}/role", json={"role": "editor"})
        assert r.status_code == 200, r.text
        # 不能改自己的角色（防自降级；配合 admin-only 端点即保证始终存在 admin）
        assert client.patch("/api/admin/users/pw-admin/role", json={"role": "user"}).status_code == 400
        # 非法角色值
        assert client.patch(f"/api/admin/users/{u1}/role", json={"role": "superuser"}).status_code == 422
        # 不存在的用户
        assert client.patch("/api/admin/users/no-such/role", json={"role": "user"}).status_code == 404


def test_ban_blocks_login_and_requests():
    with make_client() as admin:
        login_admin(admin)
        pw = "userpw-123"
        u1 = _mkuser("banme", role="user", password=pw)
        login_name = u1[len("pw-") :]  # pw- 命名空间反推真实 login
        with make_client() as user_client:
            r = user_client.post("/api/auth/login", json={"login": login_name, "password": pw})
            assert r.status_code == 200, r.text
            h = {"Authorization": "Bearer " + r.json()["token"]}
            assert user_client.get("/api/me", headers=h).status_code == 200
            # 封禁（admin 用自己的 client 操作，避免 cookie 串号）
            assert admin.patch(f"/api/admin/users/{u1}/status", json={"status": "banned"}).status_code == 200
            # 存量 token 立即被拒
            assert user_client.get("/api/me", headers=h).status_code == 403
            # 登录被拒
            assert user_client.post("/api/auth/login", json={"login": login_name, "password": pw}).status_code == 403
        # 不能封禁自己
        assert admin.patch("/api/admin/users/pw-admin/status", json={"status": "banned"}).status_code == 400
        # 解封后存量 token 恢复
        assert admin.patch(f"/api/admin/users/{u1}/status", json={"status": "active"}).status_code == 200
        with make_client() as user_client:
            assert user_client.get("/api/me", headers=h).status_code == 200


# ---------- 自助注销（POST /api/me/delete）：匿名化而非硬删 ----------

_pw_seq = {"n": 0}


def _mkphone_user() -> tuple[str, str, str, str]:
    """直插手机号账号（带密码，避开同号发码 60s 限频）：返回 (uid, phone, login, password)。
    号段/login 追随机后缀：与 test_auth 等文件的固定数据错开，全量套件共享临时库不撞唯一约束。"""
    import db

    _pw_seq["n"] += 1
    phone = f"1370000{_pw_seq['n']:04d}"[:11]
    password = os.environ["ADMIN_PASSWORD"] + f"-del-{_pw_seq['n']}"
    login_name = "u" + phone[-4:] + uuid.uuid4().hex[:6]
    uid = "ph-" + phone
    db.ex(
        "INSERT INTO users(id, login, name, avatar, role, password_hash, phone) VALUES(?,?,?,?,?,?,?)",
        (uid, login_name, "注销我", "/static/old.png", "user", security.hash_password(password), phone),
    )
    # sms_codes 留一条该号的挑战记录：注销必须把它一并清掉（表内唯一存明文手机号处）
    db.ex("INSERT INTO sms_codes(phone, out_id, expires_at) VALUES(?,?,0)", (phone, "out-del"))
    return uid, phone, login_name, password


def test_delete_account_requires_auth():
    with make_client() as client:
        assert client.post("/api/me/delete").status_code in (401, 403)


def test_delete_account_anonymizes_and_revokes():
    with make_client() as client:
        uid, phone, _login, password = _mkphone_user()
        r = client.post("/api/auth/login", json={"login": phone, "password": password})
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        h = {"Authorization": "Bearer " + token}
        assert client.get("/api/me", headers=h).status_code == 200

        # 注销
        r = client.post("/api/me/delete", headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        # 匿名化落库：手机号/密码/头像清空，昵称占位，login 随机化且不含原手机号，状态 banned
        import db as dbmod

        row = dbmod.q("SELECT id, login, name, avatar, phone, password_hash, status FROM users WHERE id=?", (uid,))[0]
        assert row["phone"] is None
        assert row["password_hash"] is None
        assert row["avatar"] == ""
        assert row["name"] == "已注销用户"
        assert row["status"] == "banned"
        assert row["login"].startswith("deleted-")
        assert phone[-4:] not in row["login"]
        # 短信挑战随手机号一并清除
        assert dbmod.q("SELECT phone FROM sms_codes WHERE phone=?", (phone,)) == []

        # 存量 token 立即被拒（banned → 403）
        assert client.get("/api/me", headers=h).status_code == 403
        # 手机号登录入口不再能进该账号（号已匿名化，重新注册会建新号）
        assert client.post("/api/auth/login", json={"login": phone, "password": password}).status_code == 401


def test_delete_account_visible_in_admin_list():
    with make_client() as client:
        login_admin(client)
        uid, phone, old_login, password = _mkphone_user()
        # 用户登录走独立 client：session cookie 会顶掉同 client 里 admin 的登录态
        with make_client() as user_client:
            r = user_client.post("/api/auth/login", json={"login": phone, "password": password})
            token = r.json()["token"]
            assert user_client.post(
                "/api/me/delete", headers={"Authorization": "Bearer " + token}
            ).status_code == 200

        # 管理员列表可见匿名化结果：按昵称占位可搜到，条目不再含手机号痕迹
        r = client.get("/api/admin/users", params={"query": "已注销"})
        assert r.status_code == 200, r.text
        items = [u for u in r.json()["items"] if u["id"] == uid]
        assert len(items) == 1
        u = items[0]
        assert u["name"] == "已注销用户"
        assert u["status"] == "banned"
        assert u["avatar"] == ""
        assert u["login"].startswith("deleted-")
        assert phone not in u["login"]
        # 按原 login（注销前的登录名）搜不到了
        r = client.get("/api/admin/users", params={"query": old_login})
        assert all(u["id"] != uid for u in r.json()["items"])
