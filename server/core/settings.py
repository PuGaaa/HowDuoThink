"""运行时业务配置：注册表驱动的 settings 表读取层。

优先级链显式且单一：DB settings 行 > 环境变量 > 内置默认（priority-clash 教训——链路必须写明）。
机制放 core（core/sms 等横切层不能依赖 features）；features/settings 只做 HTTP 壳。
单进程前提（同 features/ops/metrics.py）：全表 lazy 缓存 + 写时失效；上多 worker 前先换失效机制。
env 层在本模块读 os.environ（与 core/config.py 同属配置层；features 一律经 get() 取值，不自行读 env）。
"""
import logging
import math
import os
from dataclasses import dataclass
from typing import Callable

import db

logger = logging.getLogger("server")


@dataclass(frozen=True)
class SettingDef:
    key: str
    default: int | float | str
    env: str  # env 层变量名；空 = 该项无 env 层
    parse: Callable[[str], int | float | str]
    min_v: float | None
    max_v: float | None
    scope: str  # client = 经 /api/app-config 下发；server = 仅服务端内部
    group: str  # 管理端分组：gate=运营门禁 / ai=AI / security=安全频控
    label: str
    unit: str


def _p_int(s: str) -> int:
    return int(s)


def _p_float(s: str) -> float:
    return float(s)


def _p_str(s: str) -> str:
    return s.strip()


REGISTRY: dict[str, SettingDef] = {
    d.key: d
    for d in [
        # —— 运营门禁（client：随 app-config 下发，App 端游客门禁用）——
        SettingDef("guest_gate.chapter_id", "error-reading", "", _p_str, None, None, "client", "gate", "游客免费章", ""),
        SettingDef("guest_gate.free_levels", 3, "", _p_int, 0, 50, "client", "gate", "游客免费关数", "关"),
        # —— AI ——
        SettingDef("ai.rate_limit", 10, "", _p_int, 1, 1000, "server", "ai", "AI 对话限流", "次/窗口"),
        SettingDef("ai.rate_window_sec", 60, "", _p_int, 10, 3600, "server", "ai", "限流窗口", "秒"),
        SettingDef("ai.price_in", 2.0, "DEEPSEEK_PRICE_IN", _p_float, 0, None, "server", "ai", "输入单价", "元/百万tokens"),
        SettingDef("ai.price_out", 8.0, "DEEPSEEK_PRICE_OUT", _p_float, 0, None, "server", "ai", "输出单价", "元/百万tokens"),
        # —— 安全频控 ——
        SettingDef("sms.code_ttl_sec", 600, "", _p_int, 60, 3600, "server", "security", "验证码有效期", "秒"),
        SettingDef("sms.resend_interval_sec", 60, "", _p_int, 10, 600, "server", "security", "验证码重发间隔", "秒"),
        SettingDef("login.max_failures", 5, "LOGIN_MAX_FAILURES", _p_int, 1, 100, "server", "security", "登录失败上限", "次"),
        SettingDef("login.lock_seconds", 300, "LOGIN_LOCK_SECONDS", _p_int, 30, 86400, "server", "security", "登录锁定时长", "秒"),
    ]
}

_cache: dict[str, str] | None = None


def reset_cache() -> None:
    """清空全表缓存（update_many 写库后调用；测试直改库时也可用）。"""
    global _cache
    _cache = None


def _load() -> dict[str, str]:
    """全表 lazy 缓存；读库失败返回空字典且不缓存（下次调用重试，主流程退 env/默认值）。"""
    global _cache
    if _cache is None:
        try:
            rows = db.q("SELECT setting_key, value FROM settings")
        except Exception:
            logger.warning("[settings] 读库失败，本次退回 env/内置默认", exc_info=True)
            return {}
        _cache = {r["setting_key"]: r["value"] for r in rows}
    return _cache


def _env_value(d: SettingDef) -> str | None:
    if not d.env:
        return None
    v = os.environ.get(d.env)
    return v if v not in (None, "") else None


def _coerce(d: SettingDef, raw: str):
    """parse + 有限数校验；失败返回 None（调用方走降级/拒绝路径）。inf/NaN 是合法
    JSON float，但会毒化看板运算与 JSON 序列化（设置页整体 500），两侧都要拦。"""
    try:
        v = d.parse(raw)
    except (TypeError, ValueError):
        return None
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return v


def get(key: str) -> int | float | str:
    """取生效值：DB 行 > env > 内置默认。未知 key 是编程错误，直接 KeyError。"""
    d = REGISTRY[key]
    raw = _load().get(key)
    if raw is not None:
        v = _coerce(d, raw)
        if v is not None:
            return v
        logger.warning("[settings] %s 库中值 %r 非法，退 env/默认", key, raw)
    env = _env_value(d)
    if env is not None:
        return d.parse(env)
    return d.default


def source_of(key: str) -> str:
    """当前生效值来自哪一层：db / env / default（管理端展示用）。"""
    d = REGISTRY[key]
    raw = _load().get(key)
    if raw is not None and _coerce(d, raw) is not None:
        return "db"
    return "env" if _env_value(d) is not None else "default"


def client_config() -> dict[str, int | float | str]:
    """客户端可见配置（scope=client 白名单）——app-config 端点的响应体，绝不含 server 项。"""
    return {key: get(key) for key, d in REGISTRY.items() if d.scope == "client"}


def update_many(values: dict, operator: str) -> None:
    """全量校验通过才落库（一个不合法则整体拒绝），写后失效缓存。"""
    errors: list[str] = []
    normalized: dict[str, int | float | str] = {}
    for key, val in values.items():
        d = REGISTRY.get(key)
        if d is None:
            errors.append(f"{key}=未知配置项")
            continue
        parsed = _coerce(d, str(val))
        if parsed is None:
            errors.append(f"{key}=类型非法（须为有限数）")
            continue
        if parsed == "":
            errors.append(f"{key}=不能为空")
            continue
        if d.min_v is not None and parsed < d.min_v:
            errors.append(f"{key}=不能小于 {d.min_v:g}")
            continue
        if d.max_v is not None and parsed > d.max_v:
            errors.append(f"{key}=不能大于 {d.max_v:g}")
            continue
        normalized[key] = parsed
    if errors:
        raise ValueError("; ".join(errors))
    with db.tx() as conn:
        for key, parsed in normalized.items():
            conn.execute(
                "INSERT INTO settings(setting_key, value, updated_by) VALUES(?,?,?) "
                "ON CONFLICT(setting_key) DO UPDATE SET value=excluded.value, updated_at=datetime('now'), updated_by=excluded.updated_by",
                (key, str(parsed), operator),
            )
    reset_cache()
