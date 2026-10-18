# server · 社区后端（FastAPI + MySQL 8）

好多星的唯一后端：为管理端（`admin/`）、社区站（`web/`）、App（`app/`）提供全部 API——
账号、案例库、投稿、进度云同步、AI 排错对话、管理端用户/统计/监控接口，并托管管理端静态产物（`/admin/`）。

## 技术栈与分层

FastAPI + PyMySQL（MySQL 8）/ SQLite（仅测试兜底），无 ORM：feature 层写 SQLite 方言 SQL
（`?` 占位、`datetime('now')`、`ON CONFLICT`），由 `core/db.py::_translate` 在 MySQL 引擎前统一翻译。

```
core/                 横切：config（唯一读 os.environ 处）/ db / security / deps / sms
features/<域>/        router（参数→响应）→ service（业务，只抛 HTTPException）→ SQL 只在此层
main.py               app 工厂：中间件（rid/计数）、异常兜底、Sentry、路由挂载、startup 种子
tests/                pytest；SQLite 与 MySQL 双引擎都必须全绿
```

依赖规则：feature → core 允许；跨 feature 只走对方 service 公开接口；禁止本地/线上实现双方案
（env-drift 反模式，见 AGENTS.md）。

## Feature 域

| 域 | 职责 |
|---|---|
| auth | 三种登录（GitHub OAuth / 手机验证码 / 账密）+ JWT 会话 + 初始管理员种子 + 封禁拒绝 |
| cases | 关卡草稿 / 发布门禁（gate.py 红线）/ 版本递增 / 文章投影 / 管理端列表与详情 |
| submissions | 用户投稿 → 审核（通过/驳回）→ 转 Case 草稿（可选 AI 预填） |
| users | 管理端用户管理：列表搜索 / 改角色（防自改）/ 封禁解封（admin 专属） |
| stats | 运营统计：user_activity 活跃打点（登录/进度上传时写入）+ 概览聚合（DAU/完关率等） |
| ops | 服务健康：进程内请求计数 + 定时快照（ops_snapshots）+ `/api/admin/ops/health` |
| progress | 登录态进度 bundle 云同步（整体覆盖写 / 并集拉取） |
| solutions | articles 只读展示（Web 解决逻辑页） |
| ai | 案例库 RAG 检索/对话 + 投稿 AI 起草管线（DeepSeek + 本地 BGE）+ ai_usage 用量审计 |
| sync | App casepack 增量同步（公开接口，`?since=version`） |

管理端静态托管：`admin/` 构建产物由本服务挂 `/admin/`（`ADMIN_DIST_DIR`，默认 `admin_dist/`）。

## 本地启动

前置：Python 3.12+、本地 MySQL 8（Docker，与生产同引擎——禁止本地 SQLite/线上 MySQL 双方案）。

```bash
# 1. 建环境（首次）
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# 2. MySQL 容器一次性建库建号（账号密码须与 .env.dev.local 对齐；示例）
docker exec <mysql容器> mysql -uroot -p<root密码> -e "
  CREATE DATABASE IF NOT EXISTS hdx CHARACTER SET utf8mb4;
  CREATE USER IF NOT EXISTS 'hdx'@'%' IDENTIFIED BY '<密码>';
  GRANT ALL ON hdx.* TO 'hdx'@'%';"

# 3. 配置密钥与连接（gitignored，dev.sh 自动 source；模板见 .env.example）
cp .env.example .env.dev.local && vi .env.dev.local

# 4. 起服务（:8000；建表自动完成）
./dev.sh
```

**初始管理员**：库中无管理员时自动种子 `admin / HaoDuo@2026`（启动日志有提示；
`ADMIN_PASSWORD` 可覆盖默认密码）。上线前务必登录修改密码——管理端侧栏「修改密码」。

**官方案例内容（132 关）**：`server/seed/*.json` 是不入 git 的构建产物（镜像构建期从
`app/data/cases` 自动生成）。本地灌库先导出再入库（幂等，可重复跑）：

```bash
node ../content/tools/export-case.mjs && .venv/bin/python seed.py
```

### 环境变量（全部只进 .env*.local，不进仓库）

| 组 | 变量 |
|---|---|
| 会话/来源 | `JWT_SECRET`（缺省=进程内随机，重启失效）、`ENV`（dev 开启绕行登录）、`WEB_ORIGIN`、`ADMIN_WEB_ORIGIN`（管理端独立域名时 CORS）、`COOKIE_SECURE=1`（HTTPS） |
| 管理员 | `ADMIN_PASSWORD`（覆盖初始密码）、`GITHUB_CLIENT_ID/SECRET`、`GITHUB_ADMIN_LOGINS` |
| 数据库 | `DB_PROVIDER`（mysql/sqlite）、`MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` |
| AI | `DEEPSEEK_API_KEY`、`AI_BASE_URL`、`AI_CHAT_MODEL`、`EMBED_PROVIDER`（fastembed/zhipu/local）、`EMBED_MODEL`、`FASTEMBED_CACHE_DIR`、`ZHIPU_API_KEY`、`DEEPSEEK_PRICE_IN/OUT`（成本估算单价，元/百万 tokens） |
| 监控 | `SENTRY_DSN`（空=关闭）、`SENTRY_ENV`、`OPS_SNAPSHOT_INTERVAL`（默认 300s）、`OPS_RETENTION_DAYS`（默认 30） |

AI 降级链是运行时容错：无 key 时对话/起草降级可用，但开发验收须带真实 key 走真实链路。

## 测试

```bash
.venv/bin/python -m pytest tests/ -q                              # SQLite 引擎
DB_PROVIDER=mysql MYSQL_PORT=3306 MYSQL_USER=root \
MYSQL_PASSWORD=... .venv/bin/python -m pytest tests/ -q           # MySQL 引擎（同样必须全绿）
```

测试用隔离库自动建/回收（conftest），外部依赖（LLM/短信）mock。

## 部署与运维

见 `部署与运维说明文档.md`：docker compose 多阶段构建（node 阶段构建 `admin/` 产物进镜像）、
api 容器 healthcheck、Sentry / UptimeRobot 接入步骤。管理端托管与本服务同生命周期，
`docker compose up -d --build` 一条命令拉起整套。

## 关联文档

- 出题与难度规范：`../docs/案例写作规范.md`
- 内容规划：`../docs/出题总纲.md`
- 管理端与监控决策：`../docs/decisions/006-独立管理端与监控.md`
- 工程约束：`../AGENTS.md`（环境一致性铁律 / feature 依赖规则）
