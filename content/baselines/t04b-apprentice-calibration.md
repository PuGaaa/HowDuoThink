# T04B 学徒篇剩余23题校准记录

日期：2026-11-04。初始内容基线：38d3b2409fa0bcfc446f4955a89b74ad5a6fe911。本批只修改学徒篇剩余23题，排除已完成的首批四题，不修改章节与注册表。

当前完成 2/23。未完成题继续明确标记pending，不冒充已校准。校准指技术依据、证据关系、假设效应、停止点与评分审阅；不代替主实施流程的正式页面验收。

全部场景按真实技术机制进行教学重建，数值、业务公司与日志样本不冒充生产实测或原始工单。六维中位数半档向下取整，不因结业位置硬标L3；来源与正式内容修订号由主发布流程统一处理，本记录不自造contentRevision。

## 清单

| 章节 | ID | 原难度 | 当前难度 | 状态 |
|---|---|---:|---:|---|
| access | dns-hijack | 2 | 2 | pending |
| access | ssl-chain-missing | 2 | 2 | pending |
| access | cors-101 | 1 | 1 | pending |
| access | nginx-trap | 2 | 2 | pending |
| access | gateway-review | 2 | 2 | pending |
| access | ws-upgrade | 2 | 2 | pending |
| access | cert-sni | 2 | 2 | pending |
| access | canary-decision | 3 | 3 | pending |
| build | white-screen | 1 | 1 | pending |
| build | dep-hell | 1 | 1 | pending |
| build | ci-cache-pollution | 2 | 2 | pending |
| build | image-tag-drift | 2 | 2 | pending |
| build | buildtime-inject | 2 | 2 | pending |
| build | chunk-overlap | 2 | 2 | pending |
| build | pipeline-review | 2 | 2 | pending |
| error-reading | symptom-cluster | 2 | 2 | calibrated |
| error-reading | first-domino | 3 | 2 | calibrated |
| integration | field-mismatch | 1 | 1 | pending |
| integration | cookie-lost | 2 | 2 | pending |
| integration | waterfall-read | 2 | 2 | pending |
| integration | poll-storm | 2 | 2 | pending |
| integration | mock-canyon | 2 | 2 | pending |
| integration | tri-platform | 3 | 3 | pending |

## symptom-cluster

训练目标：用共享输入与对照验证多症状归一。

修正：

- 移除无依据的十亿分之一概率。
- 修复布尔键被当整数解析的语义。
- 去掉返回后的配置函数仍必在栈底、三个不同jar哈希应相同等错误。
- 标准链保留对照动作，不把防线计划当定位证据。

六维：2/2/2/2/2/1，L2。逐维原文依据：

1. 需将共享键与三种消费路径对照，a-originstamp。
2. 相同输入与只补键的对照，a-cointoss。
3. null解引用、整数解析与配置契约。
4. 同秒只作线索，需撤键复现。
5. 配置到三个独立服务。
6. 重启缺键不恢复。

路径与评分：

- 标准路径：a-impact → a-originstamp → a-cointoss，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-cointoss → a-originstamp，4⚡；使用真实computeGrade，零错误为S。

停止条件：同一缺失值、三条代码路径、只补该键的对照闭合。

终局确认：h-onecause；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Integer.html#parseInt(java.lang.String))。
- [官方资料2](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Throwable.html#getStackTrace())。

## first-domino

训练目标：用事前事件和请求传播恢复错误风暴。

修正：

- 改正SQL执行超时与借连接超时混称。
- 补齐错误与调用传播方向。
- 移除抽查100条证明全量的结论。
- 六维中位数为2，不因结业皮肤维持L3。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. 需回查超时前30秒等待及SQL变更。
2. 分阶段与全量trace/retryOf对照。
3. 连接等待、查询计划与重试机制。
4. 第一条异常不等于首因。
5. 订单、数据库与下游两跳。
6. 重启扩容反而加数据库负载。

路径与评分：

- 标准路径：a-impact → a-firsterror → a-independence，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-independence → a-firsterror，4⚡；使用真实computeGrade，零错误为S。

停止条件：先行变更、资源占用、同请求传播和受控回放支持共同触发，独立磁盘告警另行核查。

终局确认：h-firstdomino；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-5.1.0/src/main/java/com/zaxxer/hikari/pool/HikariPool.java)。
- [官方资料2](https://dev.mysql.com/doc/refman/8.0/en/explain.html)。

## 验证

`node --test content/baselines/t04b-apprentice-semantic.test.mjs`校验已完成题的哈希、目录保持、六维取整、双路径、假设终态、实际评级和已知关键事实。每批另跑案例validate、原T04A基线及目录检查，并用Python CasePayload和gate交叉验证；剩余pending题不计完成。
