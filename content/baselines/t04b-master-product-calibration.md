# T04B 大师篇四章35题校准

日期：2026-11-04。起点：4c5e25e4395786860988bcf850c5da9f48347def。范围：observability8、security8、evolution8、deployment11。当前完成8/35。false-lead实际归concurrency，不在本批所有权。

仅正文、假设效应、专家路径、成本与六维校准；不修改题ID、目录顺序、正式contentRevision/sourceCommit或注册表。所有事故按真实技术机制教学重建，数值和日志样本不是生产实测原件。六维中位数半档向下取整，至少两维L3是L3必要条件；大师每章首关≤L2，不为保留篇名造难度。

## 完整清单

|章|ID|原难度|当前难度|状态|
|---|---|---:|---:|---|
|deployment|bg-split|2|2|pending|
|deployment|flag-leak|2|2|pending|
|deployment|mixversion|2|2|pending|
|deployment|cdn-stale|3|3|pending|
|deployment|deploy-migration|2|2|pending|
|deployment|rollback-drift|3|3|pending|
|deployment|graceful-shutdown|2|2|pending|
|deployment|warmup-storm|3|3|pending|
|deployment|config-drift|2|2|pending|
|deployment|probe-mismatch|2|2|pending|
|deployment|wrong-env|2|2|pending|
|evolution|rate-limit-passthrough|2|2|pending|
|evolution|fallback-drill-fail|3|3|pending|
|evolution|retry-storm|2|2|pending|
|evolution|hpa-lag|3|3|pending|
|evolution|distributed-monolith|3|3|pending|
|evolution|api-sunset|2|2|pending|
|evolution|capacity-review|3|3|pending|
|evolution|rule-sprawl|2|2|pending|
|observability|log-sampling|2|2|calibrated|
|observability|avg-metric|2|2|calibrated|
|observability|alert-storm|2|2|calibrated|
|observability|histogram-bucket|2|3|calibrated|
|observability|metrics-review|3|2|calibrated|
|observability|error-budget|3|3|calibrated|
|observability|cardinality-blast|2|3|calibrated|
|observability|trace-break|2|2|calibrated|
|security|leaked-keys|1|1|pending|
|security|idor-orders|2|2|pending|
|security|log-pii|2|2|pending|
|security|ssrf-internal|2|2|pending|
|security|withdraw-race|3|3|pending|
|security|supply-poison|3|3|pending|
|security|xss-decision|3|3|pending|
|security|sqli-sort|2|2|pending|

## log-sampling

训练目标：本地ERROR到中央索引的覆盖缺口。

修正：

- 纠正WARN吞ERROR的级别逆序。
- 独立入口索引与应用错误索引分开，不再既0条又查到INFO。
- 将唯一原因改新路径不匹配旧glob，逐笔本地ERROR排除未输出/未报错。
- 标准1+2+1=4，实际购买路径配置证据。
- 支付成功与回调失败分开，重放须按已核对状态与幂等键。

六维：2/2/2/2/3/2，L2。原文依据：

1. “入口500→本地ERROR→路径不匹配”两步收敛。
2. “本地有而中央无”及新旧glob对照。
3. “WARN允许ERROR”与filestream路径是领域机制。
4. “心跳正常”不等于文件覆盖完整。
5. 入口日志、应用文件、采集器与索引跨系统核对。
6. “重部署统一ERROR级别”有状态代价却不修漏采。

路径与真实评级：

- 标准路径：a-impact → a-hostdiff → a-sampleconf，4⚡；项目真实computeGrade零错为S。
- 替代顺序：a-impact → a-sampleconf → a-hostdiff，4⚡；项目真实computeGrade零错为S。

停止点：停止中央日志缺口诊断；灰度补正确采集路径并以测试事件验收到达，同时按业务账和原幂等键处理未完成回调，不把RPC超时日志当下游根因已查明。

终局：h-host确认，其余假设两路径均排除。

技术依据：

- [一手资料1](https://logging.apache.org/log4j/2.x/manual/customloglevels.html)。
- [一手资料2](https://www.elastic.co/docs/reference/beats/filebeat/filebeat-input-filestream)。

## avg-metric

训练目标：同口径均值/分位算术与慢组因果。

修正：

- 将10%五秒却均值80的矛盾改成0.5%5055ms、99.5%55ms，重算P99/P99.9。
- 明确受控完成请求分母，生产取消另记。
- 不把缺keepalive等同跨机房握手固定5秒，改明确废弃主地址与5秒连接超时。
- 唯一正确假设与三个根因选项对应，平均值掩盖不再又成立又错误。
- 标准必须购买配置/对照动作，真实成本6而非原5。

六维：2/3/2/2/2/3，L2。原文依据：

1. 分布到组归属再到地址差异与单变量对照。
2. “9950×55+50×5055”及最近秩需量化对账。
3. 均值/分位和代理连接超时为领域机制。
4. P99也可能漏0.5%尾部，方向对但分位选择细节错。
5. 客户端到网关再到上游连接阶段跨两跳。
6. “摘慢组恢复”看似根因已明，实际只隔离范围。

路径与真实评级：

- 标准路径：a-impact → a-histogram → a-nodelist → a-gwconf，6⚡；项目真实computeGrade零错为S。
- 替代顺序：a-impact → a-nodelist → a-histogram → a-gwconf，6⚡；项目真实computeGrade零错为S。

停止点：完成分布算术、实例归属、连接阶段与单变量修复核验，停止诊断；保留均值并补适合0.5%尾部的延迟阈值比例/更高分位及分组告警。

终局：h-node确认，其余假设两路径均排除。

技术依据：

- [一手资料1](https://sre.google/sre-book/monitoring-distributed-systems/)。
- [一手资料2](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_connect_timeout)。

## alert-storm

训练目标：通知设计、送达与响应的可证据复盘。

修正：

- 区分1条主库规则与32次通知，23:20至01:55共32次，171分钟不当保证可救窗口。
- 不再把固定阈值、响应率或个人处分泛化成必然事故/心理因果。
- 原两个真实原因互判错误，改完整系统结论与三个有明确错误的替代。
- 专家链实际购买响应与能力核验，成本7而非原9。
- 移除523到3、380到4和处分后离职等无证据精确预言。

六维：2/2/2/2/3/3，L2。原文依据：

1. 需将通知结构、回执与响应记录合并判断。
2. 实际路由和同输入回放为对比证据。
3. Alertmanager路由/分组/确认升级是领域机制。
4. 到群不等于阅读，响应率也不单独给因果。
5. 通知系统、人员runbook与组织响应跨职能。
6. “只换人”“主因报警后全抑制”看似简化却留下缺口。

路径与真实评级：

- 标准路径：a-impact → a-timeline → a-rules → a-response → a-skill，7⚡；项目真实computeGrade零错为S。
- 替代顺序：a-impact → a-rules → a-skill → a-response → a-timeline，7⚡；项目真实computeGrade零错为S。

停止点：停止本轮归因，修分组/路由/确认升级并验证独立故障不被误抑制；保留事件证据与具体责任核查，不宣称任何人必然漏或系统改进保证零遗漏。

终局：h-design确认，其余假设两路径均排除。

技术依据：

- [一手资料1](https://sre.google/sre-book/monitoring-distributed-systems/)。
- [一手资料2](https://prometheus.io/docs/alerting/latest/alertmanager/)。

## histogram-bucket

训练目标：经典累计桶分位边界与越界比例。

修正：

- 100ms封顶不可能独立推出45ms，统一改0.1秒读数并给真实累计计数。
- 纠正最高桶返回规则：+Inf落点返回次高上界.1，不是75ms。
- 纠正+Inf/count为尾部比例的错误，用差值70%。
- 补同请求集合、单位、实际PromQL及未丢样证据。
- 四必要动作1+2+1+1=5，两路径真实S；按量化/反直觉/陷阱四维3得到L3。

六维：2/3/3/3/2/3，L3。原文依据：

1. 集合对齐后按累计计数判断落桶与查询行为。
2. “990落入(.1,+Inf]”和“(1000-300)/1000”量化对账。
3. 经典桶顶桶特殊规则与累计计数是反直觉机制。
4. “全量已记入”却仍无法量出尾部，直觉方向反转。
5. 服务端计时到指标查询与大盘两跳。
6. “+Inf占比”看似合理却恒等总量，通报健康会追认错误测量。

路径与真实评级：

- 标准路径：a-impact → a-bucket → a-sample → a-calc，5⚡；项目真实computeGrade零错为S。
- 替代顺序：a-impact → a-sample → a-calc → a-bucket，5⚡；项目真实computeGrade零错为S。

停止点：停止；重设覆盖SLO与尾部的桶并回放验证估计误差，用+Inf减最高有限桶监测越界，继续独立调查实际结算慢因，不将修尺子等同修性能。

终局：h-bucket确认，其余假设两路径均排除。

技术依据：

- [一手资料1](https://prometheus.io/docs/prometheus/latest/querying/functions/#histogram_quantile)。
- [一手资料2](https://prometheus.io/docs/practices/histograms/)。

## metrics-review

训练目标：检测覆盖与可行动风险的完整评审。

修正：

- 原h-template与h-p1均真却只能选其一，改完整结论与不充分替代。
- 分清历史事故后补lag与后续同类负载回放，不伪造当时已有指标。
- CPU25%解释为四核中单线程占1核，应用最终200与客户端预算分开。
- 不称跨层信息永不相交或历史指标永不得退役。
- 首步真实1，必要四证据成本5；中位数半档向下为L2，原L3不硬保。

六维：2/3/2/2/3/3，L2。原文依据：

1. 回放覆盖与路由时限两缺口合成完整结论。
2. “940/1000、净增5/分钟、处置5分钟”量化时限。
3. event loop lag、用户SLO与资源聚合属领域机制。
4. 应用最终200并不代表用户未超预算。
5. 客户端SLO/应用调度/资源预测及值班组织跨职能。
6. “标准化全退专项”“只保lag即可”均看似合理却缺独立条件。

路径与真实评级：

- 标准路径：a-template → a-p1 → a-retire → a-handover，5⚡；项目真实computeGrade零错为S。
- 替代顺序：a-template → a-handover → a-retire → a-p1，5⚡；项目真实computeGrade零错为S。

停止点：停止评审，要求补端到端SLO与经验证专项覆盖、按处置时限修风险路由；以等价回放决定退役，保留已验证交接，不把任一项真实风险当错误答案。

终局：h-template确认，其余假设两路径均排除。

技术依据：

- [一手资料1](https://sre.google/sre-book/monitoring-distributed-systems/)。
- [一手资料2](https://prometheus.io/docs/alerting/latest/alertmanager/)。
- [一手资料3](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)。

## error-budget

训练目标：预算口径、冻结政策与可靠性修复并行决策。

修正：

- 删除本月剩20天却已发生D22事故的时间矛盾，改滚动窗口。
- 冻结不能自动修测试不等于无效；正确行动遵守冻结并修根因。
- 真实风险不再互判错误，候选改完整行动与明确错误替代。
- 外部依赖仍计入既定端到端预算，移除不可控就不用处理。
- 必要五动作1+2+1+1+1=6，移除覆盖92%保证回归归零及未来精确SLO预言。

六维：2/3/2/3/3/3，L3。原文依据：

1. 区间归因、验证缺口和既定政策合并行动。
2. “43200×.001=43.2；32+9+6.3=47.3”及67.7%量化。
3. 时间型SLI、集成回归和发布例外属领域机制。
4. “冻结不治根所以无效”把正确治理方向反转。
5. 业务大促/发布治理/基础设施/支付依赖跨职能。
6. “外部不计预算”“补测试替代冻结”均看似合理却绕契约。

路径与真实评级：

- 标准路径：a-impact → a-regbreak → a-infrabreak → a-thirdbreak → a-freeze，6⚡；项目真实computeGrade零错为S。
- 替代顺序：a-impact → a-freeze → a-thirdbreak → a-infrabreak → a-regbreak，6⚡；项目真实computeGrade零错为S。

停止点：停止争论，执行已批准的新需求冻结和受控修复例外，补已知回归与韧性验证；恢复前复核预算与门禁，不承诺覆盖率或一周冻结可消除未来回归。

终局：h-regression确认，其余假设两路径均排除。

技术依据：

- [一手资料1](https://sre.google/workbook/error-budget-policy/)。
- [一手资料2](https://sre.google/sre-book/service-level-objectives/)。

## cardinality-blast

训练目标：高基数真实组合、内存模型与恢复边界。

修正：

- 修120万×8×40误算100倍，区分理论3.84亿与实际新增220万。
- 将8GiB成功驻留4.2亿的不可能状态改420万头部、限定RSS增量对照。
- 补抓取/保留/查询三候选真实购买证据，标准成本6而非原4。
- drop整指标阻止新输入，不承诺存量head/历史即时清除，避免labeldrop合并冲突。
- 移除日志trace零成本和固定基数普适红线，保留平台测量边界。

六维：2/3/3/3/3/3，L3。原文依据：

1. 变更、实际序列、增量模型及输入对照合并判断。
2. “120万×8×40=3.84亿；220万×1.5KiB≈3.15GiB”量化。
3. head/WAL与labeldrop冲突属于反直觉存储语义。
4. “drop/重启立即回落”可能重放或存量仍在，直觉相反。
5. 业务指标定义、采集、时序存储和排查需求跨系统。
6. “哈希标签”“直接drop维度/删目录”看似简化却留下错误。

路径与真实评级：

- 标准路径：a-impact → a-seriescount → a-scrapeintv → a-retentioncfg → a-queryload，6⚡；项目真实computeGrade零错为S。
- 替代顺序：a-impact → a-scrapeintv → a-retentioncfg → a-queryload → a-seriescount，6⚡；项目真实computeGrade零错为S。

停止点：停止根因收集；先禁错误指标输入、保留数据与现场，再按存量head/WAL制定恢复。重设计有界聚合与受控明细检索，不把drop新输入误称立即清空历史。

终局：h-cardinality确认，其余假设两路径均排除。

技术依据：

- [一手资料1](https://prometheus.io/docs/practices/instrumentation/)。
- [一手资料2](https://prometheus.io/docs/prometheus/latest/storage/)。
- [一手资料3](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#metric_relabel_configs)。

## trace-break

训练目标：消息上下文、parent/link与采样的边界核验。

修正：

- 不以非标准parent_trace_id或新trace判定断链，纳入合法span links。
- 限定6×100样本，不将单条消息推成全部历史100%。
- 采样与传播分开，用明确100%导出回放排除，不虚构0.1%概率。
- 实际购买四证据1+2+1+1=5，不沿原4成本和未买agent证据。
- 不承诺SDK零改动、不强制敏感业务键baggage、不为追踪改同步。

六维：2/2/2/3/3/3，L2。原文依据：

1. 消息载荷、代码、导出与只补注入对照两步归因。
2. “未注入/仅补注入”与两端span对照。
3. TraceContext与消息parent/link为领域传播机制。
4. “新trace/缺parent”也可能是合法links，直觉反向。
5. 生产者/MQ/消费者/导出后端跨系统。
6. “改同步让trace连上”“默认全传baggage”看似修复却改依赖/隐私边界。

路径与真实评级：

- 标准路径：a-impact → a-msgheader → a-samplepolicy → a-asynccheck，5⚡；项目真实computeGrade零错为S。
- 替代顺序：a-impact → a-samplepolicy → a-msgheader → a-asynccheck，5⚡；项目真实computeGrade零错为S。

停止点：停止；修消息边界inject/extract，按单消息/批量语义验parent或links与采样。保留受控业务关联键，避免把原始敏感信息默认放baggage，不为追踪重写同步架构。

终局：h-context确认，其余假设两路径均排除。

技术依据：

- [一手资料1](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/)。
- [一手资料2](https://opentelemetry.io/docs/concepts/context-propagation/)。
- [一手资料3](https://www.w3.org/TR/trace-context/)。

## 验证口径

专属语义回归检查实际正文哈希、不可变ID/目录/修订来源、六维与双路径、逐步终局和真实computeGrade；逐章另跑案例validate、CasePayload/gate及本批独立TypeScript检查。pending不计为完成；UI与发布版本登记由主集成流程完成。

### 可观测性章阶段验收

8题内容validate零警告，8题CasePayload/gate均无问题，本章独立TypeScript检查通过；当前全量内容管线/基线Node测试102项通过。本章16条记录路径均使用真实computeGrade获得S，所有错误假设在两条路径终局均被排除。已完成编审自查，不冒充正式UI或生产事故复现。
