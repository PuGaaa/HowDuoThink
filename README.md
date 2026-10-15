# 好多星 HowDuoThink — 程序员思维训练场

给 agent 时代程序员的**诊断推理训练器**。训练的不是知识点，而是高手的核心习惯：

> 看症状 → 建立假设空间 → 按"验证成本"排序 → 最小代价定位根因

产品三要素：

1. **诊断推理闯关**——每关一个故障现场，玩家提出假设、花 ⚡ 预算针对假设收集验证、指认根因；假设板全程可编辑，验证错了随时"返回重新假设"；复盘对照专家推理链与假设板终局。
2. **内心小动物**——借鉴《幸福伽菜子的快乐杀手生活》的"动物外化内心"：五只 3D 吉祥物（恐怖蛙/不行蜗/惊讶濑/垂耳兔/三角龙）对应五种排错认知状态，悬浮弹窗出场、图鉴收集。
3. **按层专题的题库**——每题主打一层的"契约"，六章路径图拼出全栈地图；篇-章-关三级架构，轻量序贯解锁 + 跳级挑战。

视觉语言：多邻国式"实体积木"硬边 + 奶油底 + 珊瑚主色；导航为 iOS 26 风格（悬浮玻璃胶囊返回键 + 内容大标题 + 浮动 Dock）。

## 仓库地图

| 目录                  | 职责                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `app/`                | uni-app X**蒸汽模式**主应用（H5 先行验证玩法 → 后编译 iOS）。页面：首页章节地图 / 章节详情 / 闯关 / 复盘 / 任务 / 海报 / 手册 / 我的 |
| `app/static/mascots/` | 3D 吉祥物图片资产（生图 + 圆形徽章化，96/48/24/192 四档）                                                                            |
| `app/static/icons/`   | 自有图标库 PNG（36 个，resvg 从设计库 SVG 渲染）                                                                                     |
| `content/prompts/`    | AI 生成案例的 prompt 模板（从《案例写作规范》派生）                                                                                  |
| `content/pipeline/`   | Node 脚本：schema 校验（validate.mjs）、跨行字符串 lint                                                                              |
| `content/tools/`      | 设计与内容工具：Figma 桥（figma-rpc/figma-design）、吉祥物图处理、图标库生成、案例导出                                               |
| `content/seeds/`      | AI 生成的**待审核**案例草稿                                                                                                          |
| `docs/`               | 产品文档：《案例写作规范》《角色设定集》、ROADMAP、决策记录                                                                          |
| `server/`             | FastAPI + SQLite 社区后端：GitHub OAuth + 账密登录（bcrypt）、投稿 → 审核 → AI 辅助转稿 → 门禁（gate.py）→ 发布 → casepack 版本同步；托管管理端静态产物 |
| `web/`                | Nuxt 3 社区站：解决逻辑展示 / 投稿 / 我的（管理端已迁出至 `admin/`）                                                                 |
| `admin/`              | 管理端独立工程（Vite + Vue3 SPA）：数据概览 / 投稿审核 / Case 管理 / 用户管理 / AI 用量 / 服务健康；产物打进 api 镜像托管 `/admin/`   |

## 内容流向（生死管线）

```
docs/案例写作规范.md  →  content/prompts  →  content/seeds（草稿）
    →  你以玩家+审核者双身份走验  →  content/pipeline/validate.mjs + server/gate.py 双门禁
    →  app/data/cases/（入库，编译进包）∪ server 发布（casepack 动态同步进包）
```

类型定义以 `app/types/case.ts` 为**唯一权威源**（uni-app x 编译要求 import 不出项目根，故不外提）。

## 开发

### 快速启动（本地把整套跑起来）

前置：Python 3.12+、Node 20+。以下顺序执行，后端必须先起（管理端/社区站都依赖它）：

```bash
# 1. 起社区后端（:8000）。首次需建 venv（dev.sh 用的就是它）；dev.sh 已固定 JWT_SECRET、ENV=dev
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./dev.sh
#    若 .env.dev.local 配了 DB_PROVIDER=mysql（推荐，与线上一致）：本地 MySQL 容器需一次性
#    建库建号，账号密码与 .env.dev.local 对齐。例：
#      docker exec <mysql容器> mysql -uroot -p<root密码> -e \
#        "CREATE DATABASE IF NOT EXISTS hdx CHARACTER SET utf8mb4;
#         CREATE USER IF NOT EXISTS 'hdx'@'%' IDENTIFIED BY '<密码>';
#         GRANT ALL ON hdx.* TO 'hdx'@'%';"

# 2. 起管理端（:5174，另开终端）。首次打开会进入"设置初始管理员"向导
cd admin && npm install && npm run dev
#    浏览器开 http://localhost:5174/admin/ → 设置初始管理员账号 → 登录
#    （也可跳过向导：起后端前 export ADMIN_PASSWORD=你的密码，账号即 pw-admin）

# 3. Web 社区站（:3000，可选）
cd web && npm install && npm run dev
```

不想起管理端 dev server？构建一次，由后端直接托管（与生产同款链路）：

```bash
cd admin && npm run build
cd ../server && ADMIN_DIST_DIR=../admin/dist ./dev.sh   # 访问 http://localhost:8000/admin/
```

**App（uni-app X）**

- 用 HBuilderX 5.21+ 打开 `app/` 目录，勾选蒸汽模式（manifest 已配置 `"vapor": true`）
- 运行到浏览器验证玩法（H5 端自动以 VDOM 模式回落运行，属正常现象）
- 修改案例内容 → `app/data/cases/`；新增案例前先读 `docs/案例写作规范.md`
- 入库自检：`node content/pipeline/validate.mjs app/data/cases/<case>.ts`

**后端（FastAPI，Feature 架构）**

```bash
cd server
pip install -r requirements.txt
uvicorn main:app --port 8000
python3 seed.py   # 官方案例种子入库
/tmp/pilvenv/bin/python -m pytest tests/ -q   # 单测（隔离临时库）
```

目录约定：`core/`（横切：config/db/security/deps）；`features/<域>/`（router + service + models，域内仍分层）。
依赖规则：feature → core 允许；feature → 其他 feature 仅限 cases.service（供 submissions 转稿、sync 拉取）；SQL 只出现在 feature 的 service 层。

- 凭据全部走环境变量：`GITHUB_CLIENT_ID/SECRET`、`JWT_SECRET`（未设置则进程内随机，重启失效）、`ADMIN_PASSWORD`（无默认值）、`WEB_ORIGIN`、`COOKIE_SECURE=1`（HTTPS 部署时）、`ADMIN_WEB_ORIGIN`（管理端独立域名时的 CORS）、`SENTRY_DSN`（错误追踪，空=关闭）
- 开发绕行登录仅 `ENV=dev` 时开放：`/api/dev/login?login=xxx`

**Web 社区站（Nuxt 3）**

```bash
cd web
npm install
npm run dev   # localhost:3000；后端地址经 NUXT_PUBLIC_API_BASE 覆盖
```

**管理端（Vue3 SPA，独立工程）**

```bash
cd admin
npm install
npm run dev   # localhost:5174（避开 App H5 的 5173）；/api 代理到本地 server
```

登录需 editor/admin 角色（`ADMIN_PASSWORD` 引导的 `pw-admin` 或 GitHub 白名单）。详见 `admin/README.md`。

## 运行状态速查

| 服务       | 端口 | 说明             |
| ---------- | ---- | ---------------- |
| App H5 dev | 5173 | HBuilderX vite   |
| 社区后端   | 8000 | uvicorn main:app |
| Web 社区站 | 3000 | Nuxt dev         |
| 管理端 dev | 5174 | vite（/api 代理 8000） |
