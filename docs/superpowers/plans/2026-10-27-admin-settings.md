# 管理端系统配置中心（settings）实施计划

> **给执行者：** 必须使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现本计划。步骤用复选框 `- [ ]` 追踪。

**目标：** 管理员在管理端「系统设置」页调整业务策略参数（游客门禁/AI 限流/AI 单价/短信频控/登录防爆破），改完即时生效，不发版不重启；顺带修复 `update_case_meta` 不同步 App 的漏洞。

**架构：** 读取机制放 `core/settings.py`（注册表驱动 + 全表缓存 + 写时失效；core/sms 不能依赖 features），`features/settings/` 只做 HTTP 壳（admin 读写 + 公开 app-config）。优先级链 DB > env > 内置默认。App 端独立 `GET /api/app-config` 拉取 client scope 配置。

**技术栈：** FastAPI + SQLite/MySQL（core/db.py `_translate`）、Vue3 + naive-ui（admin/）、uni-app x UTS/uvue（app/）。

**规格：** docs/superpowers/specs/2026-10-27-admin-settings-design.md（执行者两份都要读）

## 全局约束

- SQL 写 SQLite 方言（`?` 占位 / `datetime('now')` / `ON CONFLICT ... DO UPDATE`），MySQL 由 core/db.py `_translate` 翻译；db.py 的 SCHEMA 与 SCHEMA_MYSQL 两块都要加 settings 表。
- settings 主键列名用 `setting_key`（`key` 是 MySQL 保留字，meta 表教训）。
- core 模块禁止 import features；feature 之间只经公开接口互调。
- 测试命令：`cd server && .venv/bin/python -m pytest tests/ -q`（基线 61 passed）。
- 后端文件 >200 行考虑拆分；管理端遵循 features/<域>/{api,pages} 结构。
- 管理端操作鉴权一律 `require_admin`；`/api/app-config` 公开且绝不含 server scope 项与任何密钥。
- 敏感值（key/密码/连接串）不进 settings 表。

## 评审聚焦点

1. **配置读库失败**（表不存在/DB 抖动）：`core.settings.get` 必须退回 env/内置默认并告警，绝不让主流程（登录/短信/AI）因配置读取挂掉——任务 1 步骤覆盖。
2. **校验旁路**：PUT 传未知 key、负数、超大值、字符串塞 int 字段 → 400 带明细且一个都不落库——任务 1/2 测试覆盖。
3. **缓存陈旧**：update 后同进程 get 必须立即见新值；管理端保存后 `/api/app-config` 返回新值——任务 1/2 测试覆盖。
4. **app-config 泄漏面**：响应只含 client scope（guest_gate.*），AI 单价/频控等 server 项绝不出现——任务 2 测试覆盖。
5. **meta 修复的副作用**：update_case_meta 对不存在/草稿 case 的行为、version 虚增（只有真改才 bump）——任务 4 测试覆盖。

---

### 任务 1：settings 表 + core/settings.py 机制层

**文件：**
- 修改：`server/core/db.py`（SCHEMA 与 SCHEMA_MYSQL 各加 settings 表）
- 新建：`server/core/settings.py`
- 测试：新建 `server/tests/test_settings.py`

**接口（产出，后续任务依赖）：**
- `SettingDef`：dataclass，字段 `key: str, default: int|float|str, env: str, parse: Callable, min_v, max_v, scope: str, group: str, label: str, unit: str`（min_v/max_v 为 `float|None`）
- `REGISTRY: dict[str, SettingDef]`——10 项，key 与默认值逐字取规格 §4.2 表；`guest_gate.chapter_id` 的 `min_v=None, max_v=None`，parse 为 str；`scope` 仅 `guest_gate.*` 为 `"client"`，其余 `"server"`；group/label/unit 见规格 §4.2 与管理端分组（gate/ai/security）
- `get(key: str) -> int | float | str`：DB 行 > env > 内置默认；读库异常退回 env/默认并 `logger.warning`
- `client_config() -> dict`：仅 scope=="client"，形如 `{"guest_gate.chapter_id": "error-reading", "guest_gate.free_levels": 3}`
- `update_many(values: dict, operator: str) -> None`：逐项校验（未知 key / 越界 / parse 失败 → `ValueError("非法配置: key=原因; ...")`），全过才写库 + 失效缓存
- `source_of(key: str) -> str`：返回 `"db" | "env" | "default"`（管理端展示用）

- [ ] **步骤 1：写失败测试** `server/tests/test_settings.py`（conftest 自动隔离临时库；直接 import `core.settings`，不起 HTTP）：

```python
def test_priority_chain_env_and_default(monkeypatch): ...  # 无 DB 行：monkeypatch env DEEPSEEK_PRICE_IN=9.9 → get==9.9；清 env → get==2（内置默认）
def test_db_overrides_env(): ...        # update_many({"ai.price_in": 5}, "t") 后 get==5，source_of=="db"
def test_update_invalidates_cache(): ...# update_many 改 ai.rate_limit=3 → get 立即 3
def test_update_many_rejects_unknown_and_out_of_range(): ...  # 未知 key、free_levels=-1、rate_limit=0、price_in="abc" → ValueError 且消息含 key；DB 中无任何行
def test_client_config_only_client_scope(): ...  # 只含 guest_gate.* 两键，不含 ai.price_in
def test_get_survives_db_error(monkeypatch): ... # 让 db.q 抛异常 → get 返回默认，不抛
```

- [ ] **步骤 2：跑测试确认失败**：`cd server && .venv/bin/python -m pytest tests/test_settings.py -q`——预期 ImportError/失败。

- [ ] **步骤 3：实现**——db.py 两方言块加表（列：setting_key/value/updated_at/updated_by，类型对照 SCHEMA_MYSQL 既有风格）；core/settings.py 按上述接口实现，模块级 `_cache: dict | None`，`update_many` 内 `db.tx()` 多行同事务写（参照 publish_case 用法）。

- [ ] **步骤 4：跑测试确认通过**：`cd server && .venv/bin/python -m pytest tests/test_settings.py -q`——预期全绿。

- [ ] **步骤 5：提交** `git add server/core/db.py server/core/settings.py server/tests/test_settings.py && git commit -m "feat: settings 表与 core.settings 读取机制（DB>env>默认）"`

### 任务 2：settings HTTP 层 + /api/app-config

**文件：**
- 新建：`server/features/settings/__init__.py`、`models.py`、`router.py`
- 修改：`server/main.py`（include settings_router）
- 测试：`server/tests/test_settings.py`（追加）

**接口（消费/产出）：**
- 消费：任务 1 的 `REGISTRY / get / update_many / client_config / source_of`
- 产出端点：`GET /api/admin/settings`（require_admin）→ `{"items": [{key, value, source, group, label, unit, min, max}]}`；`PUT /api/admin/settings`（require_admin，body `{"values": {...}}`）→ 200 `{"ok": true}` 或 400 `{"detail": "<ValueError 文案>"}`；`GET /api/app-config`（公开）→ `client_config()` 结果

- [ ] **步骤 1：追加失败测试**（用 `make_client()` + `login_admin()`，参照 test_users.py 风格）：

```python
def test_admin_settings_roundtrip(): ...   # admin GET 200 含 10 项；PUT {"values":{"ai.rate_limit":7}} 后 GET value==7 且 source=="db"
def test_admin_settings_requires_admin(): ...  # 未登录 GET → 401；普通用户 → 403（注册+登录走 /api/auth/sms/send dev 回显或参照 test_users.py 现有做法）
def test_put_invalid_returns_400(): ...    # values 含未知 key → 400，DB 无变更
def test_app_config_public_and_scoped(): ...  # 匿名 GET 200；JSON 只含 guest_gate.*；先 PUT 改 free_levels=5 → 响应含 5
```

- [ ] **步骤 2：跑测试确认失败**：`pytest tests/test_settings.py -q`——预期 404（路由不存在）。

- [ ] **步骤 3：实现**：models.py 定义 `SettingsUpdateBody(values: dict[str, int | float | str])`（Pydantic）；router.py 两个 admin 端点用 `require_admin`（参照 features/users/router.py），PUT 捕获 ValueError → `HTTPException(400, str(e))`；app-config 端点无鉴权；main.py 挂载（参照 ops_router 位置）。

- [ ] **步骤 4：跑测试确认通过**：`pytest tests/test_settings.py -q` 全绿。

- [ ] **步骤 5：提交** `git commit -m "feat: settings 管理端点与公开 /api/app-config"`

### 任务 3：五组参数接入点改造

**文件：**
- 修改：`server/features/ai/service.py:24-26`（_RATE_LIMIT/_RATE_WINDOW → 每次调用读 settings）、`server/features/ai/usage.py:39-42`（estimate_cost 读 ai.price_in/out）、`server/core/sms.py:12-13`（常量改函数 `code_ttl_sec()`/`resend_interval_sec()`）、`server/features/auth/service.py:24-26,148-151`（防爆破阈值 + sms 两处调用方）
- 修改：`server/core/config.py`（相关 env 常量注释改为「仅作 settings 的部署默认值」）
- 测试：`server/tests/test_settings.py`（追加）、既有 test_ai/test_auth/test_auth_phone 回归

**接口：** 消费任务 1 `get()`；无新增产出。

- [ ] **步骤 1：追加失败测试**：

```python
def test_sms_ttl_from_settings(): ...      # update_many({"sms.code_ttl_sec": 120}) → core.settings.get 断言 120；sms_core.code_ttl_sec()==120
def test_login_lockout_reads_settings(): ...  # update_many({"login.max_failures": 2, "login.lock_seconds": 60}) → 连错 2 次后 verify_password 返回锁定拒绝（沿用 test_auth.py 现有频控测试的调用方式）
def test_ai_price_from_settings(): ...     # update_many({"ai.price_in": 4, "ai.price_out": 12}) → estimate_cost(1_000_000, 1_000_000)==16.0
```

- [ ] **步骤 2：跑确认失败**（sms/auth/price 仍读旧常量 → 断言失败）。

- [ ] **步骤 3：实现**：ai/service.py `_rate_ok` 内改读 `settings.get("ai.rate_limit")/get("ai.rate_window_sec")`（删模块级常量）；usage.py `estimate_cost` 改读 settings；sms.py 常量替换为两个函数（保留 docstring 说明来源是 settings）；auth/service.py `LOGIN_MAX_FAILURES/LOGIN_LOCK_SECONDS` 引用点与 `sms_core.CODE_TTL_SECONDS/RESEND_INTERVAL_SECONDS` 引用点改调函数/get。config.py 中 DEEPSEEK_PRICE_IN/OUT、LOGIN_MAX_FAILURES/LOGIN_LOCK_SECONDS 保留作为 env 层默认（core/settings.py 的 REGISTRY env 字段已引用）。

- [ ] **步骤 4：全量回归**：`pytest tests/ -q`——预期 61+新增全绿。

- [ ] **步骤 5：提交** `git commit -m "refactor: 限流/单价/短信/防爆破参数改经 settings 即时可调"`

### 任务 4：update_case_meta 版本修复

**文件：**
- 修改：`server/features/cases/service.py:28-46`（update_case_meta）
- 测试：`server/tests/test_cases.py`（追加）

**接口：** 消费 `db.tx()` + meta 取号模式（文件内 publish_case 已有样例）；无新增产出。

- [ ] **步骤 1：追加失败测试**（用 load_seed fixture 发布一关，参照 test_cases.py 现有流程）：

```python
def test_update_meta_bumps_casepack_version(): ...  # 记 since=当前 version → PATCH meta（改 order）→ 返回后 db.current_version()>since；GET /api/casepack?since=since 的 cases 含该 case 且 payload 含新 order
def test_update_meta_unknown_case_404(): ...        # 不存在的 cid → 404，且 casepack_version 不变（不虚增）
```

- [ ] **步骤 2：跑确认失败**：第一条断言失败（version 不变）。

- [ ] **步骤 3：实现**：update_case_meta 有实际字段变更时（至少一个字段非 None）走 `db.tx()`：meta 取号 +1 → `UPDATE cases SET payload=?, version=? WHERE id=?`。字段全为 None 时不动版本（维持现状语义）。

- [ ] **步骤 4：跑确认通过** + 全量回归 `pytest tests/ -q`。

- [ ] **步骤 5：提交** `git commit -m "fix: update_case_meta bump casepack 版本，章归属/排序变更可同步 App"`

### 任务 5：管理端「系统设置」页

**文件：**
- 新建：`admin/src/features/settings/api/settings.ts`、`admin/src/features/settings/pages/SettingsPage.vue`
- 修改：`admin/src/router/index.ts`（加 `/settings` 路由，meta.title「系统设置」）、`admin/src/components/AdminLayout.vue`（NAV 加项 `{ to: '/settings', icon: '⚙️', label: '系统设置', adminOnly: true }`，插在「服务健康」后）
- 测试：无（前端手工验收 + 构建）

**接口：** 消费任务 2 端点；api 类型 `SettingItem { key, value, source, group, label, unit, min, max }`。

- [ ] **步骤 1：api 模块**：`fetchSettings(): Promise<{items: SettingItem[]}>`、`saveSettings(values: Record<string, number|string>): Promise<void>`——写法照抄 features/users/api/users.ts 的 request 封装。
- [ ] **步骤 2：SettingsPage.vue**：按 group 分三张卡片（gate=运营门禁 / ai=AI / security=安全频控）；每项 NInputNumber（chapter_id 用 NSelect，选项为学徒篇章 id 列表）+ label + unit 说明 + source 标签（db=已自定义 / env / default）；底部保存按钮整组 PUT，成功 `message.success` 后重拉。组件 >200 行则拆 `features/settings/components/SettingGroupCard.vue`。
- [ ] **步骤 3：路由与导航**接入（adminOnly 项仅 admin 可见——NAV 过滤逻辑 AdminLayout.vue:21 已有）。
- [ ] **步骤 4：构建验证**：`cd admin && npm run build`（产物挂 server /admin 已有机制）；起服务后浏览器走查：非 admin 不见导航项、admin 可改 free_levels 保存后 GET 生效。
- [ ] **步骤 5：提交** `git commit -m "feat: 管理端系统设置页（游客门禁/AI/安全频控三组）"`

### 任务 6：App 端 app-config 拉取与游客门禁配置化

**文件：**
- 新建：`app/utils/app-config.uvue`
- 修改：`app/pages/index/index.uvue`（onShow 数据装配处并行拉取）、`app/data/chapters.ts:82-87,123,149,170`、`app/utils/login-guide.ts:2,7,10`
- 测试：无自动化（App 端无测试设施），手工验收

**接口：**
- 产出：`fetchAppConfig(cb: (ok: boolean) => void)`、`getGuestFreeChapter(): string`（默认 'error-reading'）、`getGuestFreeLevels(): number`（默认 3）——UTS 语法，参照 app/utils/sync.ts 的 uni.request + storage 模式
- 存储 key：`think_app_config_v1`

- [ ] **步骤 1：app-config 模块**：GET `${API_BASE}/api/app-config`（timeout 8000）；成功且数据为 object 才落 storage，失败静默（cb(false)）；getter 从 storage 读单键，缺失走内置默认（兜底即规格 §4.2 默认值）。
- [ ] **步骤 2：index.uvue 接入**：onShow 装配处与 fetchCasepack 并行调用 `fetchAppConfig`（不阻塞渲染）。
- [ ] **步骤 3：chapters.ts / login-guide.ts 改造**：`GUEST_FREE_CHAPTER/GUEST_FREE_LEVELS` 常量改为调 getter（chapters.ts 内 `inGuestFreeScope/isChapterUnlocked/isCasePlayable/chapterUnlockHint` 与 login-guide 文案统一走 getter）；导出名保留，调用方改动最小化。
- [ ] **步骤 4：手工验收**：HBuilderX 运行到 H5（393x852）：游客态默认仍锁「读懂报错」前 3 关；管理端把 free_levels 改 5 → App 重进首页后第 4 关可玩、引导文案显示「前 5 关」；接口断网时回退 3 关。
- [ ] **步骤 5：提交** `git commit -m "feat: 游客门禁改服务端配置下发（app-config），内置值兜底"`

### 任务 7：全量验证与收尾

- [ ] **步骤 1：后端全量** `cd server && .venv/bin/python -m pytest tests/ -q`——全绿。
- [ ] **步骤 2：admin 构建** `cd admin && npm run build`——无错误。
- [ ] **步骤 3：手工联调**（dev.sh 起服务）：管理端改 3 组参数 → 立即生效（AI 对话频次、AI 看板单价、短信重发间隔）；app-config 匿名 curl 返回仅 guest_gate 两键。
- [ ] **步骤 4：文档**：`server/部署与运维说明文档.md` 环境变量表为 DEEPSEEK_PRICE_IN/OUT、LOGIN_* 两行加「运行时可在管理端系统设置页调整」注记。
- [ ] **步骤 5：提交** `git commit -m "docs: 部署文档补 settings 运行时调整说明"`
