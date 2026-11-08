# 题库逆解析三段式社区文章 实施计划

> **给执行者：** 必须使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现本计划。步骤用复选框 `- [ ]` 追踪。

**目标：** 把题库（cases.payload）逆解析为「标题/问题/解决方案」三段式社区文章，存量 131 篇一并重建。

**架构：** articles 表加一列 `detail`（JSON TEXT），发布事务内由 `_article()` 派生（单一事实源）；solutions API 只加字段；存量行用 ops 重建脚本刷新（复用同一派生函数）；web 详情页三段式渲染。

**技术栈：** FastAPI + SQLAlchemy(migrations) + MySQL 8（dev 同构，本地经 core/db.py 方言翻译）；Nuxt 3 + Vue 3；pytest。

**规格：** `docs/superpowers/specs/2026-11-08-article-three-section-design.md`（执行者两份都要读）

## 全局约束

- Python 3.12：统一用 `cd server && set -a && . ./.env.dev.local && set +a && .venv/bin/python -m pytest <目标> -v` 跑测试（.env 只 source 提供本地 MySQL 连接变量，**不得读取/输出其值**）。
- SQL 一律 SQLite 方言（`?` 占位 / `datetime('now')` / `ON CONFLICT ... DO UPDATE`），由 core/db.py 统一翻译；迁移文件用引擎无关 `op.*`，**不修改历史迁移**。
- detail JSON 键约定：顶层 `problem` / `root_cause` / `principles`（snake，本域惯例）；`problem` 内镜像 scene 用 camel（`impactHint`）。
- `_article()` 取 `root_cause` 用 `next(rc.text for rc in payload.root_causes if rc.correct)`：门禁与冻结哈希保证恰好 1 个 correct，**缺 correct 直接抛错（fail-fast），禁止加默认值掩盖数据异常**。
- API 只加字段不改字段；既有出参形状不变；App 端零改动。
- server 代码提交前跑 `.venv/bin/python -m ruff format <改动文件> && .venv/bin/python -m ruff check <改动文件>`。
- 提交信息 conventional commits（feat(server)/feat(web)/docs/chore），中文描述。

## 评审聚焦点

1. **detail 键大小写**：`problem.impactHint`（camel）与顶层 `root_cause`（snake）混排——web 模板取 `a.problem?.impactHint`、`a.root_cause`，取错即渲染空白。约束：任务 2 落库键名断言 + 任务 3 API 键名断言 + 任务 5 截图。
2. **存量行 detail=NULL 降级**：API 必须输出 `problem=None`、`root_cause=None`、`principles=[]`，web v-if 隐藏对应段。约束：任务 3 降级测试。
3. **重建脚本打乱列表排序**：`save_article` 冲突分支会刷新 `published_at`，脚本必须读原值并写回。约束：任务 4 断言 published_at 不变。
4. **by_alias 转储**：solutions `article_view` 若用默认 `model_dump()`，`impact_hint` 会输出成 snake 键、web 取不到。约束：任务 3 断言响应里是 `impactHint`。
5. **fail-fast 根因**：派生遇到 0 个 correct 根因抛 StopIteration 是设计行为（数据异常宁崩不默），禁止吞掉。约束：任务 2 实现说明，无测试。

---

### 任务 1：迁移 0012_article_detail

**文件：**
- 新建：`server/alembic/versions/0012_article_detail.py`
- 修改：`server/tests/test_migrations.py`（文件末尾追加测试）

**接口：**
- 消费：迁移链头部 `0011_app_docs`（`server/alembic/versions/0011_app_docs.py` 的 revision 值）
- 产出：articles 表可空 TEXT 列 `detail`（任务 2 起读写）

- [ ] **步骤 1：写失败测试**（追加到 `tests/test_migrations.py`，沿用该文件已 import 的 `command/config/migrate/sa`）

```python
def test_article_detail_column(new_database):
    new_database()
    migrate.upgrade_head()
    engine = sa.create_engine(config.mysql_database_url())
    try:
        inspector = sa.inspect(engine)
        assert "detail" in {c["name"] for c in inspector.get_columns("articles")}
    finally:
        engine.dispose()
    command.downgrade(migrate._cfg(), "0011_app_docs")
    engine = sa.create_engine(config.mysql_database_url())
    try:
        inspector = sa.inspect(engine)
        assert "detail" not in {c["name"] for c in inspector.get_columns("articles")}
    finally:
        engine.dispose()
```

- [ ] **步骤 2：跑测试确认失败**

运行：`cd server && set -a && . ./.env.dev.local && set +a && .venv/bin/python -m pytest tests/test_migrations.py::test_article_detail_column -v`
预期：失败，断言 `"detail" in {...}` 不成立（列不存在）

- [ ] **步骤 3：新建迁移文件**（内容逐字如此——值由规格钉死）

```python
"""articles 增加 detail 列：三段式社区文章（问题/根因/层契约）投影。"""

import sqlalchemy as sa

from alembic import op

revision = "0012_article_detail"
down_revision = "0011_app_docs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("articles", sa.Column("detail", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("articles", "detail")
```

- [ ] **步骤 4：跑测试确认通过**（同步骤 2 命令，预期通过；再跑 `tests/test_migrations.py -v` 全文件确认无回归）

- [ ] **步骤 5：提交**

```bash
git add server/alembic/versions/0012_article_detail.py server/tests/test_migrations.py
git commit -m "feat(server): 迁移 0012——articles 增加 detail 列（三段式文章投影）"
```

---

### 任务 2：detail 模型、发布派生与落库

**文件：**
- 修改：`server/features/cases/models.py`（`ArticleStep`/`ArticleProjection` 区域，约 L179-192）
- 修改：`server/features/cases/publication.py:157-174`（`_article()`）
- 修改：`server/features/cases/repo.py:104-117`（`save_article`）
- 测试：新建 `server/tests/test_solutions.py`

**接口：**
- 消费：`CasePayload.scene`（`SceneIn`：role/architecture/timeline/impact_hint/symptoms）、`root_causes`（`RootCauseIn.text/.correct`）、`lessons`（`LessonIn.text/.principle`）、`EvidenceIn`（type/title/text）；门禁保证恰好 1 个 correct 根因
- 产出（后续任务按此引用）：
  - `ArticleProblem`（models.py）：字段 `intro/role/architecture/symptoms: list[EvidenceIn]/timeline/impact_hint`，`model_config = ConfigDict(populate_by_name=True)`，`impact_hint` 带 `Field(alias="impactHint")`；`model_dump(by_alias=True)` 产出 problem JSON
  - `ArticleDetail`（models.py）：`problem: ArticleProblem`、`root_cause: str`、`principles: list[str]`
  - `ArticleProjection.detail: ArticleDetail | None = None`
  - `publication.derive_article = _article`（公开别名，供任务 4 脚本导入，防双源漂移）
  - `repo.save_article(conn, article: ArticleProjection) -> None`（签名不变，新增 detail 读写）

- [ ] **步骤 1：写失败测试**（新建 `tests/test_solutions.py`，`_publish` 是本文件共享 helper，任务 3/4 复用）

```python
"""articles 三段式投影（detail）与 solutions 展示域测试。"""

import db
from features.cases.models import CasePayload
from tests.case_fixtures import community_payload
from tests.conftest import load_seed, login_admin, make_client

client = make_client()


def _publish() -> dict:
    login_admin(client)
    payload = community_payload()
    r = client.post("/api/cases", json=payload)
    assert r.status_code == 200, r.text
    return payload


def test_publish_writes_detail_projection():
    payload = _publish()
    row = db.q("SELECT detail FROM articles WHERE id=?", ("a-" + payload["id"],))[0]
    detail = db.jload(row["detail"], None)
    assert detail is not None
    scene = CasePayload.model_validate(payload).scene
    assert detail["problem"]["intro"] == payload["intro"]
    assert detail["problem"]["impactHint"] == scene.impact_hint
    assert detail["problem"]["role"] == scene.role
    assert [s["title"] for s in detail["problem"]["symptoms"]] == [s.title for s in scene.symptoms]
    correct = next(rc["text"] for rc in payload["rootCauses"] if rc["correct"])
    assert detail["root_cause"] == correct
    assert detail["principles"] == [lesson["principle"] for lesson in payload["lessons"]]
```

- [ ] **步骤 2：跑测试确认失败**

运行：`cd server && set -a && . ./.env.dev.local && set +a && .venv/bin/python -m pytest tests/test_solutions.py -v`
预期：失败，`detail is not None` 断言不成立（save_article 还没写 detail 列）

- [ ] **步骤 3：实现三处修改**

  1. `features/cases/models.py`：按「接口-产出」定义 `ArticleProblem`、`ArticleDetail`，并给 `ArticleProjection` 加 `detail: ArticleDetail | None = None`（`ConfigDict` 该文件已导入）。
  2. `features/cases/publication.py` `_article()`：构造 detail 并挂到返回的 `ArticleProjection`；symptoms 直接传 `payload.scene.symptoms`（同为 `EvidenceIn` 实例，勿复制转换）。**不加 correct 根因的默认值**（见全局约束）。从 models 导入 `ArticleDetail, ArticleProblem`，并在模块内 `_article` 定义后加一行公开别名 `derive_article = _article`。
  3. `features/cases/repo.py` `save_article`：INSERT 列清单与 ON CONFLICT SET 各加 `detail`（`detail=excluded.detail`）；参数位传 `db.jdump(article.detail.model_dump(by_alias=True)) if article.detail else None`（注意 SQL 列数与占位符同步 +1）。

- [ ] **步骤 4：跑测试确认通过**（同步骤 2 命令；再跑 `tests/test_cases.py -v` 确认发布链路无回归）

- [ ] **步骤 5：ruff + 提交**

```bash
cd server && .venv/bin/python -m ruff format features/cases/models.py features/cases/publication.py features/cases/repo.py tests/test_solutions.py && .venv/bin/python -m ruff check features/cases/models.py features/cases/publication.py features/cases/repo.py tests/test_solutions.py
git add server/features/cases/models.py server/features/cases/publication.py server/features/cases/repo.py server/tests/test_solutions.py
git commit -m "feat(server): 案例发布派生三段式文章 detail（问题/根因/层契约）"
```

---

### 任务 3：solutions API 三段式出参

**文件：**
- 修改：`server/features/solutions/models.py`
- 修改：`server/features/solutions/service.py`（`article_view`）
- 测试：`server/tests/test_solutions.py`（追加）

**接口：**
- 消费：任务 2 的 detail 列 JSON（键：`problem{intro,role,architecture,symptoms[{type,title,text}],timeline,impactHint}` / `root_cause` / `principles`）；任务 2 测试文件里的 `client`、`_publish()`
- 产出（任务 5 web 按此取数）：`GET /api/solutions` 与 `/api/solutions/{id}` 的 item/detail 在既有字段外新增 `problem: object | null`、`root_cause: string | null`、`principles: string[]`（detail 缺失时为 null/null/[]）

- [ ] **步骤 1：写失败测试**（追加到 `tests/test_solutions.py`）

```python
def test_solution_detail_api_has_three_sections():
    payload = _publish()
    body = client.get("/api/solutions/a-" + payload["id"]).json()
    assert body["problem"]["impactHint"] == payload["scene"]["impactHint"]
    assert body["problem"]["symptoms"][0]["type"] == payload["scene"]["symptoms"][0]["type"]
    assert body["root_cause"]
    assert len(body["principles"]) == len(payload["lessons"])
    assert set(body["steps"][0]) == {"no", "observe", "act", "found"}
    assert isinstance(body["lessons"], list)


def test_solution_detail_degrades_when_detail_null():
    payload = _publish()
    db.ex("UPDATE articles SET detail=NULL WHERE id=?", ("a-" + payload["id"],))
    body = client.get("/api/solutions/a-" + payload["id"]).json()
    assert body["problem"] is None
    assert body["root_cause"] is None
    assert body["principles"] == []


def test_solution_list_carries_problem():
    payload = _publish()
    body = client.get("/api/solutions?page=1&size=20").json()
    item = next(i for i in body["items"] if i["id"] == "a-" + payload["id"])
    assert item["problem"]["intro"] == payload["intro"]
```

- [ ] **步骤 2：跑测试确认失败**

运行：`cd server && set -a && . ./.env.dev.local && set +a && .venv/bin/python -m pytest tests/test_solutions.py -v`
预期：新测试失败（KeyError: "problem"），任务 2 的旧测试仍通过

- [ ] **步骤 3：实现**

  1. `features/solutions/models.py`：新增 `SymptomOut{type,title,text}`、`ProblemOut`（字段同 `ArticleProblem`，含 `impact_hint` alias `impactHint` 与 `populate_by_name=True`，需补导入 `ConfigDict, Field`）；`ArticleOut` 加 `problem: ProblemOut | None = None`、`root_cause: str | None = None`、`principles: list[str] = []`。不跨 feature 导入 cases 的模型。
  2. `features/solutions/service.py` `article_view`：`detail = db.jload(r["detail"], None)`；有则 `problem=ProblemOut(**detail["problem"])`、`root_cause=detail["root_cause"]`、`principles=detail["principles"]`，无则 `None/None/[]`；ArticleOut 构造挂上三字段。**`model_dump()` 必须改为 `model_dump(by_alias=True)`**（否则 impact_hint 输出 snake 键、web 取不到；ArticleOut 无 alias 字段输出不变）。

- [ ] **步骤 4：跑测试确认通过**（同步骤 2 命令）

- [ ] **步骤 5：ruff + 提交**

```bash
cd server && .venv/bin/python -m ruff format features/solutions/models.py features/solutions/service.py tests/test_solutions.py && .venv/bin/python -m ruff check features/solutions/models.py features/solutions/service.py tests/test_solutions.py
git add server/features/solutions/models.py server/features/solutions/service.py server/tests/test_solutions.py
git commit -m "feat(solutions): API 出参新增 problem/root_cause/principles（detail 空值降级）"
```

---

### 任务 4：ops 重建脚本 + 部署文档升级步骤

**文件：**
- 新建：`server/ops/rebuild_articles.py`（仿 `ops/seed_test_account.py` 的文件头惯例：模块 docstring 写用途/用法/安全边界，`sys.path.insert(0, str(Path(__file__).resolve().parents[1]))`）
- 修改：`server/部署与运维说明文档.md`「Web 社区站部署」章节（补「升级与存量重建」小节）
- 测试：`server/tests/test_solutions.py`（追加）

**接口：**
- 消费：任务 2 的 `publication.derive_article(payload: CasePayload, author: str) -> ArticleProjection`、`repo.save_article(conn, article)`、`repo.author(conn, uid) -> dict`（含 `name`/`login` 键）
- 产出：`rebuild_all() -> tuple[int, int]`（返回 `(rebuilt, total)`；`if __name__ == "__main__":` 打印统计）

- [ ] **步骤 1：写失败测试**（追加）

```python
def test_rebuild_restores_detail_and_keeps_published_at():
    payload = _publish()
    article_id = "a-" + payload["id"]
    before = db.q("SELECT published_at FROM articles WHERE id=?", (article_id,))[0]["published_at"]
    db.ex("UPDATE articles SET detail=NULL WHERE id=?", (article_id,))
    from ops.rebuild_articles import rebuild_all

    rebuilt, total = rebuild_all()
    assert rebuilt >= 1 and total >= 1
    row = db.q("SELECT detail, published_at FROM articles WHERE id=?", (article_id,))[0]
    assert db.jload(row["detail"], None) is not None
    assert row["published_at"] == before
```

- [ ] **步骤 2：跑测试确认失败**

运行：`cd server && set -a && . ./.env.dev.local && set +a && .venv/bin/python -m pytest tests/test_solutions.py::test_rebuild_restores_detail_and_keeps_published_at -v`
预期：失败，`ModuleNotFoundError: ops.rebuild_articles`

- [ ] **步骤 3：实现 `ops/rebuild_articles.py`**

要点（流程钉死，函数体自行组织）：
- 查 `SELECT id, payload, author_id FROM cases WHERE status='published'`；
- 每行：`CasePayload.model_validate(db.jload(...))` → 读现有 articles 行的 `author` 与 `published_at`（无行或 author 空时用 `repo.author(conn, author_id)` 取 `name`，缺省 `"@" + login`）→ `with db.tx() as conn:` 内 `repo.save_article(conn, derive_article(payload, author))`；
- **原行存在且 published_at 非空时，同事务内 `UPDATE articles SET published_at=? WHERE id=?` 写回原值**（防 upsert 刷新时间打乱列表顺序）；
- 逐 case 独立事务，幂等可重跑；docstring 写明 dev/prod 跑法（dev：`cd server && set -a && . ./.env.dev.local && set +a && .venv/bin/python ops/rebuild_articles.py`；prod：`docker compose exec api python ops/rebuild_articles.py`）。

- [ ] **步骤 4：跑测试确认通过**（同步骤 2 命令）

- [ ] **步骤 5：部署文档补「升级与存量重建」小节**（内容按规格 §7 第 2 步：新 server 镜像含迁移 → `docker compose exec api python ops/rebuild_articles.py`（幂等，预期 rebuilt=131）→ 新 web 镜像）

- [ ] **步骤 6：ruff + 提交**

```bash
git add server/ops/rebuild_articles.py server/部署与运维说明文档.md server/tests/test_solutions.py
git commit -m "feat(ops): articles 三段式投影重建脚本（存量文章升级，保持发布时间）"
```

---

### 任务 5：web 三段式渲染 + 配置文档加固

**文件：**
- 新建：`web/components/solutions/ProblemSection.vue`
- 新建：`web/components/solutions/RootCauseCard.vue`
- 修改：`web/pages/solutions/[id].vue`（整页模板重构为三段式）
- 修改：`web/pages/solutions/index.vue:25-31`（卡片副标题）
- 修改：`web/.env.example`（NUXT_PUBLIC_API_BASE 注释）
- 修改：`server/部署与运维说明文档.md`（Web 社区站章节补排障条目）

**接口：**
- 消费：任务 3 的 API 形状——`a.problem?.intro / .role / .architecture / .timeline / .impactHint / .symptoms[]{type,title,text}`、`a.root_cause`、`a.principles`、既有 `a.steps[]{no,observe,act,found}`、`a.lessons`
- 产出：无下游任务；验收产物为截图

- [ ] **步骤 1：实现组件与页面**（Nuxt 自动导入 components/，页面直接用 `<ProblemSection>` / `<RootCauseCard>`；不引 UI 库，scoped style 复用 assets/css/main.css 的 CSS 变量）

  1. `ProblemSection.vue`：props `problem`（对象）；渲染顺序：导语 intro → 现场（role、architecture）→ 症状证据（`type` 为 `log|error|code` 用等宽 `<pre>` 块样式，`text` 用普通段落）→ 时间线 timeline → 影响面 impactHint。单文件 <200 行。
  2. `RootCauseCard.vue`：props `rootCause: string`、`principles: string[]`；根因收束卡 + 「层契约」列表（数组为空不渲染列表）。
  3. `pages/solutions/[id].vue`：标题区（title + domain/layer chips + 作者/日期/贡献者）保持现状 → `v-if="a.problem"` 渲染 ProblemSection（段标题「问题」）→ 「解决方案」段 = 既有步骤流渲染（保留）+ `v-if="a.root_cause"` 渲染 RootCauseCard + 「带走的经验」lessons。**字段名注意：`a.problem.impactHint`（camel）、`a.root_cause`（snake）**。
  4. `pages/solutions/index.vue` 卡片：标题行下方加 `<p class="muted" ...>{{ a.problem?.intro }}</p>`（可空容错，`v-if="a.problem?.intro"`）。
  5. `web/.env.example`：`NUXT_PUBLIC_API_BASE=` 注释改为「必须含 `http(s)://` 前缀（如 `https://hdx.com`）；缺前缀 SSR 取数报 `Failed to parse URL`，页面显示『该层暂无内容』」。
  6. 部署文档排障条目：症状「该层暂无内容」+ 浏览器控制台/水合数据见 `Failed to parse URL` → 检查 `NUXT_PUBLIC_API_BASE` 前缀，改后 `docker compose up -d web`。

- [ ] **步骤 2：本地联调准备**

```bash
cd server && set -a && . ./.env.dev.local && set +a && .venv/bin/python seed.py   # 空库灌 131 案例+三段式文章
./dev.sh          # 起 API :8000（另开终端）
cd ../web && npm run dev   # 起 web :3000（另开终端）
```

- [ ] **步骤 3：截图验收两档尺寸**

浏览器分别以 393×852 与 1920 宽截图：`/solutions` 列表页（卡片有 intro 副标题）、任一详情页（三段式齐全：问题段含等宽症状块、根因卡、层契约）。逐张检查文本错位、样式叠加、横向溢出。

- [ ] **步骤 4：提交**

```bash
git add web/components/solutions web/pages/solutions web/.env.example server/部署与运维说明文档.md
git commit -m "feat(web): 文章详情三段式渲染（问题/解决方案组件化）+ API base 前缀防呆"
```

---

## 验收清单（对照规格 §9）

1. `tests/` 全量绿：`cd server && set -a && . ./.env.dev.local && set +a && .venv/bin/python -m pytest tests/ -q`。
2. 本地 `/solutions` 列表可见 131 篇、详情页三段式。
3. 存量降级路径：手动置 NULL 的行 API 返回 null/[] 且 web 不渲染空段。
