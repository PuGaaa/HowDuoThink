# T04B 大师系统四章暂停记录

暂停时间：2026-11-04。用户最新明确要求先暂停题库校准、保留记录，将资源转向后续大任务。本记录后不再继续修改或补齐题目。

工作树：`/tmp/think-master-systems-calibration-20261104`，分支 `codex/master-systems-calibration`，基线 `4c5e25e`。范围原定为并发9、消息11、网络11、测试9，共40题。未更改官方revision/sourceCommit、index、chapters或其余章节。

## 已完成并提交：20题

- `8b0a0d5`：并发9题。`oversell-race`、`idempotent-fail`、`msg-order`、`false-lead`、`pool-deadlock`、`lock-expiry`、`threadlocal-leak`、`pool-rejection`、`callback-mismatch`。
- `7dd4eaa`：消息前6题。`mq-lost`、`mq-duplicate`、`mq-dlq`、`mq-delay`、`mq-slowpart`、`partition-split`。
- `ffe5937`：消息后5题。`mq-bus-review`、`rebalance-storm`、`replay-surge`、`mq-disk`、`mq-dualwrite`。

以上20题均已逐读事实/因果、核定必要成本、记录六维原文依据、两条可玩路径与停止点。最后完成批次的20题validate、真实CasePayload/schema和check_case均通过；工兵首4题基线保持不变；大师语义与首4题回归共38项通过，40条路径实际调用computeGrade并检查最终假设状态。L2噪声1条、L3噪声3条，均在两条路径内收线。

已做最小无害探针：Node内置HTTP在127.0.0.1临时端口验证Agent每origin与maxTotalSockets语义；直接执行题内闭包片段复现错配；直接执行题内delay公式复算13/8/5分钟提前。运行Node版本为22，未冒称在Node18或真实生产网络完成端到端验收。其余协议事实参考官方文档，案例为技术机制教学重建。

编审资料：

- `content/baselines/t04b-master-systems-calibration.md`
- `content/baselines/t04b-master-systems-cases.json`
- `content/baselines/t04b-master-systems-semantic.test.mjs`

## 未提交WIP：3题，不能算已验收

`tcp-retrans`、`h2-hol`、`cdn-penetration`已做第一轮正文修订，但尚未补完整噪声/六维原文锚点、全量摘要复核和本批validate/schema/gate/回归，保留为未提交草稿。

当前这4个文件有未提交变更：

- `app/data/cases/tcp-retrans.ts`
- `app/data/cases/h2-hol.ts`
- `app/data/cases/cdn-penetration.ts`
- `content/baselines/t04b-master-systems-cases.json`

注意：上述JSON由工作脚本提前将这3题写成`status: calibrated`，仅是WIP生成状态，不构成完成验收。本暂停记录优先说明其真实状态；未为勉强收尾而再改正文或基线。Markdown编审仍停留在已完成20题。

WIP方向仅供未来接续：TCP探测1421+28=1449不能证明超过1450；HTTP/2慢业务流不等于TCP字节缺口HOL；缓存键唯一率U/N不能直接当命中率，忽略参数前还需确认响应内容恒定。这些WIP仍需独立复核，不能当成已交付结果。

## 尚未改动：17题

网络8题：`proxy-headers`、`idle-reset`、`nagle-ack`、`happy-eyeballs`、`bandwidth-hog`、`ndots-trap`、`mtu-blackhole`、`geo-stale`。

测试9题：`coverage-illusion`、`mock-leak`、`flaky-test`、`env-drift`、`loadtest-illusion`、`testing-review`、`env-contention`、`env-inherit`、`capacity-assumption`。

其中网络前3题已读原文，仅形成待核实研究线索，未改文件；其余仍停留在清单核实。工作区没有运行中的校准命令或外部付费请求。

## 恢复时的边界

只有用户重新授权恢复题库后再继续。先审阅以上20题提交和3题WIP，不把JSON的提前状态当成全量完成；不丢弃WIP，也不重写其他代理负责的章节。测试命令是：

```sh
node --test content/baselines/t04b-master-systems-semantic.test.mjs content/baselines/t04a-semantic.test.mjs
node content/pipeline/baseline.mjs --check
```

本次暂停后转向T14/T07学习事件与游客归属真实验收，题库暂不继续。
