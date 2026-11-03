# 数据层规范化（梯队二）· 实施计划

> **给执行者：** 必须使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现本计划。步骤用复选框 `- [ ]` 追踪。

**目标：** 落地规格 §5——Alembic 双引擎版本化迁移（schema 真相源从三处收敛为一处）、每日自动备份 + 真实恢复演练、启动 fail-fast 四项。

**架构：** Alembic 挂在既有 `core/config` 之上（env.py 运行时组装 URL，不缓存）；**单 revision 双引擎分支**（`op.get_bind().dialect.name` 走 SQLite 或 MySQL 8 两套显式 DDL，不用 autogenerate）；`create_app()` 启动即 `upgrade_head()` 再断言 `current==head`（保留"起容器自动建库"的既有体验）；备份为 compose 侧车（mysql:8.0 镜像复用，mysqldump 每日 → 备份卷，保留 7 天）。

**技术栈：** alembic>=1.13（新依赖，pip-compile 进双 lock）、SQLAlchemy（alembic 自带传递依赖）、docker compose（演练）。

**规格：** `docs/superpowers/specs/2026-10-30-engineering-standardization-design.md` §5.1/§5.2/§5.3（执行者必须连规格一起读）。

## 全局约束

- 迁移文件是方言规则的**唯一例外**：versions/*.py 内按引擎显式分支写 DDL；除此之外 SQL 仍一律 SQLite 方言走 `core/db.py` 翻译。
- 新依赖只进 `requirements.in` → `pip-compile` 重锁，禁止手改 lock。
- `pytest -q` 全绿且用例数 ≥111（当前基线），不得删既有用例。
- 提交 conventional commits；本批次不动 admin/web 业务代码。
- AGENTS.md 红线：本地开发者一条命令拉起整套环境（boot-migrate 保住这条）。
- AI 不读取/输出 `.env*` 的值；演练脚本 source `.env` 进环境变量但不回显。

## 评审聚焦点

1. **基线 MySQL DDL 移植抄写错误**（SCHEMA_MYSQL 无 legacy 对拍对象）——任务 5 在真 MySQL 上断言引擎差异点：`ux_users_phone` 非 partial 唯一键存在、`ai_usage.id` 为 auto_increment、meta 表主键名为 `meta_key`。
2. **存量库升级顺序**（老库无 alembic_version，直接 upgrade 会 CREATE 已存在表而炸）——任务 5 实测 stamp 流程（删 version 行 → stamp head → 表与数据不动）；任务 6 把"先 stamp 后重启"写成部署文档硬步骤。
3. **env.py URL 缓存陷阱**（conftest 换 DB_PATH 后 upgrade 仍打旧库）——任务 1 测试 `test_upgrade_uses_current_config`（连续两次指向不同路径各建各的库）；conftest 全量测试通过是第二重证明。
4. **downgrade 一键全删的生产误操作**——baseline downgrade 删全部表；任务 6 在部署文档加显著警示（downgrade 前必须先备份）。
5. **备份产物不含 alembic_version 导致恢复后版本漂移**——任务 5 断言恢复后 `alembic_version` 行存在且等于 head。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `server/alembic.ini` | 新建 | 最小配置（script_location；无 sqlalchemy.url——env.py 动态组装） |
| `server/alembic/env.py` | 新建 | 运行时读 core.config 组装双引擎 URL；offline/online 两条路径 |
| `server/alembic/script.py.mako` | 新建 | 标准 mako + 双引擎分支注释模板 |
| `server/alembic/versions/0001_baseline.py` | 新建 | 基线：从 core/db.py 的 SCHEMA/SCHEMA_MYSQL 逐字移植（源以 `git show fce2645:server/core/db.py` 为准，任务 2 将删除原文件） |
| `server/core/migrate.py` | 新建 | `upgrade_head() -> None`；`current_version() -> str | None`；`head_version() -> str`；`stamp_head() -> None`（编程式 alembic，唯一 import 面） |
| `server/core/db.py` | 修改 | 删 SCHEMA/SCHEMA_MYSQL/init()（连接层 q/ex/tx/jload 等不动） |
| `server/main.py` | 修改 | create_app：fail-fast 四项 + boot-migrate |
| `server/tests/conftest.py` | 修改 | 建表从隐式 init 换成显式 upgrade_head()（SQLite/MySQL 两分支） |
| `server/seed.py` | 修改 | db.init() → migrate.upgrade_head() |
| `server/requirements.in` + 双 lock | 修改 | + alembic>=1.13，pip-compile 重锁 |
| `server/docker-compose.yml` | 修改 | mysql 加 `127.0.0.1:${MYSQL_PORT:-13306}:3306` 端口；新增 backup 服务 + backups 卷 |
| `docs/备份与恢复.md` | 新建 | 恢复步骤、演练记录表（任务 5 填第一行） |
| `server/部署与运维说明文档.md` / `server/.env.example` | 修改 | 建库方式变更、alembic 速查、stamp 硬步骤、downgrade 警示、MYSQL_PORT 注释 |
| `server/tests/test_migrations.py`、`server/tests/test_fail_fast.py`、`server/tests/fixtures/schema_baseline.sql` | 新建 | 测试与 schema 快照 |

---

### 任务 1：Alembic 脚手架 + 基线迁移 + 等价性证明

**文件：** 新建上表 alembic 四件套与 `core/migrate.py`；修改 `requirements.in` + 重锁；测试 `tests/test_migrations.py`、`tests/fixtures/schema_baseline.sql`。

**接口：**
- 产出：`core.migrate.upgrade_head() -> None`、`current_version() -> str | None`、`head_version() -> str`、`stamp_head() -> None`；基线 revision id 固定 `"0001_baseline"`。main/conftest/seed/演练任务只经这四个函数接触 alembic。
- 约束：env.py 通过 `import core.config`（sqlite：`f"sqlite:///{config.DB_PATH.resolve()}"`；mysql：`f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"`）在**每次运行时**组装，禁止模块级缓存。

- [ ] **步骤 1：依赖与配置**

`requirements.in` 加 `alembic>=1.13` → `cd server && .venv/bin/pip-compile requirements.in -o requirements.lock && .venv/bin/pip-compile requirements-dev.in -o requirements-dev.lock && .venv/bin/pip install -r requirements-dev.lock`。写 alembic.ini / env.py / script.py.mako（结构见"文件结构"职责列；mako 模板头注释写明双引擎分支惯例）。

- [ ] **步骤 2：写失败测试（对拍 = 移植正确性的主要证明）**

```python
def test_baseline_equals_legacy_init(monkeypatch, tmp_path):
    """alembic 基线建出的 schema 必须与 legacy db.init() 完全一致（除 alembic_version）。
    比较双方 sqlite_master 中全部 table/index 的 SQL 文本集合。"""
    # dbA：legacy init()（此时 core/db.py 尚未删）；dbB：upgrade_head()
    # 各自 monkeypatch coredb.DB_PATH 与 db shim 的 DB_PATH 到 tmp 文件
    # setA = {_schema_sql(conn_a)} - alembic_version；setB 同理；assert setA == setB

def test_replay_sqlite(tmp_path, monkeypatch):
    """空库 upgrade → downgrade → upgrade 全链重放成功，重放后 current==head。"""

def test_upgrade_uses_current_config(tmp_path, monkeypatch):
    """连续两库：换 DB_PATH 后第二次 upgrade 建的是新路径的库（URL 不缓存）。"""
```

- [ ] **步骤 3：跑测试确认失败**

运行：`.venv/bin/python -m pytest tests/test_migrations.py -q`
预期：collection 前 import `core.migrate` 报 ModuleNotFoundError

- [ ] **步骤 4：实现 0001_baseline.py 与 core/migrate.py**

baseline：`revision="0001_baseline", down_revision=None`；`upgrade()`/`downgrade()` 内 `dialect = op.get_bind().dialect.name`，`if dialect == "sqlite":` 逐条 `op.execute(<SCHEMA 语句>)`，`elif dialect == "mysql":` 逐条 `op.execute(<SCHEMA_MYSQL 语句>)`——**语句文本从 `git show fce2645:server/core/db.py` 的 SCHEMA/SCHEMA_MYSQL 逐字复制**（它们本就是分号分句的合法 DDL 序列，SQLite 侧含 partial index 与 IF NOT EXISTS，MySQL 侧含 UNIQUE KEY/INDEX 内联）。downgrade 按 information_schema/sqlite_master 查现存表逐个 DROP（幂等，兼容部分缺表）。`core/migrate.py` 用 `alembic.config.Config(Path(__file__).parent.parent / "alembic.ini")` + `alembic.command`（upgrade/current/stamp；head_version 取 `script.walk_revisions` 的头）。

- [ ] **步骤 5：跑测试确认通过（对拍红了就修 baseline，不改 legacy SCHEMA）**

运行：`.venv/bin/python -m pytest tests/test_migrations.py -q`
预期：3 passed

- [ ] **步骤 6：固化 schema 快照 + 全量回归**

生成 `tests/fixtures/schema_baseline.sql`（对 upgrade 后的库按名排序 dump sqlite_master 的 SQL 文本；脚本一次性，不入库）；新增 `test_baseline_matches_fixture`（alembi 结果 == 快照，legacy init 删除后由它长期把守基线）。跑全套件。
预期：≥111+5 passed

- [ ] **步骤 7：提交**

```bash
git add server/alembic* server/core/migrate.py server/requirements* server/tests/test_migrations.py server/tests/fixtures/schema_baseline.sql
git commit -m "feat: Alembic 双引擎基线迁移（对拍 legacy init 等价 + 快照把守 + 重放测试）"
```

### 任务 2：db.init() 退役 + 入口切换

**文件：** 修改 `core/db.py`（删 SCHEMA/SCHEMA_MYSQL/init，约 290 行）、`main.py:55-57`、`tests/conftest.py`、`seed.py:71`；删 `test_baseline_equals_legacy_init`（被测对象已删，快照测试接管把守）。

**接口：** 消费任务 1 的 `core.migrate.upgrade_head()`。产出：`create_app()` 建库路径 = boot-migrate（后续任务只加 fail-fast，不再动建库）；conftest 在 `import main` 之前显式 upgrade。

- [ ] **步骤 1：改 conftest/seed/main 三处调用 + 删 init**

conftest：SQLite 分支在设完 DB_PATH 后、`import main` 前 `from core import migrate; migrate.upgrade_head()`；MySQL 分支在建完 `hdt_test_<pid>` 库后同样调用（config.MYSQL_DATABASE 已打补丁）。main.create_app：`db.init()` → `from core import migrate; migrate.upgrade_head()`。seed.py 同换。core/db.py 删三段（SCHEMA/SCHEMA_MYSQL/init）。

- [ ] **步骤 2：全量回归（111 个既有用例 = 移植零回归的主证据）**

运行：`.venv/bin/python -m pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check . | tail -1`
预期：≥111+4 passed（少一个对拍用例）

- [ ] **步骤 3：提交**

`git add -u && git commit -m "refactor: db.init/SCHEMA 退役，建库统一走 Alembic boot-migrate（111 用例回归绿）"`

### 任务 3：启动 fail-fast 四项

**文件：** 修改 `main.py`（create_app 头部）；新建 `tests/test_fail_fast.py`。

**接口：** 消费 `core.migrate.{current_version,head_version}`。检查顺序固定：①JWT ②SMS ③MySQL 连通 ④upgrade 后 current==head（顺序即测试断言的报错优先级）。

- [ ] **步骤 1：写失败测试**

```python
def test_refuse_ephemeral_jwt_secret_in_prod(monkeypatch):
    # monkeypatch config.JWT_SECRET_EPHEMERAL=True, DEV_MODE=False
    # with pytest.raises(RuntimeError, match="JWT_SECRET"): main.create_app()

def test_refuse_dev_sms_channel_when_env_set(monkeypatch):
    # ENV 设为 "staging"（monkeypatch config 与 os.environ），SMS_PROVIDER 保持 "dev"
    # pytest.raises(RuntimeError, match="SMS_PROVIDER")；ENV 缺省（""）与 ENV=dev 不拒

def test_refuse_when_mysql_unreachable(monkeypatch):
    # config.DB_PROVIDER="mysql", MYSQL_HOST 指向 127.0.0.1:1（必拒端口）
    # pytest.raises(RuntimeError, match="MySQL")

def test_refuse_when_schema_behind(monkeypatch, tmp_path):
    # SQLite 库 stamp 到 "0001_baseline" 后人为降级：直接删 alembic_version 行
    # 再 monkeypatch upgrade 无效？——改为：monkeypatch migrate.upgrade_head 为 no-op，
    # 断言 current(head 比对) 拒绝：pytest.raises(RuntimeError, match="schema")
```

- [ ] **步骤 2：跑测试确认失败**（create_app 现在不做任何检查 → 三个 raises 全不抛）
运行：`.venv/bin/python -m pytest tests/test_fail_fast.py -q` · 预期：4 failed（DID NOT RAISE）

- [ ] **步骤 3：实现（报错文案逐字钉死）**

①`if config.JWT_SECRET_EPHEMERAL and not config.DEV_MODE: raise RuntimeError("生产必须显式配置 JWT_SECRET（重启即全体会话失效）")` ②`env = os.environ.get("ENV", ""); if sms.PROVIDER == "dev" and env not in ("", "dev"): raise RuntimeError(f"SMS_PROVIDER=dev 回显通道禁止用于 ENV={env} 环境")` ③`if config.DB_PROVIDER == "mysql":` 试连（db.connect + `SELECT 1`）失败 `raise RuntimeError("MySQL 连不通：检查 MYSQL_* 配置与服务状态")` ④`migrate.upgrade_head(); if migrate.current_version() != migrate.head_version(): raise RuntimeError("schema 版本落后：容器入口未执行迁移，拒绝启动")`。

- [ ] **步骤 4：跑测试确认通过 + 全量回归**

运行：`.venv/bin/python -m pytest -q` · 预期：≥115+4 passed（conftest 已设 JWT_SECRET、ENV 缺省 → 既有用例零影响）

- [ ] **步骤 5：提交** `git commit -m "feat: 启动 fail-fast 四项（JWT/SMS/MySQL 连通/schema 版本）"`

### 任务 4：备份侧车 + 恢复文档

**文件：** 修改 `docker-compose.yml`；新建 `docs/备份与恢复.md`；`.env.example` 加 `# MYSQL_PORT=13306  # 宿主机侧映射（仅 127.0.0.1，供演练/手工备份用）`。

**接口：** 无代码接口（配置层）；任务 5 的演练消费 backup 侧车所在网络与 mysql 端口。

- [ ] **步骤 1：compose 变更**

mysql 服务 `ports: ["127.0.0.1:${MYSQL_PORT:-13306}:3306"]`；新增服务与卷（要点逐字）：

```yaml
  backup:
    image: mysql:8.0
    restart: unless-stopped
    depends_on: { mysql: { condition: service_healthy } }
    environment: [ "MYSQL_PWD=${MYSQL_PASSWORD}" ]
    entrypoint: [ "bash", "-c", "while true; do mysqldump --single-transaction --no-tablespaces -h mysql -u$$MYSQL_USER $$MYSQL_DATABASE | gzip > /backups/hdx-$$(date +%F).sql.gz && find /backups -name 'hdx-*.sql.gz' -mtime +7 -delete; sleep 86400; done" ]
    volumes: [ "backups:/backups" ]
volumes: { backups: }   # 与既有 volumes 合并
```

（`$$` 为 compose 转义，容器内展开；用户名/库名由 compose 从 .env 插值，密码走 MYSQL_PWD 环境变量不进命令行。）

- [ ] **步骤 2：docs/备份与恢复.md**

章节：①备份机制（侧车、每日、保留 7 天、卷位置 `docker volume inspect`）②手动备份与恢复命令（exec 侧车 dump / gunzip 回灌）③演练步骤摘要（指向任务 5 的实测记录）④演练记录表（`| 日期 | 操作者 | 场景 | 结果 |`，表头留空行待任务 5 填）⑤警示：baseline `downgrade()` 会 DROP 全部表，任何 downgrade 前先备份。

- [ ] **步骤 3：验证与提交**

运行：`docker compose -f server/docker-compose.yml config -q && echo OK`（不 up，不碰你正在跑的 nacos）
预期：OK · 提交 `git commit -m "ops: MySQL 每日备份侧车（7 天保留）+ 备份与恢复文档"`

### 任务 5：真实恢复演练（含 MySQL 重放与 stamp 流程实测）

**文件：** 新建一次性脚本不入库（步骤内 heredoc 执行）；修改 `docs/备份与恢复.md`（填记录表第一行）。

**接口：** 消费任务 1 的 `core.migrate.*`（env 指向演练库）、任务 4 的 compose 网络与端口（`-p hdx-drill` 独立项目名，不触碰任何既有栈；结束后 `down -v` 清干净）。

- [ ] **步骤 1：起隔离 MySQL 并建库**

`set -a; . server/.env; set +a`（不回显）→ `docker compose -p hdx-drill -f server/docker-compose.yml up -d mysql` 等 healthy → 容器内 root 建 `hdx_drill` 与 `hdx_drill2` 两库。

- [ ] **步骤 2：迁移 + 种子 + 记录基线**

`MYSQL_DATABASE=hdx_drill MYSQL_PORT=13306 python -c "from core import migrate, db; migrate.upgrade_head(); <经 db.ex 插入 users/cases/settings 各一行>"`；断言 `current_version() == head_version()`；记录三表 count。

- [ ] **步骤 3：dump → drop → restore → 逐项断言**

`docker compose -p hdx-drill exec -T mysql mysqldump --single-transaction --no-tablespaces -uroot -p"$MYSQL_ROOT_PASSWORD" hdx_drill | gzip > /tmp/hdx-drill.sql.gz` → DROP DATABASE hdx_drill → 重建空库 → `gunzip -c … | docker compose -p hdx-drill exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" hdx_drill` → 断言：三表 count 与基线一致；`alembic_version` 行存在且 == head（聚焦点 5）；`information_schema.STATISTICS` 含 `ux_users_phone`（非 partial，聚焦点 1）；`information_schema.COLUMNS` 中 `ai_usage.id` EXTRA='auto_increment'；`meta` 主键列名 `meta_key`。

- [ ] **步骤 4：stamp 存量库流程实测（聚焦点 2）**

恢复后的库 `DELETE FROM alembic_version`（模拟老库无版本表）→ `MYSQL_DATABASE=hdx_drill python -c "from core import migrate; migrate.stamp_head()"` → 断言 current==head 且三表 count 不变（stamp 不触碰数据）。

- [ ] **步骤 5：MySQL 引擎重放（聚焦点 1 的另一半）**

`hdx_drill2` 上 `upgrade_head() → downgrade()`（断言业务表全消失）`→ upgrade_head()`（断言表结构重建、current==head）。

- [ ] **步骤 6：清场 + 填记录表 + 提交**

`docker compose -p hdx-drill down -v`；`docs/备份与恢复.md` 记录表填入 `| 2026-11-XX | <执行者> | 本地 docker 演练：迁移/备份/恢复/stamp/重放 | 全部通过 |`；提交 `git commit -m "docs: 首次备份恢复演练记录（dump/restore/stamp/双引擎重放实测通过）"`。

### 任务 6：部署文档更新 + 收尾全绿

**文件：** 修改 `server/部署与运维说明文档.md`；全仓验证收尾。

**接口：** 消费前五个任务的全部产物（文档如实描述已验证的行为）。

- [ ] **步骤 1：部署文档三处更新**

①"首次上线"注明建库方式 = boot-migrate（起容器即建表到 head，无需手工步骤）；②新增"数据库迁移"小节：alembic 速查（`upgrade head`/`current`/`downgrade -1`）+ **存量库升级硬步骤**（拉新镜像 → 容器内 `python -c "from core import migrate; migrate.stamp_head()"` → 重启 api）+ downgrade 警示；③"日常运维速查"加备份查看/手动触发/恢复指向 `docs/备份与恢复.md`。

- [ ] **步骤 2：收尾验证（本地 CI 等价）**

运行：`cd server && .venv/bin/ruff check . && .venv/bin/ruff format --check . | tail -1 && .venv/bin/python -m pytest -q`；`cd ../admin && npm run build 2>&1 | tail -1`（未触碰，防意外）；`git status` 确认无未跟踪文件被已提交代码依赖（PR 模板新检查项的自证）。
预期：全绿 + 工作树无新增未跟踪依赖

- [ ] **步骤 3：提交推送**

`git add -u && git commit -m "docs: 部署文档迁移章节（boot-migrate/stamp 硬步骤/downgrade 警示）+ 备份运维指引" && git push origin main`（分支保护未强制，直推 main 与现状一致；推后请同伴瞄一眼 Actions 四 job）。
