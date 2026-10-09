# 好多星 · HowDuoThink 工程约束（AI 助手必读）

> 全局通用习惯见 ~/.zcode/AGENTS.md；本文件只写本项目特有的约束。
> 案例内容规范见 docs/案例写作规范.md；出题规划见 docs/出题总纲.md。

## 数据库引擎单一化（禁止本地与线上双方案）

- **dev 与生产使用同一引擎：MySQL 8**。本地开发用 Docker 容器（`docker start hdt-mysql`），
  生产用云 MySQL——引擎、方言、语义完全一致。
- **禁止**任何"本地 SQLite / 线上 MySQL"双方案：环境语义分叉是本项目案例库
  （env-drift、env-inherit、priority-clash）亲自判过死刑的反模式。
  SQLite 与 data.db 仅作为历史迁移源保留（migrate_sqlite_to_mysql.py），不再参与运行。
- 新 SQL 一律书写 SQLite 方言（? 占位 / datetime('now') / ON CONFLICT ... DO UPDATE），
  由 core/db.py 的 _translate 在 MySQL 引擎执行前统一翻译；方言规则改动只发生在 core/db.py。
- 配置入口：.env.dev.local（gitignored）的 DB_PROVIDER / MYSQL_* 五项；
  生产环境同构五项。禁止把 key/密码写进任何 git 跟踪文件。

## AI 能力（features/ai）

- 对话/起草 = DeepSeek（deepseek-chat）；向量化 = fastembed 本地 BGE-small-zh-v1.5（可切 zhipu embedding-3）
- LangChain 只做模型 I/O；编排层自研纯节点（LangGraph 为 agentic 场景的演进路径）
- 容量判断先算术再选型：132 案例量级不上向量库；模型驻留内存与服务器规格一起评估

## 出题难度（六维自检）

- difficulty 由六维（推理距离/证据形态/知识层次/反直觉度/跨层跨度/陷阱主动性）中位数产生，
  任两维 L3 才可标 L3；篇映射见 docs/出题总纲.md 5.3
- 学徒篇 L3 仅限章尾结业关 ×1；新题出稿前逐维自检并引用原文作依据
