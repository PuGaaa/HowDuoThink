# content（案例工厂）

案例内容的生产域。**案例的最终归宿是 `app/data/cases/`**，这里只管"生产与质检"。

| 子目录 | 职责 |
|---|---|
| `prompts/` | AI 生成 prompt 模板。必须从 `docs/案例写作规范.md` 派生，规范改了 prompt 跟着改 |
| `pipeline/` | Node 校验脚本：schema 完整性、红线 checklist 可自动化部分、成本一致性 |
| `seeds/` | AI 生成的待审核草稿。**审核通过的案例才会写入 `app/data/cases/`** |

## 流程

1. 生成：按 prompts 产出草稿，落 `seeds/`
2. 走验：作者以玩家身份在 app 里完整玩一遍（可临时把 seed 拷进 `app/data/cases/` 体验）
3. 校验：`node content/pipeline/validate.mjs <文件>`，红线项人工过 checklist
4. 入库：拷贝到 `app/data/cases/` 并注册进 `index.ts`
