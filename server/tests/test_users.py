"""users 域：管理端用户列表/角色/封禁 + 封禁在登录与请求链路的生效。"""
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
        login_name = u1[len("pw-"):]  # pw- 命名空间反推真实 login
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
