# 好多星 · HowDuoThink 工程约束（AI 助手必读）

> 全局通用习惯见 ~/.zcode/AGENTS.md；本文件只写本项目特有的约束。
> 案例内容规范见 docs/案例写作规范.md；出题规划见 docs/出题总纲.md。

## 环境一致性（禁止本地与线上双方案——适用于所有基础设施层）

**dev、预发、生产使用同一套服务与实现**：MySQL 8、DeepSeek、fastembed/BGE、阿里云短信……
环境之间**只允许配置不同**（连接串、key、容量、域名），**不允许实现不同**
（本地 SQLite + 线上 MySQL、本地回显 + 线上真发、本地假 LLM + 线上真模型，均禁止）。

- **依据**：本项目案例库亲自判过死刑的三课——env-drift（本地测得好好的生产行为不同）、
  env-inherit（默认值的三个世界）、priority-clash（来源覆盖优先级链）。
- **新 SQL/代码**：书写 SQLite 方言（? 占位 / datetime('now') / ON CONFLICT ... DO UPDATE），
  由 core/db.py 的 _translate 在 MySQL 引擎执行前统一翻译；方言规则改动只发生在 core/db.py。
- **配置入口**：server/.env.dev.local（gitignored，dev.sh 自动 source）；生产同构同名变量。
  禁止把 key/密码写进任何 git 跟踪文件。
- **唯一允许的替身**：外部付费服务的沙箱模式，且必须是**同一 provider 的同一 SDK**
  （如支付沙箱）。绝不允许"本地换一个假实现"。
- **AI 降级链是运行时容错，不是双方案**：无 key 时功能降级可用，但开发/验收必须带真实 key
  走真实链路（本条与上一条的结合：降级发生在运行时，环境本身仍是同构的）。
- **新基础设施上线的检查问题**：这个服务在 dev 和 prod 是不是同一种东西？
  本地开发者的机器能不能用一条命令把整套环境拉起来？答案是否就不许合入。

## AI 能力（features/ai）

- 对话/起草 = DeepSeek（deepseek-chat）；向量化 = fastembed 本地 BGE-small-zh-v1.5（可切 zhipu embedding-3）
- LangChain 只做模型 I/O；编排层自研纯节点（LangGraph 为 agentic 场景的演进路径）
- 容量判断先算术再选型：132 案例量级不上向量库；模型驻留内存与服务器规格一起评估

## 出题难度（六维自检）

- difficulty 由六维（推理距离/证据形态/知识层次/反直觉度/跨层跨度/陷阱主动性）中位数产生，
  任两维 L3 才可标 L3；篇映射见 docs/出题总纲.md 5.3
- 学徒篇 L3 仅限章尾结业关 ×1；新题出稿前逐维自检并引用原文作依据
