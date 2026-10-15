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
