# 管理端系统配置中心（settings）设计规格

> 日期：2026-10-27 · 状态：已确认实施（方向经用户批准；三个决策点未获回复，按推荐方案执行）
> 关联分析：本会话「管理端薄弱项分析」——P1 = settings 表 + 系统设置页 + 游客门禁下发 + update_case_meta 修复

## 1. 目标与成功标准

运营/管理员在管理端「系统设置」页调整业务策略参数，**改完即时生效，不发版、不重启**。

成功标准：
1. 游客门禁（免费章 / 免费关数）改为服务端下发，App 端按配置生效，内置值仅作兜底。
2. AI 对话限流、AI 成本单价、短信验证码 TTL/重发间隔、登录防爆破阈值——五组参数全部可在管理端改并即时生效。
3. `update_case_meta` 的变更（章归属/排序/typeTags）能经 casepack 增量同步到达 App。
4. dev 与 prod 同一实现（工程约束「环境一致性」），只是 DB 里的值不同。

## 2. 决策记录

| 决策点 | 结论 | 理由 |
|---|---|---|
| App 配置下发通道 | **独立 `GET /api/app-config`**（公开只读） | 配置新鲜度与 casepack 内容版本解耦；web 端将来可复用 |
| 优先级链 | **DB settings > env > 内置默认** | 链路显式单一（priority-clash 教训）；env 保留为部署默认值，不破坏现有部署 |
| 游客门禁强度 | **本期客户端门禁** | 只做配置驱动的软门禁；服务端匿名 casepack 过滤留待后续（sync 语义变更，工作量大） |
| 机制归属 | **读取机制放 `core/settings.py`** | core/sms.py 不能 import features（core→feature 禁止）；core 内部互读合法。features/settings 只做 HTTP 壳 |

## 3. 范围

**纳入（P1）**：游客门禁、AI 对话限流（次数/窗口）、AI 成本单价（入/出）、短信 TTL/重发间隔、登录防爆破（次数/锁定秒）、update_case_meta 版本修复、管理端设置页、App 端 app-config 拉取。

**明确不做（本期）**：SYSTEM_PROMPT 配置化、ops 快照参数、公告/维护模式、服务端匿名过滤、admin_audit 审计表（P2）、web 端接入。

## 4. 后端设计

### 4.1 数据表（core/db.py 两个方言块各加一份）

```sql
-- SQLite 方言块
CREATE TABLE IF NOT EXISTS settings (
  setting_key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
-- MySQL 方言块
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(64)
);
```

列名用 `setting_key`——吸取 meta 表 `key` 是 MySQL 保留字的教训。轻迁移：`CREATE TABLE IF NOT EXISTS` 即可，无历史数据。

### 4.2 core/settings.py（机制层）

注册表驱动，每项声明：

```python
SettingDef(key, default, env, parse, min, max, scope, group, label, unit)
```

| key | 类型/范围 | env | scope | 默认 |
|---|---|---|---|---|
| guest_gate.chapter_id | str ∈ CHAPTERS 合法 id | — | client | "error-reading" |
| guest_gate.free_levels | int 0~50 | — | client | 3 |
| ai.rate_limit | int 1~1000 | — | server | 10 |
| ai.rate_window_sec | int 10~3600 | — | server | 60 |
| ai.price_in | float ≥0 | DEEPSEEK_PRICE_IN | server | 2 |
| ai.price_out | float ≥0 | DEEPSEEK_PRICE_OUT | server | 8 |
| sms.code_ttl_sec | int 60~3600 | — | server | 600 |
| sms.resend_interval_sec | int 10~600 | — | server | 60 |
| login.max_failures | int 1~100 | LOGIN_MAX_FAILURES | server | 5 |
| login.lock_seconds | int 30~86400 | LOGIN_LOCK_SECONDS | server | 300 |

API（core/settings.py 公开面）：
- `get(key) -> 值`（已解析类型）：DB 行 > env 默认 > 内置默认；lazy 全表缓存（单进程前提，同 ops/metrics.py）。
- `client_config() -> dict`：仅 scope=client 的项，供 app-config 端点。
- `update_many(values: dict, operator: str)`：逐项按注册表校验（未知 key / 越界 → ValueError 列明细），全过才写库（参数化 SQL）并失效缓存。

依赖方向：core/settings → core/{config,db}，单向无环；core/sms、features/ai、features/auth 改为读 `core.settings.get(...)`。

### 4.3 features/settings/（HTTP 壳）

- `models.py`：`SettingsUpdateBody(values: dict[str, int | float | str])`
- `router.py`：
  - `GET /api/admin/settings`（require_admin）→ 全量：key、当前生效值、来源（db/env/default）、范围、分组、label
  - `PUT /api/admin/settings`（require_admin）→ `update_many`；校验失败 400
  - `GET /api/app-config`（公开，无鉴权）→ `client_config()`，绝不含密钥类/server scope 项

### 4.4 接入点改造

1. `features/ai/service.py`：`_rate_ok` 读 `ai.rate_limit / ai.rate_window_sec`（每次调用现读，有缓存无开销）。
2. `features/ai/usage.py`：`estimate_cost` 读 `ai.price_in / ai.price_out`。
3. `core/sms.py`：`CODE_TTL_SECONDS / RESEND_INTERVAL_SECONDS` 改为函数 `code_ttl_sec() / resend_interval_sec()`，调用方（features/auth/service.py:148-151）同步改。
4. `features/auth/service.py`：防爆破读 `login.max_failures / login.lock_seconds`。
5. `core/config.py`：相关 env 常量保留（作 DB 缺省时的 env 层默认），注释改为「仅作 settings 的部署默认值，运行时调整走管理端」。

### 4.5 update_case_meta 修复（features/cases/service.py）

现状：UPDATE payload 不 bump version → App 永远拉不到 meta 变更。修复：与 publish_case 同构——`next_version()` 取号，`UPDATE cases SET payload=?, version=? WHERE id=?`。meta 变更即可进 casepack 增量流（不改 status/published_at）。

## 5. 管理端前端（admin/）

- `features/settings/api/settings.ts`：`fetchSettings()` / `saveSettings(values)`。
- `features/settings/pages/SettingsPage.vue`：三组卡片（运营门禁 / AI / 安全频控），NInputNumber + 单位说明 + 保存按钮（整组 PUT，成功后重拉）；沿用现有 naive-ui + main.css 风格；>200 行则拆 `SettingGroupCard.vue` 子组件。
- `router/index.ts` 加 `/settings`（meta.title 系统设置）；`AdminLayout.vue` 的 NAV 加项 `adminOnly: true`。

## 6. App 端（uni-app x，UTS/uvue）

- `app/utils/app-config.uvue`（新）：拉 `GET /api/app-config`，落 uni storage（`think_app_config_v1`）；getter 全部带内置默认兜底，接口失败不影响启动。
- `app/pages/index/index.uvue`：onShow 数据装配处与 `fetchCasepack` 并行调用。
- `app/data/chapters.ts`：`GUEST_FREE_CHAPTER / GUEST_FREE_LEVELS` 改为从 app-config 读取（兜底仍为 'error-reading' / 3）；`login-guide.ts` 引用同步更新。

## 7. 错误处理与日志

- 写配置：全量校验通过才落库；非法值 400 返回 `{detail: [{key, reason}]}`；不暴露内部细节。
- 读配置：DB 读失败退回 env/内置默认并 `logger.warning`——配置读取绝不阻断主流程。
- app-config 端点无敏感项（注册表白名单保证）。

## 8. 测试（TDD，先行）

`server/tests/test_settings.py`：
1. 无 DB 行时取 env 默认 / 无 env 取内置默认（优先级链）。
2. `update_many` 后 `get` 立即生效（缓存失效）。
3. 未知 key / 越界值 → ValueError 带明细；合法值落库且 `updated_by` 记录。
4. `/api/admin/settings` 非 admin 403；admin 可读写。
5. `/api/app-config` 匿名可访问、只含 client scope、不含 server 项。
6. `update_case_meta` 后该 case version 增长，且 `/api/casepack?since=旧版本` 能拉到它（并入 test_cases.py）。
7. AI 限流阈值经 settings 生效（单测 `get` + 现有 test_ai 回归）。
