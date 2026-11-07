# web · 社区站（Nuxt 3）

好多星的公开 Web 站：解决逻辑展示、AI 排错对话、故障投稿、个人信息。
管理端已迁出至 `../admin/`（独立工程，由 server 托管 `/admin/`），本站不再承担管理职能。

## 启动

```bash
npm install
npm run dev    # localhost:3000；需先起 server（../server/dev.sh，:8000）
```

后端地址：环境变量 `API_BASE`（默认 `http://localhost:8000`）。
构建与预览：`npm run build` / `npm run preview`。

## 部署

独立镜像 `ghcr.io/pugaaa/howduothink-web`（CI 构建，Dockerfile 在本目录）。Nuxt SSR 容器内监听
3000，默认绑 `127.0.0.1:${WEB_PORT:-3000}`；`NUXT_PUBLIC_API_BASE` 运行时注入，填浏览器可达的
完整 origin（同域反代场景填站点 origin）。完整步骤与 nginx 同域路由示例见
`../server/部署与运维说明文档.md` 的「Web 社区站部署」。

## 页面

| 路由 | 说明 |
|---|---|
| `/` | 首页 + 最新解决逻辑列表 |
| `/ai` | AI 排错对话（需登录） |
| `/solutions`、`/solutions/[id]` | 解决逻辑展示 |
| `/submit` | 故障投稿（需登录） |
| `/me` | 个人信息 + 我的投稿 |

## 登录与鉴权

- GitHub OAuth / 账密（弹窗）；会话为 HttpOnly cookie（`session`），由 server 签发
- 唯一共享逻辑在 `composables/useApi.ts`（$fetch 包装，`credentials: 'include'`）
- 开发绕行登录仅 server `ENV=dev` 时可用：`/api/dev/login?login=xxx`

## 关联

- 后端接口与启动：`../server/README.md`
- 管理端（投稿审核/Case 发布在这里做）：`../admin/README.md`
