"""进程内请求计数 + 定期快照落库。

成立前提：单进程 uvicorn worker（当前部署形态，见部署文档）——多 worker 时计数各自为政，
需要换 Prometheus 之前先别加 worker。
"""

import logging
import os
import shutil
import sys
import threading
import time

import db
from core import config

logger = logging.getLogger("server")

_lock = threading.Lock()
_started = time.time()
_requests = 0
_errors = 0
_latency_ms_sum = 0.0
_last_cleanup = 0.0


def record(status_code: int, duration_ms: float) -> None:
    """请求中间件调用：累计请求数/5xx 数/耗时。"""
    global _requests, _errors, _latency_ms_sum
    with _lock:
        _requests += 1
        if status_code >= 500:
            _errors += 1
        _latency_ms_sum += duration_ms


def current() -> dict:
    """只读当前累计（不清零），供健康端点实时展示。"""
    with _lock:
        req, err, lat = _requests, _errors, _latency_ms_sum
    return {
        "requests": req,
        "errors": err,
        "avgMs": int(lat / req) if req else 0,
        "uptimeMin": int((time.time() - _started) / 60),
    }


def rss_mb() -> float:
    import resource

    raw = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # macOS 单位是字节，Linux 是 KB
    return raw / (1_000_000 if sys.platform == "darwin" else 1024)


def disk_free_mb() -> float:
    return shutil.disk_usage(os.path.dirname(__file__)).free / 1_000_000


def take_snapshot() -> dict:
    """取走当前窗口计数（归零）并写入 ops_snapshots；写库失败只告警。"""
    global _requests, _errors, _latency_ms_sum, _last_cleanup
    with _lock:
        req, err, lat = _requests, _errors, _latency_ms_sum
        _requests = _errors = 0
        _latency_ms_sum = 0.0
    snap = {
        "requests": req,
        "errors": err,
        "avgMs": int(lat / req) if req else 0,
        "rssMb": round(rss_mb(), 1),
        "diskFreeMb": round(disk_free_mb(), 1),
    }
    try:
        db.ex(
            "INSERT INTO ops_snapshots(requests, errors, avg_ms, rss_mb, disk_free_mb) VALUES(?,?,?,?,?)",
            (snap["requests"], snap["errors"], snap["avgMs"], snap["rssMb"], snap["diskFreeMb"]),
        )
        if time.time() - _last_cleanup > 3600:
            cutoff = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() - config.OPS_RETENTION_DAYS * 86400))
            db.ex("DELETE FROM ops_snapshots WHERE ts < ?", (cutoff,))
            _last_cleanup = time.time()
    except Exception:
        logger.warning("[ops] 快照写入失败", exc_info=True)
    return snap


def start_snapshot_thread() -> None:
    """启动后台快照线程（daemon：随进程退出）。测试环境不产生副作用（先睡后写）。"""

    def loop() -> None:
        while True:
            time.sleep(config.OPS_SNAPSHOT_INTERVAL)
            try:
                take_snapshot()
            except Exception:
                logger.warning("[ops] 快照循环异常", exc_info=True)

    threading.Thread(target=loop, daemon=True, name="ops-snapshot").start()
