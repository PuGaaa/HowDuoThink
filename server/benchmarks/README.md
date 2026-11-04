# 运行时最小基准

`runtime.py`调用真实项目服务、MySQL、BGE与DeepSeek，只给函数加耗时观测。报告在
[`../../docs/性能评估-2026-11-04.md`](../../docs/性能评估-2026-11-04.md)，原始结果在`results/`。
脚本不会替换模型、读`.env`或输出认证头；运行者按既有流程提供真实凭据。

## 隔离环境

只使用专属MySQL容器的`hdt_perf`库。不要指向业务实例、`face-mysql`或UI验收用的`hdt_ui`。
若已有专属容器，使用其已分配端口，不重复创建。全新环境示例：

```sh
docker run -d --name think-runtime-bench-mysql --tmpfs /var/lib/mysql \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_DATABASE=hdt_perf \
  -p 127.0.0.1:50721:3306 mysql:8.0
```

在仓库根目录激活`server/.venv`并安装基准采样依赖：

```sh
server/.venv/bin/pip install -r server/benchmarks/requirements.txt
```

通过已授权的本地环境加载真实DeepSeek凭据，不启用命令回显。随后覆盖测试目标，避免继承业务连接：

```sh
export DB_PROVIDER=mysql MYSQL_HOST=127.0.0.1 MYSQL_PORT=50721
export MYSQL_USER=root MYSQL_PASSWORD='' MYSQL_DATABASE=hdt_perf
export MYSQL_POOL_SIZE=5 MYSQL_POOL_MAX_OVERFLOW=5 MYSQL_POOL_TIMEOUT=5
export JWT_SECRET='benchmark-only-session-secret-20261104' ADMIN_PASSWORD='benchmark-only-password'
export ENV=dev SENTRY_DSN='' EMBED_PROVIDER=fastembed EMBED_MODEL=BAAI/bge-small-zh-v1.5
export AI_CHAT_MODEL=deepseek-chat AI_BASE_URL=https://api.deepseek.com
export THINK_BENCH_MYSQL_PORT=50721 THINK_BENCH_PORT=50831
export THINK_BENCH_OUTPUT=/tmp/think-runtime-benchmark
```

`THINK_BENCH_SOURCE_ROOT`默认指脚本所在仓库，可指向待比较的独立快照。结果、导出的案例JSON和
服务日志只写入`THINK_BENCH_OUTPUT`。代码检查数据库类型、回环地址、端口及固定测试库名。

## 执行

数据库需已就绪。`prepare`运行真实迁移、创建合成测试用户并通过正式发布服务导入仓库案例；
案例导出复用既有`export-case.mjs`，不向源码目录写构建产物。

```sh
server/.venv/bin/python server/benchmarks/runtime.py prepare > /tmp/think-runtime-prepare.json
server/.venv/bin/python server/benchmarks/runtime.py cold > /tmp/think-runtime-cold.json
server/.venv/bin/python server/benchmarks/runtime.py run
```

`run`在回环地址启动单进程API，结束后关闭；顺序测量：

1. 8个并发用户以150ms间隔访问health、solutions和progress，窗口8秒。
2. 首次真实BGE检索；进程冷但模型磁盘缓存可能已有，不能当首次下载时间。
3. 普通业务并行全量重建索引。
4. 普通业务并行**两次付费DeepSeek RAG**，问题与历史基准一致。
5. 普通业务并行12次真实热检索。

CPU与RSS采样仅含API进程；CPU的100%表示一个逻辑核。函数耗时包括DB checkout、实际拨号、
检索、模型等待与审计、索引嵌入；分段不覆盖请求的全部成本。模型回答只记录长度与出处数量。

`prepare`使用空库得到的发布耗时才可对比；重复执行的未改内容会走幂等返回，不能与首次发布混算。
需要重置时，仅清理本次专属实例的`hdt_perf`，不要删除同容器的其他数据库。

脚本是闭环并发负载，不是固定RPS容量测试；LLM每侧仅两个样本，其p95/p99等于较大值。
本报告不替代生产负载验收。真实OSS写入没有测量，上传调度单测使用隔离SDK替身。
