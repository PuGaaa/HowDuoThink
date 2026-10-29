# 工程规范化体系 · 设计规格

> 日期：2026-10-30 · 状态：待审阅
> 来源：2026-10-28 后端全量隐患审查（4 域审查代理 + core/部署层人工复核）及其修复批次
> 的实践复盘。本规格把"评审能修 bug"升级为"制度让 bug 不再依赖人的自觉被抓"。

## 1. 背景与现状

后端已有较高工程纪律：feature 分层严格、SQL 全参数化且方言集中翻译、108 个测试全绿、
部署文档完整。但当前质量**依赖人的自觉**，缺制度化护栏：

| 缺口 | 现状证据 | 后果 |
|---|---|---|
| 无 CI | 仓库无 `.github/` | 测试全绿是一次性事件，不是持续保证 |
| 依赖无锁定 | `requirements.txt` 只有下限 | 构建不可复现，违反"环境只允许配置不同"红线 |
| 版本漂移 | dev venv=Python 3.13，生产镜像=3.12 | 行为分叉的温床 |
| schema 三处真相源 | `SCHEMA` / `SCHEMA_MYSQL` / `db.init()` 内联轻迁移 | 变更靠人记三处，无迁移历史、不可重放 |
| 无备份 | 部署文档无备份章节，`mysql-data` 卷单点 | midnight-rollback 案例的现实复刻条件 |
| 流程靠记忆 | 评审→TDD→台账的流程只活在会话里 | 下个功能未必再走一遍 |

## 2. 目标 / 非目标

**目标**：把项目推进到"单人开发也按公司纪律运行"的形态——质量由门禁强制、
变更有历史可追溯、部署可复现、演进到多人时制度不需要推倒重来。

**非目标（明确不做）**：
- 不引入 Prometheus/Grafana 全套可观测平台、monorepo 工具链等重基础设施
- 不改任何业务功能、不动 API 行为
- 不为"看起来专业"引入当前用不上的流程（YAGNI）：CODEOWNERS、多环境审批流等
  只出现在演进位表里，不落地

## 3. 已定决策

| 议题 | 决策 | 理由与取舍 |
|---|---|---|
| 目标形态 | 单人打底 + 演进位 | 现状是单人+AI 协作；自动化门禁为纲，每个制度标注多人时的升级路径 |
| 数据库迁移 | **Alembic**（同伴拍板，推翻"自研轻量"建议） | 行业标准、生态成熟；与方言翻译体系的张力用 §5.1 的"单 revision 双引擎分支"方案化解 |
| CI 覆盖 | **全仓一起挡**（同伴拍板） | server + admin + web 全部作为合并门禁；代价是前端类型检查存量必须先清零（§4.4） |

落地后建议立 ADR：`docs/decisions/007-工程规范与质量门禁.md`，沿用既有编号约定。

## 4. 梯队一 · 工程护栏

### 4.1 CI 流水线（`.github/workflows/ci.yml`）

触发：push 到 main + 全部 PR。四个 job 全部必过才可合并：

| job | 内容 | 要点 |
|---|---|---|
| `server` | Python **3.12**（对齐生产镜像）→ `pip install -r requirements.lock` → `ruff check` + `ruff format --check` → `pytest -q` | 版本锁定见 §4.2；lint 规则先跑清零再设门禁 |
| `security` | `gitleaks`（全历史密钥扫描）+ `pip-audit -r requirements.lock` | 豁免必须显式 ignore 并注明理由与复审日期 |
| `admin` | Node 20 → `npm ci` → `npm run build` | build 已含 `vue-tsc --noEmit`，类型检查即门禁 |
| `web` | Node 20 → `npm ci` → `npx nuxi typecheck` → `npm run build` | Nuxt build 默认不做类型检查，需显式跑 typecheck |

pip / npm 走 Actions 缓存。演进位：加 MySQL 8 service container 让 `DB_PROVIDER=mysql`
的 pytest 轮进 CI（conftest 已支持）；加前端 job 产物上传。

### 4.2 依赖锁定与版本统一

- `requirements.txt` 改造为 `requirements.in`（只留直接依赖与下限），`pip-compile` 生成
  `requirements.lock`（含传递依赖）；CI 与 Dockerfile 一律从 lock 安装。
- 升级流程：改 `.in` → `pip-compile` → lock 文件进 PR 评审。
- Python 统一 3.12：生产镜像已对；dev venv 按 3.12 重建（`dev.sh` 加版本检查，不符即报错）；
  CI 固定 3.12。演进位：多版本矩阵。

### 4.3 分支保护与流程固化

- main 分支保护：禁直推 + require status checks（上面四个 job）。单人也要开——
  门禁防的是手滑，不是他人。演进位：require 1 人 PR review。
- `docs/研发流程.md`（新建）：分支命名与 conventional commits（已在用，成文）、
  DoD（功能 = 代码 + 测试 + 文档 + 配置项注册 + 审计点）、评审流程
  （当前 = 独立评审子代理 + 自审清单；演进位 = 人工 reviewer）、
  发布流程（镜像 tag = git tag、CHANGELOG、回滚预案）。
- `.github/PULL_REQUEST_TEMPLATE.md`：改了什么/为什么、**测试证据（贴命令与输出）**、
  风险与回滚、检查清单。
- ADR 沿用 `docs/decisions/` 编号约定。

### 4.4 落地前置：存量清零

门禁先清零再上锁，否则第一次 CI 就红，制度失去公信力：
1. server 引入 ruff → 自动修复 + 人工清零 → 提交"清零提交"→ 再设 CI 门禁
2. admin/web 跑 typecheck → 清零当前分支 WIP 的类型错误（工作量最大的一项）
3. 灰度条款：若 web 类型错误存量过大，允许 web job 以非阻塞模式运行一周观察，
   **最终态必须是硬门禁**，灰度期在 PR 标注并限期

## 5. 梯队二 · 数据与运维规范化

### 5.1 Alembic 迁移体系（本梯队核心）

**张力**：Alembic 的 `op.*` 直接产出引擎原生 DDL，绕开 `core/db.py` 的方言翻译层
（该层只服务运行时 DML）。**化解方案：单 revision 双引擎分支**——

- 目录：`server/alembic/{env.py, versions/}` + `alembic.ini`。
- `env.py` 按 `config.DB_PROVIDER` 路由：sqlite → `./data.db`；mysql → `MYSQL_*` 五项。
  不使用 autogenerate 跨引擎产出（它对翻译层没有价值，只会生成需要人工校对的草稿）。
- **每个 revision 内**按 `op.get_bind().dialect.name` 写 SQLite 与 MySQL 8 两套精确 DDL：
  schema 变更记录仍是**单一文件单一真相源**，两引擎各自的类型差异
  （TEXT vs MEDIUMTEXT、AUTOINCREMENT vs AUTO_INCREMENT、partial index 语法）显式可读。
- `downgrade()` 必须实现（基线可为空操作）；迁移 PR 的测试证据必须含
  "空库 upgrade → downgrade → upgrade 双引擎重放"输出。
- **职责移交**：
  - `db.init()` 退役建表与内联轻迁移（保留连接职责）；`SCHEMA` / `SCHEMA_MYSQL`
    两份大字符串删除——schema 真相源收敛为 Alembic versions。
  - `dev.sh`、`conftest.py`、docker-compose api 启动命令统一改为先 `alembic upgrade head`。
- **存量库衔接**：现网库执行 `alembic stamp head` 标基线，之后正常走增量。
- 启动 fail-fast 顺带做：`alembic current` 必须等于 head，不一致拒绝启动并给明确日志。

### 5.2 备份与恢复

- compose 增加备份侧车（mysqldump --single-transaction 每日 → 备份卷/对象存储，保留 ≥7 天）
  或宿主 cron，二选一在实施计划里定。
- `docs/备份与恢复.md`：恢复步骤 + 演练记录表；**首次真实演练（恢复到新实例 + smoke test）
  是本节验收**，不做演练不算完成——案例库里 midnight-rollback 的教训就是"没演练过的备份等于没有"。

### 5.3 启动 fail-fast

生产启动即校验并拒绝带病运行：JWT_SECRET 未显式配置（现用进程内随机）、
SMS_PROVIDER 处于 dev 回显通道且 ENV≠dev、MySQL 连不通、schema 版本落后。
每一项都可被这次审查的高危问题追溯到出处。

## 6. 梯队三 · 接口契约与安全债

- **出参 `response_model` 全覆盖**：审查确认裸 dict 出参是全库通病。分三批：
  auth/users → cases/submissions → ai/stats/ops/assets。OpenAPI 文档随 CI 产出，
  作为前后端协作契约。
- **settings 变更审计**：追加式 `settings_history` 表（谁/何时/旧值/新值），管理端展示。
- **JWT 吊销**：token 加 `iat`，users 行记 `invalid_before`（改密/封禁时更新）。
- **IP 维度频控**：复用 `_throttle_*` 滑动窗口模式，登录/发码增加按 IP 键（防撞库横向遍历与短信轰炸）。
- **SVG 上传策略**：默认禁用开关 + 允许时强制 `Content-Disposition: attachment` + 部署文档
  禁止 `assets.cdn_base` 指向主站注册域。
- 顺带清审查小项：RSS 峰值口径、`OPS_SNAPSHOT_INTERVAL` 下限校验。

## 7. 梯队四 · 产品决策项（待立 ADR，不在本规格设计）

casepack 公开下发完整答案（审查高危 4）。三个选项供拍板：
a) 维持现状，文档显式承认取舍；b) 答案载荷拆分 + 服务端判分（改 App 判分流程，工作量大）；
c) 下发加设备级只读凭证。规格只负责把决策推进到 ADR，不预设答案。

## 8. 验收标准

| 批次 | 判据（全部"验证过"，不是"配置了"） |
|---|---|
| 护栏 | 四个 job 在 PR 上真实运行；**故意推坏提交（红测试/假密钥/类型错误）验证门禁拦截**；删 venv 重建后 CI 全绿；Docker 镜像内依赖版本与 lock 一致 |
| 数据层 | 空库 `upgrade head` 双引擎通过；存量库 stamp 后行为不变（108 测试保护）；一次 downgrade 重放；**真实恢复演练完成并记录** |
| 契约/安全 | 全部端点出参有 response_model 且文档随 CI 更新；改密后旧 token 立即失效（有测试）；换 IP 撞库被限频（有测试） |
| 产品项 | casepack 决策 ADR 落档 `docs/decisions/` |

## 9. 演进位（单人 → 多人升级路径）

| 制度 | 单人形态 | 多人时升级为 |
|---|---|---|
| 分支保护 | CI 必绿 + 禁直推 | + require PR review、CODEOWNERS |
| 评审 | 独立评审子代理 + 自审清单 | 人工 reviewer + 评审记录留档 |
| 迁移验证 | CI 双引擎重放 | + 预发库演练、DBA 复核 |
| 发布 | 手工 tag + 回滚预案 | 环境审批流 + 变更窗口 |

## 10. 实施批次与风险

批次顺序（每批次一份实施计划，走 `writing-plans` 流程）：
**护栏（含存量清零）→ 数据层 → 契约/安全债 → 产品决策**。护栏先行：
其余批次都需要在 CI 保护下进行。

| 风险 | 缓解 |
|---|---|
| 前端类型错误存量未知，可能拖延全仓门禁 | §4.4 灰度条款：非阻塞一周，限期转硬 |
| Alembic 改动面广（conftest/dev.sh/compose/部署文档） | 以"stamp 后行为不变"为验收锚点，108 个测试护回归；双引擎重放进 CI |
| pip-audit 扫出暂不能修的漏洞 | 显式 ignore + 注明理由与复审日期，不允许静默 |
| 制度建立后的执行衰减（独最大的风险） | 门禁本身是机器执行的，不依赖坚持；每季度按本规格 §8 复核一次 |
