# admin · 好多星管理端

独立管理后台：Vite + Vue 3 + TypeScript + Naive UI SPA。Admin 使用单独的静态镜像和部署配置，
通过 `VITE_API_BASE` 调用 Server API；API 镜像不构建、不托管 Admin。
形态决策与监控方案见 `docs/decisions/006-独立管理端与监控.md`。

## 页面清单（features 垂直切片：`src/features/<域>/{pages,api}`）

| 路由 | 域 | 说明 |
| --- | --- | --- |
| `/overview` | stats | 数据概览：DAU / 新增用户 / 投稿采纳率 / 完关率 + 内容飞轮漏斗 |
| `/submissions` | content | 投稿审核：通过转草稿 / AI 预填 / 驳回（带备注） |
| `/cases`、`/cases/:id` | content | Case 列表 / 编辑器（三级架构元数据 + JSON + 过门禁发布） |
| `/users`（仅 admin 可见） | users | 用户管理：搜索 / 改角色（防自改）/ 封禁解封（即时生效） |
| `/ai-usage` | ai-usage | AI 用量与成本：按日趋势 / 按用户 TOP（DeepSeek 单价 env 校准） |
| `/ops` | ops | 服务健康：水位卡 + 快照趋势 + 外部集成状态，30s 自刷 |

全局共享在 `src/{components,utils,styles,router,api}`；API 客户端统一走
`src/api/client.ts`（Bearer JWT + 401 自动清 token）。

## 开发

前置：先起 server（`server/dev.sh`，:8000；首次需 `rm -rf server/.venv && uv venv server/.venv --python 3.12 --seed && server/.venv/bin/pip install -r server/requirements-dev.lock`）。完整启动顺序见根 README「快速启动」。

```bash
cd admin
npm install
npm run dev    # localhost:5174（避开 App H5 dev 的 5173）；/api 代理到本地 server（默认 8000）
```

**初始账号**：`admin / HaoDuo@2026`（种子数据，bcrypt 入库；启动日志会提示，dev 环境登录页亦有提示——
生产不暴露默认密码探测端点；**上线前务必在管理端侧栏「修改密码」改掉**）。部署自动化场景可用 `ADMIN_PASSWORD` 覆盖默认密码；
也可用 `GITHUB_ADMIN_LOGINS` 白名单账号。鉴权走 `/api/auth/login` 响应体里的 token，
存 localStorage，全局路由守卫拦未登录。

## 构建与部署

```bash
npm run build   # vue-tsc 类型检查 + vite build → dist/
```

CI 单独构建 Admin 静态镜像并推送到 GHCR；Admin 镜像不包含 API。部署主机将 Admin 域名反代到
`127.0.0.1:18080`：

```bash
docker compose pull
docker compose up -d
```

生产 API 根地址配置在 `.env.production`。后端需将 Admin 域名的完整来源配置到
`ADMIN_WEB_ORIGIN`，加入 CORS 白名单。可选构建变量：

- `VITE_SENTRY_DSN` / `VITE_SENTRY_ENV`：构建期注入，启用 @sentry/vue 错误追踪；不设则关闭
- `VITE_API_BASE`：API 根地址；只填域名，不带 `/api`。开发模式走 Vite `/api` 代理
