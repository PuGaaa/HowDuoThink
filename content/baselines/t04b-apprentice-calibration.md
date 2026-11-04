# T04B 学徒篇剩余23题校准记录

日期：2026-11-04。初始内容基线：38d3b2409fa0bcfc446f4955a89b74ad5a6fe911。本批只修改学徒篇剩余23题，排除已完成的首批四题，不修改章节与注册表。

当前完成 15/23。未完成题继续明确标记pending，不冒充已校准。校准指技术依据、证据关系、假设效应、停止点与评分审阅；不代替主实施流程的正式页面验收。

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
| build | white-screen | 1 | 1 | calibrated |
| build | dep-hell | 1 | 1 | calibrated |
| build | ci-cache-pollution | 2 | 2 | calibrated |
| build | image-tag-drift | 2 | 2 | calibrated |
| build | buildtime-inject | 2 | 2 | calibrated |
| build | chunk-overlap | 2 | 2 | calibrated |
| build | pipeline-review | 2 | 2 | calibrated |
| error-reading | symptom-cluster | 2 | 2 | calibrated |
| error-reading | first-domino | 3 | 2 | calibrated |
| integration | field-mismatch | 1 | 1 | calibrated |
| integration | cookie-lost | 2 | 2 | calibrated |
| integration | waterfall-read | 2 | 2 | calibrated |
| integration | poll-storm | 2 | 2 | calibrated |
| integration | mock-canyon | 2 | 2 | calibrated |
| integration | tri-platform | 3 | 2 | calibrated |

## white-screen

训练目标：区分模块加载与运行时错误，核对制品和响应。

修正：

- 移除404脚本必被当HTML执行的矛盾。
- CDN没有缓存旧资源清单这一无依据机制被删除。
- 区分完整构建正常和发布漏传。
- 修正接口未发起却全部200的叙述。

六维：1/1/1/1/2/1，L1。逐维原文依据：

1. a-resources直接显示缺JS与HTML响应。
2. 状态/MIME/字节直接记录。
3. 模块加载基础规则。
4. 结论与响应类型一致。
5. 构建、发布与浏览器两边。
6. 入门关无需危险陷阱。

路径与评分：

- 标准路径：a-impact → a-console → a-resources，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-resources → a-console，4⚡；使用真实computeGrade，零错误为S。

停止条件：新入口缺文件、源站200HTML回退及模块MIME拒绝共同闭合。

终局确认：h-res；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-single-module-script)。
- [官方资料2](https://vite.dev/guide/build)。
- [官方资料3](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files)。

## dep-hell

训练目标：用公开API和实际依赖图验证安装漂移。

修正：

- 移除不存在的Day.js1.12 API删除叙述。
- 采用有公开依据的Lodash3pluck与4map。
- 不把minor升级移除API作为正常semver规则。
- 区分代码不同与依赖契约不适配，给出单变量对照。

六维：1/2/1/1/1/1，L1。逐维原文依据：

1. pluck与实际major差异直给。
2. 同源码只换图的对照。
3. 基础安装与API使用。
4. 结论与版本变化一致。
5. 同一前端构建层。
6. 无L2危险要求。

路径与评分：

- 标准路径：a-impact → a-coderead → a-diff → a-lockfile，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-diff → a-lockfile → a-coderead，4⚡；使用真实computeGrade，零错误为S。

停止条件：同文件、同环境、不同依赖图与锁状态及单变量对照闭合。

终局确认：h-lock；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://lodash.com/docs/3.10.1#pluck)。
- [官方资料2](https://lodash.com/docs/4.17.21#map)。
- [官方资料3](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#dependencies)。
- [官方资料4](https://docs.npmjs.com/cli/v10/commands/npm-ci)。

## ci-cache-pollution

训练目标：区分CI通过与关键用例真实执行。

修正：

- 修复生产包含calcDiscount却报该函数不存在的自相矛盾。
- 补齐恢复后跳npm ci与用例skip机制。
- 固定key不再被说成永不失效。
- 标准4，避免把修复后的未来结果当停止前已知。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. 缓存顺序与skip机制组合。
2. 只改安装步骤的对照。
3. 锁、缓存与测试执行语义。
4. 绿色来自跳过而非验证。
5. CI依赖与生产制品。
6. 旧目录恢复后跳安装。

路径与评分：

- 标准路径：a-impact → a-depdiff → a-cacheconf，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-cacheconf → a-depdiff，4⚡；使用真实computeGrade，零错误为S。

停止条件：关键用例状态、依赖图及恢复后跳安装的执行顺序与对照闭合。

终局确认：h-cache；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://docs.npmjs.com/cli/v10/commands/npm-ci)。
- [官方资料2](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md)。

## image-tag-drift

训练目标：用对象身份与Pod启动记录核实镜像漂移。

修正：

- 修正latest默认策略与建集群默认的错误。
- 补齐真实Pod重建触发。
- 删除IfNotPresent永不更新、Always零成本等绝对叙述。
- 同类普查移出标准定位成本。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. 实际对象、模板与缓存事件组合。
2. 同平台digest与制品对照。
3. Kubernetes拉取及滚动机制。
4. 部署成功不代表修复已到达。
5. CI、仓库与节点。
6. 只重建仍复用缓存。

路径与评分：

- 标准路径：a-impact → a-pullpolicy → a-imageinspect，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-imageinspect → a-pullpolicy，4⚡；使用真实computeGrade，零错误为S。

停止条件：同平台镜像身份、显式策略与启动事件、制品内容对应。

终局确认：h-taglatest；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://kubernetes.io/docs/concepts/containers/images/)。

## buildtime-inject

训练目标：从实际读者定位构建变量与运行时配置断点。

修正：

- 不再声称本地永远无法复现。
- 从代码读者与实际URL排除错误层。
- 运行时注入不被说成必须或自动即时生效。
- 最短修复为补齐构建输入重新发布。

六维：2/2/2/2/1/2，L2。逐维原文依据：

1. 读者、构建输入和包身份组合。
2. 开发配置与本次构建对照。
3. 构建静态替换。
4. 配置改了但无运行时读者。
5. 同一构建链路。
6. 覆盖同hash破坏身份。

路径与评分：

- 标准路径：a-impact → a-bundlecheck → a-cdncheck，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-cdncheck → a-bundlecheck，4⚡；使用真实computeGrade，零错误为S。

停止条件：构建输入、实际读取阶段与分发身份一致指向旧默认值内联。

终局确认：h-inline；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://vite.dev/guide/env-and-mode)。

## chunk-overlap

训练目标：区分发布空窗与持续断引用并验证精确URL。

修正：

- 删除旧hash不会在新包解压完成后自动恢复。
- 保留旧目录与旧URL可访问分别说明。
- 不把ln -sfn或24h一律当充分方案。
- 标准5由四项必要证据组成，非机械保留旧基准4。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. 删除与新旧引用联合推断。
2. 发布中/结束后的同URL对照。
3. hash、路由与原子替换机制。
4. 发布结束旧页仍失败。
5. 部署到旧浏览器请求。
6. 维护页仍有旧页请求。

路径与评分：

- 标准路径：a-impact → a-deploylog → a-assetname → a-edgecheck，5⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-edgecheck → a-deploylog → a-assetname，5⚡；使用真实computeGrade，零错误为S。

停止条件：具体旧URL、删除记录与同URL保留对照支持持续断引用。

终局确认：h-window；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://vite.dev/guide/build)。
- [官方资料2](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files)。
- [官方资料3](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html)。

## pipeline-review

训练目标：区分评审的独立缺口与已治理条件。

修正：

- 把真实缓存风险从错误根因改为完整正确决策的一部分。
- 不将所有自动合并或并行化笼统定罪。
- 自建跨项目缓存与GitHub默认作用域分清。
- 补齐并行和指纹核对，标准7与完整评审所需证据一致。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. 审批、缓存与隔离多项材料对照。
2. 方案与实际job记录。
3. 来源、hash与权限机制。
4. 功能绿不证明依赖可信。
5. CI与共享服务边界。
6. 跳过既定审批是主动风险。

路径与评分：

- 标准路径：a-supply → a-botpath → a-cache → a-parallel → a-keyfix，7⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-supply → a-cache → a-botpath → a-keyfix → a-parallel，7⚡；使用真实computeGrade，零错误为S。

停止条件：既定审批、实际缓存权限、并行隔离与保留指纹全部核对后给完整有条件结论。

终局确认：h-bot；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions)。
- [官方资料2](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)。
- [官方资料3](https://slsa.dev/spec/v1.0/requirements)。

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

## field-mismatch

训练目标：解释成功响应为何被前端过滤为空。

修正：

- 补齐真正隐藏行的过滤条件，读错字段不再被说成必然空表。
- 分开网络真实响应与消费代码两份必要证据，标准4。
- 允许先读代码再核对响应，两种顺序都在证据齐全后停止。

六维：1/1/1/1/2/1，L1。逐维原文依据：

1. a-netpanel「12行的user_id全为undefined」直给。
2. 响应与过滤代码同屏。
3. undefined与filter是基础语义。
4. 症状与常见字段错位一致。
5. 接口与页面两个消费边界。
6. 无危险陷阱。

路径与评分：

- 标准路径：a-impact → a-netpanel → a-responsebody，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-responsebody → a-netpanel，4⚡；使用真实computeGrade，零错误为S。

停止条件：非空响应、业务分支与错误字段过滤解释全部症状。

终局确认：h-field；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter)。
- [官方资料2](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Property_accessors)。

## cookie-lost

训练目标：区分跨源凭证模式、同站属性和CORS。

修正：

- 由三种缺陷同时confirmed改成单一根因。
- 明确HTTPS同站跨源，移除跨源必None与Secure等绝对结论。
- 完整头与七天有效期一致。
- 标准4且核对独立条件。

六维：2/2/2/2/2/1，L2。逐维原文依据：

1. 代码与只改include的对照。
2. 完整头、存储面板与站点关系对比。
3. same-origin/include与SameSite机制。
4. Set-Cookie可见不等于保存。
5. 浏览器请求与API响应边界。
6. 代理回退掩盖验收。

路径与评分：

- 标准路径：a-impact → a-cookiedetail → a-fetchcode，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-fetchcode → a-cookiedetail，4⚡；使用真实computeGrade，零错误为S。

停止条件：默认凭证模式与只改include的对照成立，其他条件逐项排除。

终局确认：h-credentials；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)。
- [官方资料2](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)。
- [官方资料3](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)。

## waterfall-read

训练目标：分清代理、连接、TTFB与服务端处理时间。

修正：

- 移除3次握手等于3RTT的算术。
- 不再无证据假定浏览器逐级在线OCSP。
- 改用明确代理协商记录，分段总和3秒。
- 说明TTFB不等于后端日志耗时。

六维：2/2/2/2/2/1，L2。逐维原文依据：

1. Timing与独立代理记录组合。
2. 同条件仅恢复lookup的对照。
3. 代理、TCP/TLS与TTFB边界。
4. 后端120ms与客户端3秒并不冲突。
5. 浏览器、代理与服务端两跳。
6. 回滚相邻证书变更不修代理等待。

路径与评分：

- 标准路径：a-impact → a-waterfall → a-repro，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-repro → a-waterfall，4⚡；使用真实computeGrade，零错误为S。

停止条件：Timing、CONNECT目录等待和单变量对照相互印证。

终局确认：h-connect；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://developer.chrome.com/docs/devtools/network/reference/#timing-explanation)。
- [官方资料2](https://www.rfc-editor.org/rfc/rfc9110.html#name-connect)。

## poll-storm

训练目标：按调度器生命周期与正确单位核算前端负载。

修正：

- 纠正每分钟误记QPS的60倍错误。
- 负载640确实超过同条件500，清理后46。
- 删掉后台一律一分钟与ETag减少请求数/容量必增十倍。
- 区分主因与背景，不将真实放大器强标错误根因。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. 定时器计数与负载复测组合。
2. 清理前640/清理后46对照。
3. interval清理和排队容量。
4. 人不操作不代表页面停止。
5. 浏览器、网关与后端。
6. 回滚不清理已开SPA。

路径与评分：

- 标准路径：a-impact → a-timeraudit → a-backendlog，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-backendlog → a-timeraudit，4⚡；使用真实computeGrade，零错误为S。

停止条件：定时器数量、640/46QPS算术及容量复测闭合。

终局确认：h-timer；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://vuejs.org/api/composition-api-lifecycle#onunmounted)。
- [官方资料2](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)。
- [官方资料3](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag)。

## mock-canyon

训练目标：核实验证对象、单位换算与真实协议。

修正：

- 修正880/8.80/0.088换算方向。
- 不虚构真实供应商v2换单位。
- 47%明确为路径占比。
- 沙箱同provider同SDK，mock仅隔离单测。
- 移除过期自动摘mock连生产的隐患。

六维：2/2/2/2/2/2，L2。逐维原文依据：

1. 原始输入与÷100代码对账。
2. mock/真实同金额输入对照。
3. 协议、签名、幂等职责。
4. 联调全绿反而隐藏适配器错。
5. 测试依赖到结算流水。
6. 回滚错误模板会隐藏缺陷。

路径与评分：

- 标准路径：a-impact → a-mockcheck → a-gatewaychangelog，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-gatewaychangelog → a-mockcheck，4⚡；使用真实computeGrade，零错误为S。

停止条件：输入换算、稳定协议与真实SDK沙箱样本对应，签名和结算次数无异常。

终局确认：h-mock；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://martinfowler.com/articles/mocksArentStubs.html)。
- [官方资料2](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Division)。

## tri-platform

训练目标：按客户端与规则对照验证共享发布影响。

修正：

- 改正部署22点与07点启用时刻矛盾。
- 移除无前提巧合概率。
- 握手前改成TLS协商阶段。
- 不把重新开放TLS1.0作为默认修复。
- 实际六维仅一项3、中位数2，降为L2。

六维：2/2/2/2/3/2，L2。逐维原文依据：

1. 规则与三种症状单跳对照。
2. 逐端只改一项的演练。
3. Referer/Origin/TLS领域机制。
4. 客户端未变也会暴露兼容缺口。
5. 三端与网关策略跨边界。
6. 整体回滚伴随明确安全取舍。

路径与评分：

- 标准路径：a-impact → a-policydiff → a-cointoss，4⚡；使用真实computeGrade，零错误为S。
- 替代顺序：a-impact → a-cointoss → a-policydiff，4⚡；使用真实computeGrade，零错误为S。

停止条件：同策略版本的规则命中与逐端单变量演练支持共享变更归因。

终局确认：h-policy；其余候选在两条路径中均排除。

技术依据：

- [官方资料1](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)。
- [官方资料2](https://www.rfc-editor.org/rfc/rfc8996.html)。
- [官方资料3](https://staticintl.cloudcachetci.com/doc/pdf/product/pdf/1219_57657_en.pdf)。

## 验证

`node --test content/baselines/t04b-apprentice-semantic.test.mjs`校验已完成题的哈希、目录保持、六维取整、双路径、假设终态、实际评级和已知关键事实。每批另跑案例validate、原T04A基线及目录检查，并用Python CasePayload和gate交叉验证；剩余pending题不计完成。
