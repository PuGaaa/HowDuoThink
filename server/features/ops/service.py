"""ops 域业务逻辑：健康快照（实时水位 + 近期趋势 + 外部集成状态）。"""

import db
from core import config
from features.ops import metrics


def health_snapshot() -> dict:
    db_ok = bool(db.q("SELECT 1 AS ok"))
    recent = db.q(
        "SELECT ts, requests, errors, avg_ms, rss_mb, disk_free_mb FROM ops_snapshots ORDER BY id DESC LIMIT 48"
    )
    return {
        "db": {"ok": db_ok, "provider": config.DB_PROVIDER, "casepackVersion": db.current_version()},
        "process": metrics.current() | {"rssMb": round(metrics.rss_mb(), 1)},
        "diskFreeMb": round(metrics.disk_free_mb(), 1),
        "recent": [
            {
                "ts": r["ts"],
                "requests": r["requests"],
                "errors": r["errors"],
                "avgMs": r["avg_ms"],
                "rssMb": r["rss_mb"],
                "diskFreeMb": r["disk_free_mb"],
            }
            for r in recent
        ],
        "integrations": {
            "sentry": bool(config.SENTRY_DSN),
            "snapshotIntervalSec": config.OPS_SNAPSHOT_INTERVAL,
        },
    }
