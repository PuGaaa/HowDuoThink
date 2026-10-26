"""settings 机制层：优先级链（DB > env > 内置默认）、缓存失效、写校验、client scope、读库降级。"""
import db
from core import settings


def _clear(*keys: str) -> None:
    db.ex(f"DELETE FROM settings WHERE setting_key IN ({','.join('?' * len(keys))})", tuple(keys))
    settings.reset_cache()


def test_priority_chain_env_and_default(monkeypatch):
    _clear("ai.price_in")
    monkeypatch.setenv("DEEPSEEK_PRICE_IN", "9.9")
    assert settings.get("ai.price_in") == 9.9
    monkeypatch.delenv("DEEPSEEK_PRICE_IN")
    assert settings.get("ai.price_in") == 2  # 内置默认


def test_db_overrides_env(monkeypatch):
    _clear("ai.price_in")
    monkeypatch.setenv("DEEPSEEK_PRICE_IN", "9.9")
    settings.update_many({"ai.price_in": 5}, "tester")
    assert settings.get("ai.price_in") == 5
    assert settings.source_of("ai.price_in") == "db"


def test_update_invalidates_cache():
    _clear("ai.rate_limit")
    assert settings.get("ai.rate_limit") == 10  # 先填充缓存
    settings.update_many({"ai.rate_limit": 3}, "tester")
    assert settings.get("ai.rate_limit") == 3


def test_update_many_rejects_unknown_and_out_of_range():
    _clear("ai.rate_limit", "guest_gate.free_levels", "ai.price_in")
    for bad in ({"nope.key": 1}, {"guest_gate.free_levels": -1}, {"ai.rate_limit": 0}, {"ai.price_in": "abc"}):
        try:
            settings.update_many(bad, "tester")
        except ValueError as e:
            assert list(bad)[0] in str(e)
        else:
            raise AssertionError(f"应拒绝 {bad}")
    n = db.q("SELECT COUNT(*) AS n FROM settings WHERE setting_key IN ('nope.key','guest_gate.free_levels','ai.rate_limit','ai.price_in')")[0]["n"]
    assert n == 0  # 一个都不落库


def test_client_config_only_client_scope():
    cfg = settings.client_config()
    assert set(cfg.keys()) == {"guest_gate.chapter_id", "guest_gate.free_levels"}
    assert cfg["guest_gate.chapter_id"] == "error-reading"
    assert cfg["guest_gate.free_levels"] == 3


def test_get_survives_db_error(monkeypatch):
    _clear("ai.price_out")
    settings.get("ai.price_out")  # 填缓存
    settings.reset_cache()
    monkeypatch.setattr(db, "q", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("库挂了")))
    assert settings.get("ai.price_out") == 8  # 读库失败退内置默认，不抛


# ———————— HTTP 层（features/settings）————————

import uuid  # noqa: E402

from core import security  # noqa: E402
from tests.conftest import login_admin, make_client  # noqa: E402


def _mkuser(role: str = "user") -> str:
    login = f"setuser-{uuid.uuid4().hex[:6]}"
    db.ex(
        "INSERT INTO users(id, login, name, role, password_hash) VALUES(?,?,?,?,?)",
        ("pw-" + login, login, login, role, security.hash_password("pw-123456")),
    )
    return login


def test_admin_settings_roundtrip():
    with make_client() as client:  # startup：种子 pw-admin
        login_admin(client)
        _clear("ai.rate_limit")
        r = client.get("/api/admin/settings")
        assert r.status_code == 200
        items = {i["key"]: i for i in r.json()["items"]}
        assert len(items) == 10
        assert items["ai.rate_limit"]["value"] == 10
        assert items["ai.rate_limit"]["source"] in ("env", "default", "db")
        r = client.put("/api/admin/settings", json={"values": {"ai.rate_limit": 7}})
        assert r.status_code == 200, r.text
        items = {i["key"]: i for i in client.get("/api/admin/settings").json()["items"]}
        assert items["ai.rate_limit"]["value"] == 7
        assert items["ai.rate_limit"]["source"] == "db"


def test_admin_settings_requires_admin():
    with make_client() as client:
        assert client.get("/api/admin/settings").status_code in (401, 403)  # 匿名
        login = _mkuser("user")
        r = client.post("/api/auth/login", json={"login": login, "password": "pw-123456"})
        assert r.status_code == 200
        assert client.get("/api/admin/settings").status_code == 403
        assert client.put("/api/admin/settings", json={"values": {"ai.rate_limit": 7}}).status_code == 403


def test_put_invalid_returns_400():
    with make_client() as client:
        login_admin(client)
        _clear("nope.key")
        r = client.put("/api/admin/settings", json={"values": {"nope.key": 1}})
        assert r.status_code == 400
        assert "nope.key" in r.json()["detail"]
        assert db.q("SELECT COUNT(*) AS n FROM settings WHERE setting_key='nope.key'")[0]["n"] == 0


def test_app_config_public_and_scoped():
    with make_client() as client:
        login_admin(client)
        client.put("/api/admin/settings", json={"values": {"guest_gate.free_levels": 5}})
    r = make_client().get("/api/app-config")  # 匿名（无需 startup 种子）
    assert r.status_code == 200
    cfg = r.json()
    assert set(cfg.keys()) == {"guest_gate.chapter_id", "guest_gate.free_levels"}
    assert cfg["guest_gate.free_levels"] == 5
    assert "ai.price_in" not in cfg and "login.max_failures" not in cfg


# ———————— 接入点：五组参数经 settings 即时生效 ————————


def test_sms_ttl_from_settings():
    from core import sms as sms_core

    _clear("sms.code_ttl_sec")
    settings.update_many({"sms.code_ttl_sec": 120}, "tester")
    assert settings.get("sms.code_ttl_sec") == 120
    assert sms_core.code_ttl_sec() == 120
    assert sms_core.resend_interval_sec() == 60  # 未改的项仍取默认


def test_login_lockout_reads_settings(monkeypatch):
    from features.auth import service as auth_service

    _clear("login.max_failures")
    monkeypatch.setattr(auth_service, "_LOGIN_FAILURES", {}, raising=False)
    settings.update_many({"login.max_failures": 2}, "tester")
    with make_client() as client:
        assert client.post("/api/auth/login", json={"login": "admin", "password": "bad"}).status_code == 401
        assert client.post("/api/auth/login", json={"login": "admin", "password": "bad"}).status_code == 401
        # 第 3 次即使密码正确也被频控挡下（阈值经 settings 改成 2）
        r = client.post("/api/auth/login", json={"login": "admin", "password": "test-admin-pw"})
        assert r.status_code == 429, r.text


def test_ai_price_from_settings():
    from features.ai import usage

    _clear("ai.price_in", "ai.price_out")
    settings.update_many({"ai.price_in": 4, "ai.price_out": 12}, "tester")
    assert usage.estimate_cost(1_000_000, 1_000_000) == 16.0


def test_update_many_rejects_nonfinite():
    """inf/NaN 是合法 JSON float 但会毒化看板/JSON 序列化——必须在校验层拒绝。"""
    _clear("ai.price_in")
    for bad in (float("inf"), float("-inf"), float("nan")):
        try:
            settings.update_many({"ai.price_in": bad}, "tester")
        except ValueError as e:
            assert "ai.price_in" in str(e)
        else:
            raise AssertionError(f"应拒绝 {bad}")


def test_get_guards_nonfinite_db_value():
    """外部直改库塞入 inf：读侧兜底退默认，不毒化 estimate_cost / JSON 响应。"""
    db.ex(
        "INSERT INTO settings(setting_key, value) VALUES('ai.price_in','inf') "
        "ON CONFLICT(setting_key) DO UPDATE SET value=excluded.value"
    )
    settings.reset_cache()
    assert settings.get("ai.price_in") == 2.0
    assert settings.source_of("ai.price_in") == "default"
    _clear("ai.price_in")
