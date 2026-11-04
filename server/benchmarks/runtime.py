"""隔离性能测量：真实 MySQL/BGE/DeepSeek；只写 /tmp 和专属测试库。"""

import asyncio
import json
import logging
import math
import os
import re
import statistics
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx
import psutil

SOURCE = Path(os.environ.get("THINK_BENCH_SOURCE_ROOT", Path(__file__).resolve().parents[2]))
HERE = Path(os.environ.get("THINK_BENCH_OUTPUT", "/tmp/think-runtime-benchmark"))
HERE.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get("THINK_BENCH_PORT", "50831"))
sys.path.insert(0, str(SOURCE / "server"))
logging.basicConfig(level=logging.CRITICAL)


def summary(values):
    ordered = sorted(values)
    if not ordered:
        return {"n": 0}
    return {
        "n": len(ordered),
        "mean_ms": round(statistics.mean(ordered), 2),
        "p50_ms": round(ordered[math.ceil(len(ordered) * 0.5) - 1], 2),
        "p95_ms": round(ordered[math.ceil(len(ordered) * 0.95) - 1], 2),
        "p99_ms": round(ordered[math.ceil(len(ordered) * 0.99) - 1], 2),
        "max_ms": round(max(ordered), 2),
    }


def guard_database():
    from core import config

    assert config.DB_PROVIDER == "mysql"
    assert config.MYSQL_HOST == "127.0.0.1"
    assert config.MYSQL_DATABASE == "hdt_perf"
    assert config.MYSQL_PORT == int(os.environ.get("THINK_BENCH_MYSQL_PORT", "50721"))


def prepare():
    guard_database()
    import db
    from core import migrate
    from features.cases import service
    from features.cases.models import CasePayload

    migrate.upgrade_head()
    db.ex(
        "INSERT INTO users(id,login,name,role) VALUES('perf-user','perf-user','性能测试','admin') ON CONFLICT(id) DO UPDATE SET name=excluded.name"
    )
    seed_dir = HERE / "seed"
    seed_dir.mkdir(exist_ok=True)
    registered = re.findall(r"from '\./([\w-]+)'", (SOURCE / "app/data/cases/index.ts").read_text())
    for name in registered:
        subprocess.run(
            [
                "node",
                str(SOURCE / "content/tools/export-case.mjs"),
                str(SOURCE / "app/data/cases" / (name + ".ts")),
                str(seed_dir / (name + ".json")),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
    durations = []
    errors = []
    for file in sorted(seed_dir.glob("*.json")):
        payload = json.loads(file.read_text())
        start = time.perf_counter()
        try:
            service.publish_case("perf-user", CasePayload(**payload))
        except Exception as exc:
            errors.append({"case_id": payload["id"], "error_type": type(exc).__name__})
        durations.append((time.perf_counter() - start) * 1000)
    result = {
        "publish": summary(durations),
        "publish_errors": errors,
        "published_cases": db.q("SELECT COUNT(*) AS n FROM cases WHERE status='published'")[0]["n"],
        "queued_index_tasks": db.q("SELECT COUNT(*) AS n FROM index_tasks")[0]["n"],
    }
    # 同一真实MySQL：反复checkout与持有同一连接对照；旧实现每次checkout都拨号。
    separate = []
    for _ in range(100):
        start = time.perf_counter()
        db.q("SELECT 1")
        separate.append((time.perf_counter() - start) * 1000)
    shared = []
    conn = db.connect()
    for _ in range(100):
        start = time.perf_counter()
        conn.execute("SELECT 1").fetchall()
        shared.append((time.perf_counter() - start) * 1000)
    conn.close()
    result["checkout_select1"] = summary(separate)
    result["one_connection_select1"] = summary(shared)
    print(json.dumps(result, ensure_ascii=False), flush=True)


def cold():
    from features.ai import client

    proc = psutil.Process()
    before = proc.memory_info().rss
    cpu0 = sum(proc.cpu_times()[:2])
    start = time.perf_counter()
    model = client.embeddings_model()
    initialized = time.perf_counter()
    vector = model.embed_query("连接池耗尽如何判断影响范围")
    first = time.perf_counter()
    warm = []
    for _ in range(8):
        tick = time.perf_counter()
        model.embed_query("缓存与数据库不一致怎么排查")
        warm.append((time.perf_counter() - tick) * 1000)
    assert type(model).__name__ == "FastEmbedEmbeddings"
    print(
        json.dumps(
            {
                "backend": type(model).__name__,
                "vector_dimension": len(vector),
                "model_init_ms": round((initialized - start) * 1000, 2),
                "first_query_ms": round((first - initialized) * 1000, 2),
                "warm_queries": summary(warm),
                "cpu_seconds": round(sum(proc.cpu_times()[:2]) - cpu0, 3),
                "rss_before_model_mb": round(before / 2**20, 2),
                "rss_after_queries_mb": round(proc.memory_info().rss / 2**20, 2),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


def serve():
    guard_database()
    from core import db as coredb
    from features.ai import service as ai

    stages = {}
    lock = threading.Lock()

    def instrument(owner, name, label):
        original = getattr(owner, name)

        def wrapped(*args, **kwargs):
            tick = time.perf_counter()
            try:
                return original(*args, **kwargs)
            finally:
                with lock:
                    stages.setdefault(label, []).append((time.perf_counter() - tick) * 1000)

        setattr(owner, name, wrapped)

    instrument(coredb, "_mysql_conn", "mysql_connect")
    instrument(coredb, "connect", "db_checkout")
    instrument(ai, "node_retrieve", "retrieve_with_embedding")
    instrument(ai, "node_answer", "deepseek_and_audit")
    instrument(ai, "_embed", "index_embedding")
    import main

    @main.app.get("/__perf/stages")
    def stage_report():
        with lock:
            return {key: summary(value) for key, value in stages.items()}

    @main.app.post("/__perf/reset")
    def stage_reset():
        with lock:
            stages.clear()
        return {"ok": True}

    import uvicorn

    logging.getLogger().setLevel(logging.CRITICAL)
    uvicorn.run(main.app, host="127.0.0.1", port=PORT, log_level="critical", access_log=False)


async def run():
    from core import security

    headers = {"Authorization": "Bearer " + security.sign_session("perf-user")}
    base = f"http://127.0.0.1:{PORT}"
    log = (HERE / "server.log").open("w")
    server = subprocess.Popen([sys.executable, __file__, "server"], stdout=log, stderr=log)
    proc = psutil.Process(server.pid)
    results = {
        "source_root": str(SOURCE),
        "host_cpu_count": os.cpu_count(),
        "host_ram_mb": round(psutil.virtual_memory().total / 2**20),
        "stages": {},
    }
    try:
        async with httpx.AsyncClient(
            base_url=base, headers=headers, timeout=120, limits=httpx.Limits(max_connections=20)
        ) as api:
            for _ in range(120):
                try:
                    ready = await api.get("/api/health")
                    if ready.status_code == 200:
                        break
                except httpx.ConnectError:
                    pass
                await asyncio.sleep(0.25)
            else:
                raise RuntimeError("隔离服务未就绪")

            async def request(label, url, body=None):
                start = time.perf_counter()
                try:
                    response = await (api.get(url) if body is None else api.post(url, json=body))
                    data = response.json()
                    ok = response.status_code == 200 and not data.get("error")
                    if label == "ai":
                        ok = ok and bool(data.get("answer"))
                    return {
                        "label": label,
                        "ms": (time.perf_counter() - start) * 1000,
                        "ok": bool(ok),
                        "status": response.status_code,
                        "answer_chars": len(data.get("answer", "")),
                        "sources": len(data.get("sources", [])),
                        "indexed": data.get("indexed"),
                    }
                except Exception as exc:
                    return {
                        "label": label,
                        "ms": (time.perf_counter() - start) * 1000,
                        "ok": False,
                        "error_type": type(exc).__name__,
                    }

            async def phase(name, extras=(), seconds=8):
                await api.post("/__perf/reset")
                rows = []
                start = time.perf_counter()
                cpu0 = sum(proc.cpu_times()[:2])
                rss_peak = proc.memory_info().rss

                async def business(worker):
                    routes = ["/api/health", "/api/solutions?page=1&size=20", "/api/me/progress"]
                    i = worker
                    while time.perf_counter() - start < seconds:
                        rows.append(await request("business", routes[i % 3]))
                        i += 1
                        await asyncio.sleep(0.15)

                async def monitor():
                    nonlocal rss_peak
                    while not done.is_set():
                        rss_peak = max(rss_peak, proc.memory_info().rss)
                        await asyncio.sleep(0.05)

                done = asyncio.Event()
                monitor_task = asyncio.create_task(monitor())
                extra_tasks = [asyncio.create_task(request(*args)) for args in extras]
                await asyncio.gather(*(business(i) for i in range(8)))
                rows.extend(await asyncio.gather(*extra_tasks))
                done.set()
                await monitor_task
                duration = time.perf_counter() - start
                cpu = sum(proc.cpu_times()[:2]) - cpu0
                result = {
                    "wall_seconds": round(duration, 3),
                    "steady_business_window_seconds": seconds,
                    "cpu_seconds": round(cpu, 3),
                    "cpu_percent_one_core": round(cpu / duration * 100, 1),
                    "peak_rss_mb": round(rss_peak / 2**20, 2),
                    "requests": {},
                }
                for label in sorted(set(row["label"] for row in rows)):
                    group = [row for row in rows if row["label"] == label]
                    result["requests"][label] = {
                        **summary([row["ms"] for row in group]),
                        "errors": sum(not row["ok"] for row in group),
                        "error_rate": sum(not row["ok"] for row in group) / len(group),
                    }
                    if label != "business":
                        result["requests"][label]["calls"] = group
                result["segments"] = (await api.get("/__perf/stages")).json()
                results["stages"][name] = result
                (HERE / "http-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
                print(json.dumps({"completed": name, **result}, ensure_ascii=False), flush=True)

            await phase("pure_business")
            # 首次检索加载真实BGE，独立报告，不污染热态混合比较。
            search = await request("search", "/api/ai/search?q=连接池耗尽怎么排查&k=4")
            results["server_first_search"] = {**search, "rss_after_mb": round(proc.memory_info().rss / 2**20, 2)}
            await phase("full_131_case_reindex", [("index", "/api/admin/ai/reindex", {})])
            await phase(
                "mixed_two_real_rag_calls",
                [
                    ("ai", "/api/ai/chat", {"question": "连接池耗尽怎么排查？请只写三条简短步骤并注明出处。"}),
                    ("ai", "/api/ai/chat", {"question": "缓存与数据库不一致怎么定位？请只写三条简短步骤并注明出处。"}),
                ],
            )
            await phase("warm_search_mix", [("search", "/api/ai/search?q=连接池耗尽怎么排查&k=4") for _ in range(12)])
            # 所有写入均为本次隔离库；只输出用量数字，不输出请求/模型回答或认证信息。
            import db

            results["ai_usage"] = db.q(
                "SELECT kind,COUNT(*) AS calls,SUM(prompt_tokens) AS input_tokens,SUM(completion_tokens) AS output_tokens,SUM(ok) AS successful FROM ai_usage GROUP BY kind"
            )
            results["indexed_chunks"] = db.q("SELECT COUNT(*) AS n FROM ai_index")[0]["n"]
            (HERE / "http-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2, default=float))
    finally:
        server.terminate()
        server.wait(timeout=10)
        log.close()


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "prepare":
        prepare()
    elif mode == "cold":
        cold()
    elif mode == "server":
        serve()
    elif mode == "run":
        asyncio.run(run())
