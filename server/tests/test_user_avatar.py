"""用户头像上传数据层测试：独立 user-avatar 分类、类型/大小校验、日限 10、公开清单排除；
HTTP 入口 POST /api/me/avatar（bearer 登录、异常映射、读文件前的 503/413 闸）。
不依赖本机 OSS 配置：oss.configured / oss.put_bytes 一律 monkeypatch。"""

import base64
import os

import pytest

from features.assets import service as svc

# 测试密码从 conftest 注入的 ADMIN_PASSWORD 派生，文件内不落明文凭据
_WEB_PW = os.environ["ADMIN_PASSWORD"] + "-ua"

# 1x1 透明 PNG（base64 内联；校验发生在 ext/大小层，不解析图片内容）
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


@pytest.fixture()
def fake_oss(monkeypatch):
    """假 OSS 层：configured() 恒真，put_bytes 只记录 object_key 不打真实网络。"""
    from features.assets import oss

    calls = {"put": []}

    def _put(object_key, data, content_type):
        calls["put"].append(object_key)

    monkeypatch.setattr(oss, "configured", lambda: True)
    monkeypatch.setattr(oss, "put_bytes", _put)
    # 补齐桶直连域名的两个配置项，URL 断言不依赖本机 env
    monkeypatch.setattr("core.config.OSS_ENDPOINT", "https://oss-cn-hangzhou.aliyuncs.com")
    monkeypatch.setattr("core.config.OSS_BUCKET", "howduo-test")
    return calls


def test_upload_user_avatar_ok(fake_oss):
    import db

    url = svc.upload_user_avatar(PNG_1PX, "me.png", "ua-ok-1")
    assert "/user-avatar/" in url
    rows = db.q("SELECT * FROM assets WHERE category='user-avatar' AND uploaded_by='ua-ok-1'")
    assert len(rows) == 1
    assert rows[0]["note"] == "user:ua-ok-1"
    assert url.endswith(rows[0]["object_key"])


def test_reject_svg_and_gif(fake_oss):
    with pytest.raises(svc.AssetError):
        svc.upload_user_avatar(b"<svg/>", "a.svg", "ua-ext-1")
    with pytest.raises(svc.AssetError):
        svc.upload_user_avatar(PNG_1PX, "a.gif", "ua-ext-2")


def test_reject_oversize(fake_oss):
    big = PNG_1PX + b"\x00" * (2 * 1024 * 1024 + 1 - len(PNG_1PX))
    with pytest.raises(svc.AssetError):
        svc.upload_user_avatar(big, "big.png", "ua-big-1")
    assert fake_oss["put"] == []


def test_daily_limit_10(fake_oss):
    uid = "ua-limit-1"
    for i in range(10):
        # 字节内容互不相同：避开同分类同内容秒传（秒传不落新行会少计数）
        svc.upload_user_avatar(PNG_1PX + bytes([i]), f"d{i}.png", uid)
    with pytest.raises(svc.RateLimitError):
        svc.upload_user_avatar(PNG_1PX + b"\xff", "d10.png", uid)
    # 另一 uid 不受影响
    url = svc.upload_user_avatar(PNG_1PX + b"\xfe", "other.png", "ua-limit-2")
    assert "/user-avatar/" in url


def test_manifest_excludes_user_avatar(fake_oss):
    url = svc.upload_user_avatar(PNG_1PX + b"m", "hidden.png", "ua-manifest-1")
    m = svc.manifest()
    assert all(i["url"] != url for i in m["items"])
    res = svc.app_resources()
    assert url not in res["avatars"]


# ---------- HTTP 入口 POST /api/me/avatar ----------


def _make_login_user(login_name: str) -> None:
    """测试库直接建普通用户（bcrypt 密码），供 bearer 登录走 HTTP 入口。"""
    import db
    from core import security

    db.ex(
        "INSERT INTO users(id, login, name, role, password_hash) VALUES(?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET role=excluded.role, password_hash=excluded.password_hash",
        (f"pw-{login_name}", login_name, login_name, "user", security.hash_password(_WEB_PW)),
    )


def _bearer_login(client, login_name: str) -> dict:
    r = client.post("/api/auth/login", json={"login": login_name, "password": _WEB_PW})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_me_avatar_roundtrip(fake_oss):
    """普通用户 bearer 登录上传 png：200 + avatar 为任务 1 风格 URL，且 GET /api/me 一致。"""
    from tests.conftest import make_client

    _make_login_user("ua-web-1")
    with make_client() as client:
        auth = _bearer_login(client, "ua-web-1")
        r = client.post("/api/me/avatar", files={"file": ("me.png", PNG_1PX, "image/png")}, headers=auth)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "/user-avatar/" in body["avatar"]
        # 资料已持久化：GET /api/me 返回同一 avatar
        me = client.get("/api/me", headers=auth).json()
        assert me["avatar"] == body["avatar"]


def test_me_avatar_rejects_and_maps(fake_oss):
    """gif 不在头像白名单 → 400；未登录 → 401。"""
    from tests.conftest import make_client

    _make_login_user("ua-web-2")
    with make_client() as client:
        auth = _bearer_login(client, "ua-web-2")
        r = client.post("/api/me/avatar", files={"file": ("me.gif", PNG_1PX, "image/gif")}, headers=auth)
        assert r.status_code == 400, r.text
        assert "不支持" in r.json()["detail"]

    with make_client() as fresh:
        r = fresh.post("/api/me/avatar", files={"file": ("me.png", PNG_1PX, "image/png")})
        assert r.status_code == 401


def test_me_avatar_413_oversize_before_read(fake_oss):
    """声明大小超 2MB：读文件前先 413，不打 OSS。"""
    from tests.conftest import make_client

    _make_login_user("ua-web-4")
    big = PNG_1PX + b"\x00" * (2 * 1024 * 1024 + 1 - len(PNG_1PX))
    with make_client() as client:
        auth = _bearer_login(client, "ua-web-4")
        r = client.post("/api/me/avatar", files={"file": ("big.png", big, "image/png")}, headers=auth)
        assert r.status_code == 413, r.text
        assert fake_oss["put"] == []


def test_me_avatar_oss_unconfigured_503(monkeypatch):
    """显式把 oss.configured 置 False（不依赖本机 OSS 配置）：读文件前先 503。"""
    from features.assets import oss
    from tests.conftest import make_client

    monkeypatch.setattr(oss, "configured", lambda: False)
    _make_login_user("ua-web-3")
    with make_client() as client:
        auth = _bearer_login(client, "ua-web-3")
        r = client.post("/api/me/avatar", files={"file": ("me.png", PNG_1PX, "image/png")}, headers=auth)
        assert r.status_code == 503, r.text
