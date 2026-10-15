# admin · 好多星管理端

独立管理后台：Vite + Vue 3 + TypeScript + Naive UI SPA。构建产物打进 server 的 api 镜像，
由 FastAPI 托管在 `/admin/`（多阶段构建见 `server/Dockerfile`），社区站不再承担管理职能。
形态决策与监控方案见 `docs/decisions/006-独立管理端与监控.md`。

## 页面清单（features 垂直切片：`src/features/<域>/{pages,api}`）

| 路由 | 域 | 说明 |
| --- | --- | --- |
| `/admin/overview` | stats | 数据概览：DAU / 新增用户 / 投稿采纳率 / 完关率 + 内容飞轮漏斗 |
| `/admin/submissions` | content | 投稿审核：通过转草稿 / AI 预填 / 驳回（带备注） |
| `/admin/cases`、`/admin/cases/:id` | content | Case 列表 / 编辑器（三级架构元数据 + JSON + 过门禁发布） |
| `/admin/users`（仅 admin 可见） | users | 用户管理：搜索 / 改角色（防自改）/ 封禁解封（即时生效） |
| `/admin/ai-usage` | ai-usage | AI 用量与成本：按日趋势 / 按用户 TOP（DeepSeek 单价 env 校准） |
| `/admin/ops` | ops | 服务健康：水位卡 + 快照趋势 + 外部集成状态，30s 自刷 |

全局共享在 `src/{components,utils,styles,router,api}`；API 客户端统一走
`src/api/client.ts`（Bearer JWT + 401 自动清 token）。

## 开发

```bash
cd admin
npm install
npm run dev    # localhost:5174（避开 App H5 dev 的 5173）；/api 代理到本地 server（默认 8000）
```

先起 server（见 `server/dev.sh`），管理员由 `ADMIN_PASSWORD` 引导创建（账号 `pw-admin`），
或用 `GITHUB_ADMIN_LOGINS` 白名单账号。鉴权走 `/api/auth/login` 响应体里的 token，
存 localStorage，全局路由守卫拦未登录。

## 构建与部署

```bash
npm run build   # vue-tsc 类型检查 + vite build → dist/
```

生产部署不需要单独发布管理端：`docker compose up -d --build` 时 node 阶段构建产物
自动 COPY 进 api 镜像。可选环境变量：

- `VITE_SENTRY_DSN` / `VITE_SENTRY_ENV`：构建期注入，启用 @sentry/vue 错误追踪；不设则关闭
- 独立域名部署（不走 api 同域托管）时：server 侧配 `ADMIN_WEB_ORIGIN` 加入 CORS 白名单
