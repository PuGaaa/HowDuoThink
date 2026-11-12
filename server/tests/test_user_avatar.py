"""用户头像上传数据层测试：独立 user-avatar 分类、类型/大小校验、日限 10、公开清单排除。
不依赖本机 OSS 配置：oss.configured / oss.put_bytes 一律 monkeypatch。"""

import base64

import pytest

from features.assets import service as svc

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
