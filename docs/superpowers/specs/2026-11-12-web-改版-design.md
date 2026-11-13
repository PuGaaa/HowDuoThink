# Web 端改版设计（账号 / 头像 / AI 会话 / 布局与液态质感）

日期：2026-11-12　范围：`web/`（Nuxt）+ `server/features/{auth,ai}`

## 目标

1. 短信登录用户（无密码）能直接设置密码；已有密码的用户走修改密码。
2. 登录后始终有头像；个人信息弹窗不再出现头像 URL 和登录方式。
3. AI 排错有会话列表和历史记录，追问能接上前文；接口报错不再把原始异常和接口地址显示给用户。
4. 全站背景 `#FAFAFA`，内容区放宽，不再缩在中间；顶栏、弹出卡片、AI 页带液态玻璃质感。

## 1. 密码：设置与修改拆开（仅前端）

后端 `POST /api/me/password` 已支持无密码用户免旧密码，`GET /api/me` 已返回 `hasPassword`。

- `hasPassword=false`：入口文案“设置密码”，组件 `SetPasswordModal`，字段为新密码、确认。
- `hasPassword=true`：入口文案“修改密码”，组件 `ChangePasswordModal`，字段为当前密码、新密码、确认。
- 成功后重新拉取 `/api/me`，入口随 `hasPassword` 切换。

## 2. 头像与个人信息

### 默认头像

优先级与 App 一致：用户自己的头像 → 头像池（`GET /api/app-resources` 的 `avatars`）。

- 头像为空时，Web 从头像池**随机**取一张，并通过现有 `PATCH /api/me` 存到账号上。
  这样只随机一次，之后刷新、换设备、App 端看到的都是同一张。
- 头像池为空或请求失败时，显示昵称首字占位，不写入账号。
- 顶栏、`/me` 资料卡、个人信息弹窗共用 `UserAvatar` 组件，图片加载失败同样回落到占位。

### 修改头像

个人信息弹窗中点击头像，可从头像池选择，或上传本地图片。

新增 `POST /api/me/avatar`（登录即可）：

- 类型：png / jpg / webp。不接受 svg（可内嵌脚本）和 gif。
- 大小上限 2MB；读文件前先按声明大小拦截。
- 每用户每日上传次数上限 10。
- 存到 OSS 独立前缀 `<OSS_KEY_PREFIX>/user-avatar/<uid>/…`，不写 `assets` 表。
  原因：`assets` 中 `category='avatar'` 的行即公共头像池，且会进入公开清单。
- 成功后更新 `users.avatar` 并返回最新资料。
- OSS 未配置返回 503，写入失败返回 502，均不泄露底层细节。

校验与 OSS 写入放在 `features/assets/service` 的公开函数里，`auth` 路由只调用该接口。

### 去掉

个人信息弹窗中的头像 URL 输入框、“登录方式”一行。

## 3. AI 排错

### 3-1 会话与历史

迁移 `0013_ai_conversations`：

- `ai_conversations`：`id`、`uid`、`title`、`created_at`、`updated_at`；索引 `(uid, updated_at)`。
- `ai_messages`：`id`、`conversation_id`、`role`（user/assistant）、`content`、`sources`（JSON）、`created_at`；索引 `(conversation_id, id)`。

接口（均需登录，出入参用 Pydantic 模型）：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ai/chat` | 入参增加可选 `conversationId`；不传则新建会话。出参增加 `conversationId` |
| GET | `/api/ai/conversations?limit=&offset=` | 按 `updated_at` 倒序；`limit` 默认 20，上限 50 |
| GET | `/api/ai/conversations/{id}` | 会话信息与全部消息 |
| DELETE | `/api/ai/conversations/{id}` | 删除会话及其消息（同一事务） |

规则：

- 会话不属于当前用户或不存在，一律 404。
- 标题取首个问题的前 30 字。
- 问题和回答在回答成功后同一事务写入，并更新 `updated_at`；限速、配额、模型失败时不写任何记录，也不创建空会话。
- 每个用户最多保留 100 个会话，超出时删除最久未更新的。

多轮上文：

- 取该会话最近 3 轮（6 条消息）作为历史，放在 system 提示和本次问题之间。
- 检索词为“上一个用户问题 + 当前问题”拼接，不额外调用模型改写。
- 新会话的行为与现在完全一致。

SQL 放 `features/ai/repo.py`，业务规则放 `service.py`。

### 3-2 报错

- 前端：不再拼接异常的 `message`。401 显示“请先登录后再提问”，其余显示“服务暂时不可用，请稍后再试”；细节只写控制台。
- 后端：`chat` 中模型或检索调用抛异常时记录日志（带请求 id），返回 `{"error": "服务暂时不可用，请稍后再试"}`。
- “AI 未配置”的提示改为不含环境变量名的文案。

### 页面

双栏：左侧会话列表（新对话、标题、相对时间、删除），右侧对话区。
移动端列表收进抽屉，由顶部按钮打开。未登录时显示登录引导，不请求列表。

## 4. 布局

- `--bg: #FAFAFA`。分隔线和卡片底边阴影由暖米色改为中性灰；珊瑚主色不变。
- 顶栏通栏吸顶；内容区最大宽度 760px → 1280px，左右内边距 32px。
- 首页、解决逻辑列表：2–3 栏卡片网格。
- 文章详情：正文加右侧信息栏，正文行宽不超过约 760px。
- 投稿：表单加右侧说明栏。
- 我的投稿：资料卡加投稿网格。
- 600px 以下保持单栏。

## 5. 液态玻璃质感

用于顶栏、所有弹出层（登录、个人信息、密码、头像选择、用户菜单）和 AI 页（会话侧栏、输入框、助手气泡）。
正文卡片保持实底，保证长文可读。

- **材质**：半透明白底，`backdrop-filter: blur() saturate()`，1px 高光描边，顶部内高光，柔和的大半径投影。
- **折射来源**：页面底层放 2–3 个低饱和、大模糊的色团（珊瑚、薄荷、天蓝），固定定位、缓慢漂移。
  底色仍是 `#FAFAFA`，色团只为让玻璃有东西可透。
- **动效**：弹出层以带回弹的缩放淡入；按钮按下有轻微形变；AI 思考态用流动的液滴代替三个跳点。
- **降级**：不支持 `backdrop-filter` 时用不透明度更高的实底；`prefers-reduced-motion` 下关闭漂移和回弹。
- **可读性**：玻璃面上的文字对比度不低于 4.5:1。

材质定义为 `assets/css/glass.css` 中的一组变量和 `.glass` 工具类，各组件复用，不各写一份。

## 代码组织

```
web/
  assets/css/{main.css, glass.css}
  components/
    account/{LoginModal, ProfileModal, AvatarPicker, SetPasswordModal, ChangePasswordModal, UserMenu, UserAvatar}.vue
    ai/{ConversationList, ChatMessages, ChatComposer}.vue
    layout/{TopBar, GlassModal, LiquidBackdrop}.vue
  composables/{useApi, useCurrentUser, useAvatarPool, useAiChat}.ts
server/
  alembic/versions/0013_ai_conversations.py
  features/ai/{repo.py, models.py, service.py, router.py}
  features/assets/service.py   # 新增用户头像上传的公开函数
  features/auth/router.py      # 新增 POST /api/me/avatar
```

`app.vue` 只保留外壳，登录态由 `useCurrentUser` 共享，`/me` 页不再重复请求。

## 测试与验收

后端先写失败测试再实现：

- 会话：新建、续聊、归属 404、分页上限、删除、失败不落库、超出 100 个时淘汰。
- 多轮：历史条数截断为 3 轮；检索词包含上一个问题。
- 报错：模型抛异常时返回友好提示且不含异常文本。
- 头像上传：类型、大小、日限次、未配置 503、成功后资料更新、不写 `assets` 表。
- 迁移：升级与回滚。

前端：1920 宽、393×852、375×667 逐页截图，检查文字错位、样式叠加、玻璃面对比度。

## 不做

- 会话重命名、搜索、导出。
- 头像裁剪。
- 流式输出。
- 管理端（`admin/`）和 App 的样式改动。
