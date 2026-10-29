# 工程护栏批次 · 实施计划

> **给执行者：** 必须使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现本计划。步骤用复选框 `- [ ]` 追踪。

**目标：** 落地规格梯队一——CI 全仓门禁 + 依赖锁定 + ruff 门禁 + 分支保护 + 流程固化，把"测试全绿"从一次性事件变成每次合并的机器强制。

**架构：** 四个 GitHub Actions job（server/security/admin/web）作为合并门禁；依赖经 pip-tools 锁定，dev/CI/镜像三处统一 Python 3.12 与 lock 安装；ruff 双命令（check + format --check）先清零后上锁；本批次不改任何业务代码行为。

**技术栈：** GitHub Actions、pip-tools、ruff、gitleaks、pip-audit、vue-tsc/nuxi typecheck。

**规格：** `docs/superpowers/specs/2026-10-30-engineering-standardization-design.md`（执行者必须连规格一起读；本计划实现其 §4，并预留 §4.4 灰度条款）。

## 全局约束

- Python 统一 **3.12**（dev venv / CI / 生产镜像三处一致）；CI 固定 3.12。
- 依赖一律从 **requirements.lock** 安装；升级只走 `.in` → `pip-compile` → lock 进 PR。
- CI 四个 job 名固定为 `server` / `security` / `admin` / `web`，全部必过才可合并；**灰度仅限 web job** 且限期一周，admin 无灰度。
- gitleaks / pip-audit 的任何豁免必须显式 ignore 并注明理由与复审日期，不允许静默。
- 本批次**不得改动业务行为**：`pytest -q` 全绿且用例数不得减少（基线 108 passed）；业务代码改动仅限格式化与 import 排序。
- 提交信息遵循 conventional commits（仓库既有习惯）。
- ADR 沿用 `docs/decisions/NNN-主题.md` 编号约定。

## 评审聚焦点

1. **lock 引入后的运行时漂移**——传递依赖版本变化破坏行为：任务 1 全套 pytest 验证；此后每次 CI server job 重跑。
2. **ruff format 机械提交改坏代码**——格式化不得触碰逻辑：任务 2 在 format 后立即跑全套 pytest，且 format 提交里禁止出现非格式 diff（执行者自查 `git diff` 只含空白/引号/换行）。
3. **分支保护的 required check 名与 job 名不一致**——名字对不上则保护形同虚设或永远卡黄：任务 6 的校验名单必须逐字等于任务 4 的四个 job 名。
4. **web 类型错误存量不可控**——按规格 §4.4 触发灰度而非硬扛：任务 3 写明决策规则（>30 个错误或预估超 1 天 → `continue-on-error` + 限期一周注释 + TODO 跟踪）。
5. **门禁"配置了但没验证过拦截"**——最危险的假完成：任务 7 用真实坏提交（假密钥 + 必败测试）验证拦截，两种拦截（GitHub 推送保护直接拒推 / CI 红）都算证据，必须留存输出。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `server/requirements.in` / `server/requirements-dev.in` | 新建 | 直接依赖声明（runtime / dev） |
| `server/requirements.lock` / `server/requirements-dev.lock` | 生成 | 锁定真相源（Docker 用 runtime；CI/dev 用 dev） |
| `server/requirements.txt` | 删除 | 被 .in/.lock 取代 |
| `server/Dockerfile` | 修改 | 改装 runtime lock |
| `server/dev.sh` | 修改 | 启动前校验 venv 为 Python 3.12 |
| `server/ruff.toml` | 新建 | lint/format 规则 |
| `admin/package.json` / `web/package.json` | 修改 | web 增加 typecheck script 与 devDeps |
| `.github/workflows/ci.yml` | 新建 | 四 job 门禁 |
| `.github/PULL_REQUEST_TEMPLATE.md` | 新建 | PR 模板（含测试证据栏） |
| `docs/研发流程.md` | 新建 | 分支/提交/DoD/评审/发布流程 + 分支保护附录 |
| `docs/decisions/007-工程规范与质量门禁.md` | 新建 | 本批次决策的 ADR |

---

### 任务 1：依赖锁定与 Python 版本统一

**文件：** 新建 `server/requirements.in`、`server/requirements-dev.in`，生成两个 `.lock`；删除 `server/requirements.txt`；修改 `server/Dockerfile`、`server/dev.sh`。

**接口：** 产出 `server/requirements.lock`（runtime，Dockerfile 与任务 4 的 pip-audit 消费）与 `server/requirements-dev.lock`（dev+runtime，任务 4 的 server job 与本地 venv 消费）。

- [ ] **步骤 1：重建 venv 到 3.12 并安装 pip-tools**

运行：`command -v python3.12 || brew install python@3.12`，然后
`cd server && rm -rf .venv && python3.12 -m venv .venv && .venv/bin/pip install pip-tools`
预期：`.venv/bin/python --version` 输出 `Python 3.12.x`

- [ ] **步骤 2：写依赖声明**

`requirements.in` 内容 = 现 `requirements.txt` 全部 13 行逐字（fastapi>=0.110 … sentry-sdk[fastapi]>=2.0），文件头注释注明"只留直接依赖；锁文件经 pip-compile 生成"。`requirements-dev.in` 内容：

```
-r requirements.in
pytest>=8.0
ruff>=0.6
pip-tools>=7.4
```

- [ ] **步骤 3：生成锁文件**

运行：`cd server && .venv/bin/pip-compile requirements.in -o requirements.lock && .venv/bin/pip-compile requirements-dev.in -o requirements-dev.lock`（不加 --generate-hashes：可读性优先，漏洞由 pip-audit 兜）
预期：两个 lock 生成且含传递依赖固定版本

- [ ] **步骤 4：Dockerfile 与 dev.sh 切换**

Dockerfile 两行改为：`COPY server/requirements.lock server/requirements.in ./` 与 `RUN pip install --no-cache-dir -r requirements.lock`；`dev.sh` 在 `cd` 之后插入版本检查：venv 不存在或 `--version` 非 3.12 则打印重建命令并 `exit 1`。删除 `requirements.txt`。

- [ ] **步骤 5：验证 lock 环境下行为不变**

运行：`cd server && .venv/bin/pip install -r requirements-dev.lock && .venv/bin/python -m pytest -q`
预期：≥108 passed，无失败

- [ ] **步骤 6：提交**

`git add server/requirements* server/Dockerfile server/dev.sh && git commit -m "build: 依赖锁定（pip-tools 双 lock）+ Python 统一 3.12"`

### 任务 2：ruff 引入与存量清零

**文件：** 新建 `server/ruff.toml`；format/check 触碰的 server 下既有 `.py` 文件。

**接口：** 产出可被任务 4 CI 原样调用的两个命令：`ruff check .`、`ruff format --check .`（在 server 目录下 exit 0）。

- [ ] **步骤 1：写规则配置**

`server/ruff.toml`：

```toml
line-length = 120
target-version = "py312"

[lint]
select = ["E", "F", "W", "I"]
ignore = ["E501"]  # 中文长注释不换行；代码行宽交给 format
```

- [ ] **步骤 2：机械格式化（单独提交）**

运行：`cd server && .venv/bin/ruff format . && .venv/bin/python -m pytest -q`
预期：pytest 全绿（格式化不得改行为；diff 自查只含空白/引号/换行）
提交：`style: ruff format 存量机械格式化（无行为变更）`

- [ ] **步骤 3：修 check 存量**

运行：`cd server && .venv/bin/ruff check .`
预期：列出存量（预计以 import 排序、未用变量为主）。修复原则：只修规则命中项，**禁止借机重构**；E501 已忽略。
再运行：`.venv/bin/ruff check . && .venv/bin/ruff format --check .` 两条均 exit 0。
提交：`style: ruff check 存量清零（import 排序/未用名）`

### 任务 3：前端类型门禁存量清零

**文件：** 修改 `admin/`、`web/` 下类型错误涉及文件；`web/package.json`（scripts.typecheck + devDeps typescript、vue-tsc）。

**接口：** 产出可被任务 4 CI 消费的状态：admin `npm run build` exit 0；web `npm run typecheck` exit 0（或触发灰度条款并留下数字记录）。

- [ ] **步骤 1：admin 清零（必须全绿，无灰度）**

运行：`cd admin && npm ci && npm run build`
预期：vue-tsc 列出当前分支 WIP 的类型错误。逐个修复，修复原则：修类型标注与明显类型错误，**不改运行时行为、禁止 `any` 消音**；拿不准的类型先收窄字面量联合。
再运行至 `npm run build` exit 0。

- [ ] **步骤 2：web 配置 typecheck**

`web/package.json`：scripts 加 `"typecheck": "nuxi typecheck"`；devDependencies 加 `typescript`、`vue-tsc`（`npm i -D typescript vue-tsc`，lock 随提交）。

- [ ] **步骤 3：web 清零或触发灰度（决策规则逐字执行）**

运行：`cd web && npm run typecheck` 统计错误数。
- ≤30 个：全部修完（同 admin 原则），最终 exit 0，**硬门禁**。
- \>30 个或预估超 1 天：只修阻塞性错误，记录总数到提交信息，任务 4 的 web job 设 `continue-on-error: true` + YAML 注释 `# 灰度：限期一周转硬（规格 §4.4），截止 <日期>`，并在 `docs/研发流程.md` 的待办区登记跟踪项。

- [ ] **步骤 4：提交**

`git add admin web && git commit -m "fix: 前端类型门禁存量清零（admin 全绿；web <总数> 处<清零|灰度>）"`

### 任务 4：CI workflow + PR 模板 + 首跑验证

**文件：** 新建 `.github/workflows/ci.yml`、`.github/PULL_REQUEST_TEMPLATE.md`。

**接口：** 消费任务 1 的两个 lock、任务 2 的 ruff 双命令、任务 3 的前端命令。产出四个**名字固定**的 job：`server`、`security`、`admin`、`web`（任务 6 分支保护逐字引用）。

- [ ] **步骤 1：写 workflow**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  server:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: server } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: pip }
      - run: pip install -r requirements-dev.lock
      - run: ruff check .
      - run: ruff format --check .
      - run: python -m pytest -q
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: pip }
      - run: pip install pip-audit && pip-audit -r server/requirements.lock
  admin:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: admin } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: admin/package-lock.json }
      - run: npm ci
      - run: npm run build
  web:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: web } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: web/package-lock.json }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
```

（web 触发灰度时给 web job 加 `continue-on-error: true` 与限期注释。）

- [ ] **步骤 2：写 PR 模板**

`.github/PULL_REQUEST_TEMPLATE.md` 四节：**改了什么/为什么**；**测试证据**（贴命令与输出，"应该没问题"不算证据）；**风险与回滚**；**检查清单**（DoD 五项：代码/测试/文档/配置项注册/审计点，附勾选框）。

- [ ] **步骤 3：首跑验证**

推本批次分支并开 PR。预期：四个 job 全部出现在 checks 里；`server`/`security` 必须绿（红则修到绿——这本身是门禁有效性的证据）；admin/web 按任务 3 结果绿或灰度黄。gitleaks 在私有仓库若报 license（组织账号才需要），按 action 日志处理并记录。

- [ ] **步骤 4：提交**

`git add .github && git commit -m "ci: 四 job 合并门禁（server/security/admin/web）+ PR 模板"`

### 任务 5：研发流程文档 + ADR 007

**文件：** 新建 `docs/研发流程.md`、`docs/decisions/007-工程规范与质量门禁.md`。

**接口：** 无代码接口；`docs/研发流程.md` 的附录承载任务 6 的手动配置步骤与灰度跟踪项。

- [ ] **步骤 1：研发流程文档**

章节固定为五节：**① 分支与提交规范**（conventional commits + 现有习惯成文）；**② 完成定义 DoD**（逐字：功能 = 代码 + 测试 + 文档 + 配置项注册 + 审计点）；**③ 评审流程**（当前：独立评审子代理 + 自审清单；演进位：人工 reviewer + 留档）；**④ 发布与回滚**（镜像 tag = git tag、CHANGELOG、回滚预案）；**⑤ 附录：分支保护手动配置步骤 + 灰度跟踪项**（任务 6 步骤 1 的操作路径写在这里，web 灰度若有则登记截止日期）。

- [ ] **步骤 2：ADR 007**

沿用既有 ADR 格式（日期/状态/决策表），决策表逐行：目标形态=单人打底+演进位；迁移工具=Alembic（张力化解=单 revision 双引擎分支，指向规格 §5.1）；CI 覆盖=全仓四 job；门禁哲学=验收标准是"验证过拦截"而非"配置了"。

- [ ] **步骤 3：提交**

`git add docs && git commit -m "docs: 研发流程与 ADR 007（工程规范与质量门禁）"`

### 任务 6：main 分支保护

**文件：** 无仓库文件；配置在 GitHub 仓库设置（gh CLI 未安装，走手动路径）。

**接口：** 依赖任务 4 的四个 job 名逐字：`server`、`security`、`admin`、`web`。

- [ ] **步骤 1：按附录配置**

GitHub → PuGaaa/HowDuoThink → Settings → Branches → Add branch protection rule（main）：Require status checks 勾选上述四个名字；勾选 Require branches up to date；禁 force push 与删除。

- [ ] **步骤 2：验证两件事**

(a) 本批次 PR 页面四个 required check 显示且与 job 名逐字一致；(b) `git push origin HEAD:main` 被拒绝（单人场景直推受限即生效证据），输出留存 PR 描述。

- [ ] **步骤 3：无提交**（配置性任务；验证证据贴 PR 描述）

### 任务 7：门禁拦截验证（坏提交 RED → 修复 GREEN）

**文件：** 临时分支 `gate-test` 上的两个探针（验证后全部删除）：`server/tests/test_gate_probe.py`、一个含假密钥的文本文件。

**接口：** 依赖任务 6 的分支保护已生效。

- [ ] **步骤 1：制造坏提交**

分支 `gate-test` 上提交：(a) 文件写 `GITHUB_TOKEN=ghp_TESTFAKEKEY000000000000000000000000`（明假密钥，仅用于触发 gitleaks）；(b) `server/tests/test_gate_probe.py` 内容 `def test_gate_probe(): assert False`。推送并开 PR。

- [ ] **步骤 2：确认拦截**

预期：`security` job 红（gitleaks 命中）且 `server` job 红（测试失败）；若 GitHub 推送保护直接拒绝推送，同样算拦截证据（更强）。两者取其一的输出截图/文本留存 PR 描述。

- [ ] **步骤 3：修复 GREEN**

删除两处坏内容并推送。预期：同一 PR 上四 job 全绿。

- [ ] **步骤 4：清理**

关闭 PR 并 `git push origin --delete gate-test`；本地删分支。坏提交不合并、不留痕于 main。

- [ ] **步骤 5：收尾提交（无）**——证据在 PR 描述与任务 5 文档的引用中，无仓库文件变更。
