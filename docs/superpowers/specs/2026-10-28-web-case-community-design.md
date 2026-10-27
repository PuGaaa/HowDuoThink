# Web 案例问答社区 · 设计规格

> 日期：2026-10-28 · 分支：feat/admin-and-monitoring
> 需求：App 端 132 个关卡案例同步到 Web 端，以「官方问答帖」形态填充社区内容；
> Web 定位 = 问答/分享社区（重点分享，其次 AI 辅助排错），本期含评论功能。

## 1. 背景与现状

- App 端 132 个案例（`server/seed/*.json`）已注册为 published case，并投影成 article
  （id = `a-{caseId}`，作者"官方"），Web `/solutions` 列表读的是 articles 表。
- **article 投影是有损的**：只保留专家链步骤 + 经验，丢案情描述、假设空间、根因、检查单。
- **现存 bug**：AI 排错出处链接到 `/solutions/{caseId}`，而 article id 是 `a-{caseId}`
  → 官方案例出处链接全部 404。
- Web 登录态已具备（`app.vue` 登录弹层 + cookie session），评论可直接复用。
- `/api/casepack` 是 App 增量同步协议，不改动、不复用给 Web。

## 2. 目标 / 非目标

**目标**
1. Web 上 132 个官方案例以完整问答帖形态可见、可读（案情=问题，排查+根因=回答，经验=沉淀）。
2. AI 排错出处链接可点通（顺带修复 404 bug）。
3. 案例详情页可评论（登录用户），评论走服务端持久化。
4. App 端零改动。

**非目标（YAGNI 清单）**
- 楼中楼回复、点赞、评论编辑、敏感词过滤、admin 评论管理页
- 章节级（chapterId）名称下发与筛选——Web 只展示篇名（3 个固定篇），不拷贝 11 章表，避免双源维护
- 玩法功能（Web 不做破案交互）

## 3. 后端设计

### 3.1 案例社区视图（扩展 `features/cases`，新函数，不动现有端点）

**`GET /api/cases`** — 公开只读，问答社区列表
- Query：`page`(≥1)、`size`(1–50，默认 20)、可选 `part`、`domain`
- 返回：`{total, items[]}`，item 字段（snake_case，与 ArticleOut 风格一致）：
  `id, title, intro, difficulty, domain, layer, part, chapter_id, type_tags, author_name, published_at, comment_count`
- 实现：`WHERE status='published'` 按 `published_at` DESC；payload 在 Python 侧解析裁剪
  （避免 JSON 函数方言差异）；`comment_count` 用一次 `GROUP BY target_id` 聚合查询并入，避免 N+1。

**`GET /api/cases/{case_id}`** — 公开只读，问答帖详情（社区视图，裁剪玩法机关）
- 404：不存在或未发布。
- 返回结构（问答帖六区块）：

```
{ id, title, author_name, published_at, difficulty, domain, layer, part, type_tags,
  brief:  { intro, timeline, impact_hint, scene: { role, architecture, symptoms[] } },
  hypotheses: [ { text } ],                                   # 裁 excludeActionId
  chain:      [ { thought, update, action, why, conclusion } ], # action=动作名；why 教学核心必展示
  root_cause: "<correct=true 的那条 text>",                     # 裁错误选项
  lessons:    [ { text, principle } ] }
```

- 不下发：`excludeActionId`、`cost`、`gain`、`danger`、错误根因选项、`restartActionId`、`expert_cost`。

### 3.2 评论（新 feature `features/comments/{router,service,models}`）

**表**（`core/db.py` schema 追加 `CREATE TABLE IF NOT EXISTS`，SQLite 方言走 `_translate`）：

```sql
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comments_target
  ON comments(target_type, target_id, created_at);
```

**端点**
- `GET /api/comments?targetType=case&targetId=x&page&size` — 公开；`created_at` **正序**分页
  （对话感）；join users 带昵称头像；返回 `{total, items:[{id, content, user_id, user_name, user_avatar, created_at}]}`。
- `POST /api/comments` — `Depends(current_user)`；body `{target_type, target_id, content}`；
  校验：`target_type` 本期仅 `case`、target 必须是已发布 case、`content` strip 后 1–500 字；
  频控（settings `security` 组新 key，管理端可调）：
  - `comment.min_interval_sec`（默认 15，同 uid 两次发言最小间隔）
  - `comment.daily_max`（默认 50，同 uid 每日上限）
  - 实现方式与 `ai.rate_limit` 同类（进程内计数，重启清零可接受）。
- `DELETE /api/comments/{id}` — 仅作者本人或 admin（`require_admin`），硬删；本期管理端无评论页，此接口兜底。

**id 生成**：跟随项目现状（uuid）。

## 4. 前端设计（web/，Nuxt 3）

### 4.1 列表页 `pages/solutions/index.vue`（重写）
- 数据源切到 `/api/cases`；筛选条：篇（全部/侦探学徒篇/一线工兵篇/资深值班篇）+ 域（全部/network/deploy/data/runtime/build/concurrency）；分页（上一页/下一页）。
- 卡片组件 `components/case/CaseCard.vue`：title + intro + chips（官方标 / 难度 / 篇名 / 评论数）。
- 篇名映射：Web 内置 3 条（apprentice→侦探学徒篇 等）。

### 4.2 详情页 `pages/solutions/[id].vue`（重写为问答帖）
- **取数**：路由参数若带旧 `a-` 前缀（历史 article URL），前端剥离后再请求
  `/api/cases/{caseId}`；404 再 fallback `/api/solutions/' + id`（旧文章兼容）；
  双 404 → "案例不存在或未发布"。
  - 由此 **AI 出处 `/solutions/{caseId}` 自然修复**。
- **区块组件**（`components/case/`，每个 <200 行，Nuxt 自动导入）：
  - `CaseBrief`（案情）：intro 置顶 + timeline / impact_hint / scene（角色、架构、症状列表）
  - `CaseHypotheses`（可能原因）：编号列表
  - `CaseChain`（专家排查过程）：竖向步骤条：观察(thought) → 动作(action) →
    **为什么选它(why，教学核心，高亮样式)** → 发现/排除(conclusion)
  - `CaseRootCause`（根因）：醒目卡片
  - `CaseLessons`（带走的经验）：text + principle
  - `CommentSection`（评论区）
- 旧文章 fallback 视图保留现有渲染（steps + lessons），不做改版。

### 4.3 评论区 `components/case/CommentSection.vue`
- props：`targetType`、`targetId`；内部 fetch `/api/me` 判登录态（与 me.vue 现状一致）。
- 列表正序分页，"加载更多"翻页。
- 发表：POST 成功后刷新列表；错误分支：401→"请先登录"（顶栏已有登录入口）、
  429→"发言太频繁"、422→校验提示。
- 删除：本人评论显示删除按钮，confirm 后 DELETE。
- 渲染纯文本插值（Vue 默认转义，防 XSS）。

### 4.4 其他页面
- 首页 `pages/index.vue`：hero 文案对齐问答社区定位；"最新解决逻辑"改"最新案例"（`/api/cases?size=6`）。
- 导航 `app.vue`：顶栏"解决逻辑"→"案例社区"（路由不变）。
- AI 页：零改动（出处链接自然修复）。

## 5. 错误处理与安全

- 评论：401 未登录 / 403 删他人 / 404 评论不存在 / 422 校验失败（含 target 不存在或未发布）/ 429 频控。
- 列表/详情公开只读，无鉴权；size 上限 50 防大分页。
- SQL 全参数化（现有 db 层）；评论渲染纯文本防 XSS；错误响应不泄露内部细节（跟随现有 HTTPException 风格）。

## 6. 测试

- `server/tests/test_cases_web.py`：列表分页/筛选/size 上限/详情六区块结构/玩法机关裁剪断言
  （响应中无 excludeActionId、无 cost/gain、root_cause 唯一且 correct）/ 未发布 404。
- `server/tests/test_comments.py`：未登录 401 / 发表成功 / content 越界 422 / target 不存在 422 /
  频控 429 / 删他人 403 / 删自己 200 / admin 删 200 / 列表分页与字段。
- Web：截图验收（H5 393x852 + 桌面 1920），检查文本错位、样式叠加。

## 7. 兼容与迁移

- App 端、`/api/casepack`、article 投影机制：零改动（article 保留作旧 URL 兼容层）。
- 建表走 `core/db.py` schema 追加（项目无迁移体系，跟随现状 `CREATE TABLE IF NOT EXISTS`）。
- settings 新增 2 个 key（security 组），管理端设置页自动可见（REGISTRY 驱动）。

## 8. 验收标准

1. `/solutions` 列表展示全部已发布案例（132 官方 + 社区已发布），可按篇/域筛选。
2. 任一官方案例详情页呈现六区块完整内容，无玩法机关字段泄露。
3. AI 排错回答的出处链接点开即为对应案例问答帖（不再 404）。
4. 登录后可评论、可删自己的评论；未登录只见列表+引导；频控生效。
5. `pytest server/tests` 相关用例全绿。
