"""AI 用量审计：记录 + 汇总。ai_usage 是成本台账——只记真实发生的模型调用。

审计是旁路：写失败只告警，绝不影响主流程（对话/起草不受审计库状态牵连）。
成本按 DeepSeek 单价（settings ai.price_in/out，元/百万 tokens）估算，管理端即时可调。
"""

import datetime
import logging

import db
from core import settings

logger = logging.getLogger("server")


def log_usage(
    uid: str | None,
    kind: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    duration_ms: int = 0,
    ok: bool = True,
) -> None:
    try:
        db.ex(
            "INSERT INTO ai_usage(uid, kind, prompt_tokens, completion_tokens, duration_ms, ok) VALUES(?,?,?,?,?,?)",
            (uid, kind, int(prompt_tokens), int(completion_tokens), int(duration_ms), 1 if ok else 0),
        )
    except Exception:
        logger.warning("[ai-usage] 审计写入失败", exc_info=True)


def extract_tokens(resp) -> tuple[int, int]:
    """从 LangChain 响应取 token 用量（无则 0）。"""
    meta = getattr(resp, "response_metadata", None) or {}
    tk = meta.get("token_usage") or {}
    return int(tk.get("prompt_tokens") or 0), int(tk.get("completion_tokens") or 0)


def estimate_cost(prompt_tokens: int, completion_tokens: int) -> float:
    # MySQL 的 SUM() 返回 Decimal，与 float 直接运算会 TypeError，统一归一为 int
    pin, pout = int(prompt_tokens or 0), int(completion_tokens or 0)
    price_in = float(settings.get("ai.price_in"))
    price_out = float(settings.get("ai.price_out"))
    return (pin * price_in + pout * price_out) / 1_000_000


def daily_summary(days: int) -> dict:
    cutoff = _cutoff(days)
    rows = db.q(
        "SELECT substr(created_at,1,10) AS day, "
        "SUM(CASE WHEN kind='chat' THEN 1 ELSE 0 END) AS chats, "
        "SUM(CASE WHEN kind='draft' THEN 1 ELSE 0 END) AS drafts, "
        "SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, "
        "AVG(CASE WHEN kind='chat' THEN duration_ms END) AS avg_ms "
        "FROM ai_usage WHERE created_at >= ? GROUP BY substr(created_at,1,10) ORDER BY day",
        (cutoff,),
    )
    total_in = sum(r["prompt_tokens"] or 0 for r in rows)
    total_out = sum(r["completion_tokens"] or 0 for r in rows)
    return {
        "days": [
            {
                "day": r["day"],
                "chats": r["chats"],
                "drafts": r["drafts"],
                "prompt_tokens": r["prompt_tokens"],
                "completion_tokens": r["completion_tokens"],
                # AVG 两引擎返回 float/Decimal，统一 Python 取整（CAST AS INTEGER 不是合法 MySQL）
                "avg_ms": int(r["avg_ms"]) if r["avg_ms"] is not None else None,
                "cost": round(estimate_cost(r["prompt_tokens"] or 0, r["completion_tokens"] or 0), 4),
            }
            for r in rows
        ],
        "total": {
            "prompt_tokens": total_in,
            "completion_tokens": total_out,
            "cost": round(estimate_cost(total_in, total_out), 4),
        },
    }


def top_users(days: int, limit: int = 20) -> list[dict]:
    cutoff = _cutoff(days)
    rows = db.q(
        "SELECT au.uid, us.login, COUNT(*) AS calls, "
        "SUM(au.prompt_tokens) AS prompt_tokens, SUM(au.completion_tokens) AS completion_tokens "
        "FROM ai_usage au LEFT JOIN users us ON us.id = au.uid "
        "WHERE au.created_at >= ? "
        "GROUP BY au.uid, us.login "
        "ORDER BY (SUM(au.prompt_tokens) + SUM(au.completion_tokens)) DESC LIMIT ?",
        (cutoff, limit),
    )
    out = []
    for r in rows:
        pin, pout = r["prompt_tokens"] or 0, r["completion_tokens"] or 0
        out.append({**r, "prompt_tokens": pin, "completion_tokens": pout, "cost": round(estimate_cost(pin, pout), 4)})
    return out


def _cutoff(days: int) -> str:
    days = max(1, min(int(days), 365))
    dt = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
    return dt.strftime("%Y-%m-%d %H:%M:%S")
