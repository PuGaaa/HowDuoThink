# 好多星 · HowDuoThink

**多想，多星。/ How to think.** —— 把真实故障做成一桩桩案件，陪工程师多想一步。训练的不是知识点，而是高手的核心习惯：

> 看症状 → 建立假设空间 → 按"验证成本"排序 → 最小代价定位根因

产品三要素：

1. **破案闯关**——每关一个故障现场，玩家提出假设、花 ⚡ 预算针对假设收集验证、指认根因；假设板全程可编辑，验证错了随时"返回重新假设"；复盘对照专家推理链与假设板终局。
2. **内心小动物**——借鉴《幸福伽菜子的快乐杀手生活》的"动物外化内心"：五只 3D 吉祥物（恐怖蛙/不行蜗/惊讶濑/垂耳兔/三角龙）对应五种排错认知状态，悬浮弹窗出场、图鉴收集。
3. **按层专题的题库**——每题主打一层的"契约"，六章路径图拼出全栈地图；篇-章-关三级架构，轻量序贯解锁 + 跳级挑战。

视觉语言：多邻国式"实体积木"硬边 + 奶油底 + 珊瑚主色；导航为 iOS 26 风格（悬浮玻璃胶囊返回键 + 内容大标题 + 浮动 Dock）。

## 仓库地图

每个子工程的**启动、配置、交接说明都在它自己的 README 里**，本文件只做统筹。

| 目录 | 职责 | 文档 |
|---|---|---|
| `app/` | uni-app X**蒸汽模式**主应用（H5 先行 → iOS）：闯关玩法全部页面 | [app/README.md](app/README.md) |
| `server/` | FastAPI 社区后端（唯一 API）：账号 / 案例库 / 投稿 / 进度同步 / AI 对话 / 管理端接口 / 监控；托管管理端静态产物 | [server/README.md](server/README.md) |
| `web/` | Nuxt 3 社区站：解决逻辑展示 / AI 排错 / 投稿 / 我的 | [web/README.md](web/README.md) |
| `admin/` | 管理端独立工程（Vue3 SPA）：数据概览 / 投稿审核 / Case 管理 / 用户管理 / AI 用量 / 服务健康 | [admin/README.md](admin/README.md) |
| `content/` | AI 生成案例的 prompts、校验 pipeline、待审核草稿 | [content/README.md](content/README.md) |
| `docs/` | 产品文档：PRD、案例写作规范、出题总纲、决策记录（decisions/） | — |

## 快速启动（本地把整套跑起来）

前置：Python 3.12+、Node 20+、Docker（本地 MySQL）。**后端必须先起**，其余端都依赖它。

```bash
# 1. 社区后端（:8000）—— venv、本地 MySQL 建库建号、.env.dev.local 详见 server/README.md
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./dev.sh

# 2. 管理端（:5174）。初始账号 admin / HaoDuo@2026（dev 环境登录页与启动日志有提示，登录后请在侧栏修改密码）
cd admin && npm install && npm run dev    # → http://localhost:5174/admin/

# 3. Web 社区站（:3000，可选）
cd web && npm install && npm run dev
```

不起管理端 dev server？构建一次由后端托管（与生产同款链路）：
`cd admin && npm run build && cd ../server && ADMIN_DIST_DIR=../admin/dist ./dev.sh`
→ 访问 `http://localhost:8000/admin/`。

App 走 HBuilderX（见 app/README.md）。生产部署：`server/部署与运维说明文档.md`
（docker compose 一条命令拉起 MySQL + api，管理端产物随镜像托管）。

## 内容流向（生死管线）

```
docs/案例写作规范.md  →  content/prompts  →  content/seeds（草稿）
    →  你以玩家+审核者双身份走验  →  content/pipeline/validate.mjs + server gate.py 双门禁
    →  app/data/cases/（入库，编译进包）∪ server 发布（casepack 动态同步进包）
```

类型定义以 `app/types/case.ts` 为**唯一权威源**（uni-app x 编译要求 import 不出项目根，故不外提）。

## 运行状态速查

| 服务       | 端口 | 说明                       |
| ---------- | ---- | -------------------------- |
| 社区后端   | 8000 | `server/dev.sh`            |
| 管理端 dev | 5174 | vite（/api 代理 8000）     |
| Web 社区站 | 3000 | Nuxt dev                   |
| App H5 dev | 5173 | HBuilderX vite             |

## 工程约束与文档

- 工程约束（必读）：[AGENTS.md](AGENTS.md) —— 环境一致性铁律、feature 依赖规则、出题难度六维
- 产品文档：`docs/`（PRD、案例写作规范、出题总纲、品牌理念、decisions/ 决策记录）
- 交接各层细节：`server/README.md`（后端接口/环境变量/测试）、`admin/README.md`（管理端页面/部署）、
  `web/README.md`、`app/README.md`、`content/README.md`（案例工厂流程）
