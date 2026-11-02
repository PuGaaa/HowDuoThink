"""素材域测试：未配置 OSS 时 503 降级；假 OSS 层下 上传/秒传/校验/删除/清单 闭环。"""

import pytest

from tests.conftest import login_admin, make_client

PNG = b"\x89PNG\r\n\x1a\nfake-image-bytes"


@pytest.fixture()
def client():
    # 必须走上下文管理器：startup 事件里才有种子管理员
    with make_client() as c:
        login_admin(c)
        yield c


@pytest.fixture()
def fake_oss(monkeypatch):
    """假 OSS 层：记录写入/删除调用，不打真实网络；并补齐 OSS 配置项。"""
    from features.assets import oss

    calls = {"put": [], "deleted": []}
    monkeypatch.setattr(oss, "put_bytes", lambda key, data, ct: calls["put"].append((key, ct)))
    monkeypatch.setattr(oss, "delete_key", lambda key: calls["deleted"].append(key))
    monkeypatch.setattr("core.config.OSS_ENDPOINT", "https://oss-cn-hangzhou.aliyuncs.com")
    monkeypatch.setattr("core.config.OSS_BUCKET", "howduo-test")
    monkeypatch.setattr("core.config.OSS_ACCESS_KEY_ID", "test-ak")
    monkeypatch.setattr("core.config.OSS_ACCESS_KEY_SECRET", "test-sk")
    return calls


def test_manifest_public_empty():
    c = make_client()
    r = c.get("/api/assets/manifest")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == [] and "version" in body


def test_list_requires_login():
    c = make_client()
    assert c.get("/api/assets").status_code == 401


def test_upload_503_when_oss_unconfigured(client):
    r = client.post(
        "/api/assets",
        files={"file": ("m.png", PNG, "image/png")},
        data={"category": "mascot"},
    )
    assert r.status_code == 503


def test_upload_rejects_bad_ext(client, fake_oss):
    r = client.post(
        "/api/assets",
        files={"file": ("evil.txt", b"plain", "text/plain")},
        data={"category": "misc"},
    )
    assert r.status_code == 400
    assert "不支持" in r.json()["detail"]


def test_upload_rejects_bad_category(client, fake_oss):
    r = client.post(
        "/api/assets",
        files={"file": ("m.png", PNG, "image/png")},
        data={"category": "nope"},
    )
    assert r.status_code == 400


def test_upload_rejects_empty(client, fake_oss):
    r = client.post(
        "/api/assets",
        files={"file": ("m.png", b"", "image/png")},
        data={"category": "misc"},
    )
    assert r.status_code == 400


def test_upload_list_manifest_delete(client, fake_oss):
    # 上传：走假 OSS，URL 用桶直连域名
    r = client.post(
        "/api/assets",
        files={"file": ("mascot-1.png", PNG, "image/png")},
        data={"category": "mascot", "note": "测试徽章"},
    )
    assert r.status_code == 200, r.text
    item = r.json()
    assert item["category"] == "mascot"
    assert item["url"].startswith("https://howduo-test.oss-cn-hangzhou.aliyuncs.com/assets/mascot/")
    assert len(fake_oss["put"]) == 1

    # 秒传：同分类同内容不再写 OSS
    r2 = client.post(
        "/api/assets",
        files={"file": ("mascot-1-copy.png", PNG, "image/png")},
        data={"category": "mascot"},
    )
    assert r2.status_code == 200
    assert r2.json()["id"] == item["id"]
    assert len(fake_oss["put"]) == 1

    # 列表
    r = client.get("/api/assets", params={"category": "mascot"})
    assert r.status_code == 200
    assert any(a["id"] == item["id"] for a in r.json()["items"])

    # 清单（公开）应包含该素材
    m = make_client().get("/api/assets/manifest").json()
    assert any(i["key"] == item["key"] for i in m["items"])

    # CDN 前缀覆盖：settings 落库后清单 URL 走 cdn_base
    r = client.put("/api/admin/settings", json={"values": {"assets.cdn_base": "https://cdn.example.com/edu/"}})
    assert r.status_code == 200, r.text
    m = make_client().get("/api/assets/manifest").json()
    target = next(i for i in m["items"] if i["key"] == item["key"])
    assert target["url"] == "https://cdn.example.com/edu/" + item["key"]

    # 删除：OSS 与表都清掉；再删报 400
    r = client.delete(f"/api/assets/{item['id']}")
    assert r.status_code == 200
    assert fake_oss["deleted"] == [item["key"]]
    assert client.delete(f"/api/assets/{item['id']}").status_code == 400


def test_slots_bind_unbind_and_dispatch(client, fake_oss):
    # 上传两张吉祥物素材（内容不同避免秒传合并）
    ids = []
    for i in range(2):
        r = client.post(
            "/api/assets",
            files={"file": (f"frog-v{i}.png", PNG + bytes([i]), "image/png")},
            data={"category": "mascot"},
        )
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])

    # 派发：未绑定时 mascots 为空
    res = make_client().get("/api/app-resources").json()
    assert res["mascots"] == {} and "version" in res

    # 绑定未知槽位 / 未知素材 → 400
    assert client.put("/api/assets/slots/mascot.dragon", json={"asset_id": ids[0]}).status_code == 400
    assert client.put("/api/assets/slots/mascot.frog", json={"asset_id": 99999}).status_code == 400

    # 绑定 frog → 派发出现；换绑 v1 → URL 跟随
    assert client.put("/api/assets/slots/mascot.frog", json={"asset_id": ids[0]}).status_code == 200
    res = make_client().get("/api/app-resources").json()
    assert res["mascots"]["frog"].endswith("frog-v0.png")
    v0 = res["version"]
    assert client.put("/api/assets/slots/mascot.frog", json={"asset_id": ids[1]}).status_code == 200
    res = make_client().get("/api/app-resources").json()
    assert res["mascots"]["frog"].endswith("frog-v1.png")
    assert res["version"] != v0

    # 管理端槽位视图
    r = client.get("/api/assets/slots")
    assert r.status_code == 200
    frog = next(s for s in r.json()["items"] if s["slot"] == "mascot.frog")
    assert frog["asset"]["id"] == ids[1]

    # 删除已绑定的素材 → 槽位自动解绑，派发回落为空
    assert client.delete(f"/api/assets/{ids[1]}").status_code == 200
    res = make_client().get("/api/app-resources").json()
    assert "frog" not in res["mascots"]

    # 解绑接口 + 未知槽位 400
    assert client.put("/api/assets/slots/mascot.snail", json={"asset_id": ids[0]}).status_code == 200
    assert client.delete("/api/assets/slots/mascot.snail").status_code == 200
    assert client.delete("/api/assets/slots/mascot.snail").status_code == 200  # 幂等
    assert client.delete("/api/assets/slots/nope").status_code == 400


def test_app_resources_requires_no_auth(client, fake_oss):
    assert make_client().get("/api/app-resources").status_code == 200
    assert make_client().get("/api/assets/slots").status_code == 401


def test_upload_oversize_413_before_read(client, fake_oss, monkeypatch):
    """超过单文件上限：413 且不打 OSS（原实现先整读进内存才校验，可被大 body OOM）。"""
    from core import config

    monkeypatch.setattr(config, "OSS_MAX_UPLOAD_MB", 1)
    big = PNG + b"x" * (1024 * 1024 + 1)
    r = client.post(
        "/api/assets",
        files={"file": ("big.png", big, "image/png")},
        data={"category": "misc"},
    )
    assert r.status_code == 413, r.text
    assert fake_oss["put"] == []


def test_upload_daily_limit(client, fake_oss, monkeypatch):
    """每用户每日上传次数限额：防 editor 账号脚本化刷存储/流量。
    限额按当前库内当日计数动态设定（共享临时库下其他用例的上传也计入同用户配额）。"""
    import time

    import db as dbmod
    from features.assets import service as svc

    today = time.strftime("%Y-%m-%d", time.gmtime())
    n = int(
        dbmod.q(
            "SELECT COUNT(*) AS n FROM assets WHERE uploaded_by=? AND substr(created_at,1,10)=?",
            ("pw-admin", today),
        )[0]["n"]
    )
    monkeypatch.setattr(svc, "UPLOAD_DAILY_LIMIT", n + 2)
    for i in range(2):
        r = client.post(
            "/api/assets",
            files={"file": (f"lim-{i}.png", PNG + bytes([i]), "image/png")},
            data={"category": "misc"},
        )
        assert r.status_code == 200, r.text
    r = client.post(
        "/api/assets",
        files={"file": ("lim-x.png", PNG + b"z", "image/png")},
        data={"category": "misc"},
    )
    assert r.status_code == 429, r.text
    dbmod.ex("DELETE FROM assets WHERE filename LIKE 'lim-%'")  # 清场，不污染其他用例口径


def test_upload_rejects_oversize_filename_and_note(client, fake_oss):
    """filename/note 超长显式 400（MySQL VARCHAR 严格模式下会 500，SQLite 无感——双引擎分叉）。"""
    r = client.post(
        "/api/assets",
        files={"file": ("n" * 300 + ".png", PNG, "image/png")},
        data={"category": "misc"},
    )
    assert r.status_code == 400, r.text
    assert "文件名" in r.json()["detail"]
    r2 = client.post(
        "/api/assets",
        files={"file": ("ok.png", PNG + b"1", "image/png")},
        data={"category": "misc", "note": "x" * 600},
    )
    assert r2.status_code == 400, r2.text
    assert "备注" in r2.json()["detail"]
