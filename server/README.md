# server · 社区后端（FastAPI + MySQL/SQLite）

好多星的社区后端：账号、案例库、投稿、进度云同步、AI 排错对话。已脱离"二期占位"，
与 App（`app/`，uni-app X）和社区站（`web/`，Nuxt 3）共同组成产品。

## 技术栈与结构

FastAPI + PyMySQL（生产 MySQL 8）/ SQLite（测试与零部署兜底），无 ORM（裸 SQL + 方言翻译层）。
Feature 架构：`core/`（横切：config/db/security/deps）+ `features/<域>/`（router/service/models）。

| feature | 职责 |
|---|---|
| auth | GitHub OAuth + 手机验证码 + 密码登录，JWT 会话 |
| cases | 关卡草稿/发布门禁/版本/casepack 分发 |
| submissions | 用户投稿 → 审核 → 转 Case 草稿（可选 AI 预填）|
| progress | 登录态进度 bundle 云同步（整体覆盖 + 并集拉取）|
| solutions | articles 只读展示（Web 解决逻辑）|
| ai | 案例库 RAG 检索/对话 + 投稿 AI 起草管线（DeepSeek + 本地 BGE）|

## 数据库引擎单一化（重要）

**dev 与生产同引擎：MySQL 8**。本地开发用 Docker：

```bash
docker run -d --name hdt-mysql --restart unless-stopped \
  -e MYSQL_ROOT_PASSWORD=dev-local-only -e MYSQL_DATABASE=hdt \
  -e MYSQL_USER=hdt -e MYSQL_PASSWORD=dev-local-only \
  -p 3306:3306 mysql:8.0
```

密钥与连接信息放 `server/.env.dev.local`（gitignored，dev.sh 自动 source）：

```
export DB_PROVIDER=mysql
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_USER=hdt
export MYSQL_PASSWORD=dev-local-only
export MYSQL_DATABASE=hdt
export DEEPSEEK_API_KEY="sk-..."
```

SQLite（`data.db`）已退役为纯历史迁移源：`migrate_sqlite_to_mysql.py` 幂等可重跑。
禁止重新引入"本地 SQLite / 线上 MySQL"双方案（env-drift / env-inherit 判过的反模式）。

## 常用命令

```bash
./dev.sh                                  # 启动（自动 source .env.dev.local，ENV=dev）
.venv/bin/python -m pytest tests/ -q      # 全量测试（SQLite/MySQL 引擎均须通过）
DB_PROVIDER=mysql ... ./.venv/bin/python migrate_sqlite_to_mysql.py  # SQLite → MySQL 迁移
```

## 关联文档

- 出题与难度规范：`docs/案例写作规范.md`（⑤ 推理六维）
- 内容规划：`docs/出题总纲.md`
- AI 架构决策：`docs/出题总纲.md` 第二十四节（LangChain 模型 I/O / 自研编排 / LangGraph 演进）
