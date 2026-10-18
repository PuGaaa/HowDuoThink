# content（案例工厂）

案例内容的生产域。**案例的最终归宿是 `app/data/cases/`**（编译进 App 包），这里只管"生产与质检"。

| 子目录 | 职责 |
|---|---|
| `pipeline/` | Node 机检脚本 `validate.mjs`：schema 完整性、红线 checklist 可自动化部分、成本一致性（证据自洽/双路径/噪声质量仍需人工走验） |
| `tools/` | `export-case.mjs`：把 `app/data/cases/*.ts` 全量导出为 `server/seed/*.json`（供 seed.py 入库 + casepack 增量同步）；其余为设计资产工具 |
| `prompts/` | **预留空目录**。AI 起草 prompt 实际维护在 `server/features/ai/service.py`（SYSTEM_PROMPT / DRAFT_PROMPT），从 `docs/案例写作规范.md` 派生 |
| `seeds/` | **预留空目录**。AI 生成的待审草稿实际直接落库 `cases` 表（status='draft'），经管理端审核/润色后发布 |

## 官方案例入库流程

1. 写作：按 `docs/案例写作规范.md` 写 TS 案例文件
2. 走验：作者以玩家身份在 app 里完整玩一遍（拷进 `app/data/cases/` 体验）
3. 机检：`node content/pipeline/validate.mjs <文件>`，红线项人工过 checklist
4. 入库：注册进 `app/data/cases/index.ts` → `node content/tools/export-case.mjs` 导出 `server/seed/*.json` → `server/seed.py` 过 gate 门禁后 upsert 进库（published）

> `server/seed/*.json` 是**不入 git 的构建产物**（唯一内容源是 `app/data/cases/`，改 JSON 会被下次导出覆盖）。
> 镜像构建期自动生成；本地直接跑 `seed.py` 前先执行一次导出。

## 社区案例通道（不经本目录）

投稿 → 管理端审核 → AI 起草（DeepSeek，prompt 见 `server/features/ai/service.py`）或机械骨架 → 编辑润色 → 过门禁发布。草稿全程存数据库，`seeds/` 文件暂存方案未启用。
