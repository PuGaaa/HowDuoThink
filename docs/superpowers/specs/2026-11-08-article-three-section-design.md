# 题库逆解析三段式社区文章 · 设计规格

> 日期：2026-11-08 · 基于 main（2e1005e）
> 需求：把题库（`cases.payload` 结构化关卡 JSON）逆解析为 web 社区站内容，
> 以「标题 / 问题 / 解决方案」三段式呈现。

## 1. 背景与现状（2026-11-08 线上实测）

- 生产 API `api.moooooz.com/api/solutions` 返回 `total=131`：**articles 表非空**，
  131 篇旧格式文章（observe/act/found 步骤流 + lessons 文本），由 case 发布事务派生
  （`features/cases/publication.py::_article` → `repo.save_article`，upsert 幂等）。
- 旧投影有损：**无「问题」段**（scene 症状面未进文章）、无根因（rootCauses）、
  无层契约（lessons.principle）。
- **线上 web 页面显示「该层暂无内容」**：web 站 SSR 取数失败——生产 `.env` 的
  `NUXT_PUBLIC_API_BASE=api.moooooz.com` 缺 `https://` 前缀，URL 解析失败
  （页面水合数据含 NuxtError 500 "Failed to parse URL"）。属部署配置 bug，与本功能正交，
  由用户在生产服务器修改 `.env` 后重启 web 容器（见 §7 第 1 步）。
- 本地 dev 库（`server/data.db`）为空（seed 未跑过）。
- 旧规格关系：`2026-10-28-web-case-community-design.md` 规划的 `GET /api/cases`
  社区视图与评论功能**从未实施**；本规格以「升级 articles 投影」取代其内容填充目标。
  该规格记录的 AI 出处 404 bug 仍存在（`web/pages/ai.vue:128` 链接 `/solutions/{caseId}`，
  而文章 id 是 `a-{caseId}`）——本期不修，留作独立一行修复。

## 2. 目标 / 非目标

**目标**
1. 文章三段式：标题（title）+ 问题（scene 投影）+ 解决方案（排查步骤 + 根因 + 经验/层契约）。
2. 存量 131 篇升级为三段式：一次性投影重建（只写 articles，cases 零接触）。
3. 新发布/修订案例自动产出三段式（发布事务内派生，单一事实源）。
4. API 只加字段不改字段；App 零感知（已核实全服务端仅 web solutions API 读 articles）。
5. web 详情页三段式渲染；列表页卡片加一句话副标题。

**非目标（YAGNI 清单）**
- AI 润色/改写——纯模板投影
- 评论、点赞等互动功能（旧规格范围，另行立项）
- 修改 cases 表或 payload schema
- AI 出处 404 修复
- 修改任何历史迁移

## 3. 决策记录

| 决策 | 结论 | 理由 |
|---|---|---|
| 生成方式 | 方案 A：发布事务内派生、存 articles | 单一事实源，随修订自动更新；独立脚本生成=双源漂移；web 实时渲染丢内容实体挂载点 |
| 存量升级 | ops 重建脚本（幂等可重跑） | `_publish` 对内容未变案例提前返回、不刷新文章（publication.py:113）；重建与发布共用同一 `_article()`，dev/prod 同一实现 |
| detail 存储 | articles 加一列 `detail`（JSON TEXT，可空） | 一列装下问题/根因/层契约，迁移最小；steps/lessons 原样保留，向后兼容 |
| 问题段来源 | `intro` + `scene` 原文投影，不虚构 | 写作规范六部件的「症状面」即问题段 |

## 4. 后端设计

### 4.1 迁移 `0012_article_detail`

- `op.add_column("articles", sa.Column("detail", sa.Text(), nullable=True))`；
  downgrade 删列。引擎无关 `op.*`（方言翻译在 core/db.py）。
- `test_baseline_matches_fixture` 只比对 0001 基线，夹具无需更新；
  `test_replay_mysql` 重放全链自动覆盖新迁移。

### 4.2 模型（features/cases/models.py）

新增模型，detail JSON 顶层键与本域 API 风格一致（snake），嵌套 problem 镜像 scene（camel）：

```json
{
  "problem": {
    "intro": "…",
    "role": "…",
    "architecture": "…",
    "symptoms": [ { "type": "log|error|text|code", "title": "…", "text": "…" } ],
    "timeline": "…",
    "impactHint": "…"
  },
  "root_cause": "…",
  "principles": ["…"]
}
```

- `ArticleProblem`：intro / role / architecture / symptoms / timeline / impact_hint(alias impactHint)
- `ArticleDetail`：problem / root_cause / principles
- `ArticleProjection` 增加可空字段 `detail: ArticleDetail | None = None`

### 4.3 派生规则（publication.py `_article()`，纯模板）

```python
detail = ArticleDetail(
    problem=ArticleProblem(
        intro=payload.intro, role=scene.role, architecture=scene.architecture,
        symptoms=[...], timeline=scene.timeline, impact_hint=scene.impact_hint,
    ),
    root_cause=next(rc.text for rc in payload.root_causes if rc.correct),  # 门禁保证恰好 1 个 correct
    principles=[lesson.principle for lesson in payload.lessons],
)
```

标题 = `title`、解决方案步骤 = 既有 expertChain 投影、经验 = `lessons[].text`，均维持现状。

### 4.4 持久化（repo.save_article）

INSERT / ON CONFLICT 增加 `detail` 列（`jdump(detail.model_dump(by_alias=True))`）。
**upsert 语义不变**（冲突分支仍刷新 `published_at`）——列表排序稳定性由重建脚本负责（§4.6）。

### 4.5 API（features/solutions）

- `ArticleOut` 新增：`problem: ProblemOut | None`、`root_cause: str | None`、
  `principles: list[str]`；既有字段（steps/lessons/published_at 等）形状不变。
- `article_view`：detail 列缺失（NULL）→ `problem=None`、`root_cause=None`、`principles=[]`，
  web 按空值降级隐藏对应段。
- 列表接口同样返回（`SELECT *` 已含新列，无需改 SQL）。

### 4.6 重建脚本 `ops/rebuild_articles.py`

- 遍历 `cases WHERE status='published'` → `CasePayload.model_validate` → 复用 `_article()` →
  `save_article`；per-case 事务，幂等可重跑，输出 rebuilt/skipped 统计（预期 rebuilt=131）。
- **保持排序**：读原 articles 行的 `published_at`，在同事务内写回，避免 upsert 刷新时间
  打乱列表顺序。
- 作者名沿用现有 articles 行 `author`；无对应行时按 `cases.author_id` 联查 users
  （name，缺省 `@login`）兜底。
- 跑法：dev `python ops/rebuild_articles.py`（dev.sh 已 source 环境）；
  prod `docker compose exec api python ops/rebuild_articles.py`。

## 5. Web 设计（Nuxt 3，不引 UI 库）

- `components/solutions/ProblemSection.vue`：props `problem`；渲染导语 intro、
  现场（role + architecture）、症状证据（type=log|error|code 用等宽块样式，text 用段落）、
  时间线 timeline、影响面 impactHint。scoped style，复用现有 CSS 变量。
- `components/solutions/RootCauseCard.vue`：props `rootCause`、`principles`；
  根因收束卡 + 层契约列表。
- `pages/solutions/[id].vue` 重构为三段式：标题区（title + domain/layer chips +
  作者/日期/贡献者，保留现状）→ 问题段（v-if problem）→ 解决方案段
  （既有步骤流渲染 + RootCauseCard + 「带走的经验」lessons）。预计 <200 行，超限再拆。
- `pages/solutions/index.vue`：卡片标题下加 `problem?.intro` 一句话副标题（可空容错）。

## 6. 配置与文档加固

- `web/.env.example`：`NUXT_PUBLIC_API_BASE` 注释标明**必须含 `http(s)://` 前缀**。
- `server/部署与运维说明文档.md`「Web 社区站部署」章节补：
  - 排障条目：症状「该层暂无内容」+ 水合错误 `Failed to parse URL` → 检查 API base 前缀；
  - 升级步骤：新 server 镜像（含迁移）→ 跑 `ops/rebuild_articles.py` → 新 web 镜像。

## 7. 部署顺序（生产）

1. **可立即独立执行**：生产 web `.env` 补 `https://` 前缀，重启 web 容器
   → 现有 131 篇旧格式文章恢复可见（不等本功能）。
2. 合并本功能 → 发布新 server 镜像（启动时迁移加列）→ 跑重建脚本（预期 rebuilt=131）。
3. 发布新 web 镜像（三段式渲染）。

dev 同构：空库跑 `python seed.py` 即全量新格式；已有存量库跑重建脚本。全程同一实现。

## 8. 测试计划（TDD：先写失败测试，再实现）

- 派生单测：样例 payload → `detail` 各字段断言（problem 来自 scene、root_cause 取唯一
  correct 根因、principles 非空）。
- API 测试：`GET /api/solutions/{id}` 新字段断言；detail 为 NULL 的行降级
  （problem=null、principles=[]）断言。
- 迁移：`test_replay_mysql` 真实 MySQL 重放自动覆盖；dev.sh 环境跑全量 pytest。
- web：本地 seed 后起 server + web 联调，截图验收 393×852 与 1920 两档，
  检查文本错位、样式叠加等基础样式错误。

## 9. 验收标准

1. 生产 `/solutions` 列表可见 131 篇，详情页呈三段式（问题段含症状证据）。
2. `/api/solutions` 既有字段形状不变；新增 problem/root_cause/principles 就位。
3. 新发布/修订案例的文章自动含 detail（发布事务内派生）。
4. pytest 全绿；App 端零改动。

## 10. 风险与兼容

- detail NULL 降级：API 输出 null/[] + web v-if 隐藏，重建后自然消除。
- 重建与发布并发：per-case 事务串行，同一派生函数无内容漂移，last-writer-wins 无害。
- MySQL TEXT 容量：problem JSON 约 2–6KB，TEXT(64KB) 足够（与 steps 同型）。
- 重建脚本已写回原 published_at，列表顺序不受影响。
