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
