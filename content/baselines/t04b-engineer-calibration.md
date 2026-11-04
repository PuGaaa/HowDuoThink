# T04B 工兵篇逐题校准记录

范围为当前清单29题；不调整章节顺序、免费体验序列或发布修订号。原始版本98cc581。以下案例均为技术机制教学重建，日志与数值为教学样本，不是实际事故原始记录或生产性能实测。技术来源仅支持机制，不为虚构情境背书。

难度维度顺序：推理距离 / 证据形态 / 知识层次 / 反直觉度 / 跨层跨度 / 陷阱主动性；取中位数，半档向下。成本按定位必要证据人工裁定，修复与全仓制度审计不冒充已执行取证。两路径均逐动作运行真实computeGrade与假设终态规则。

## config-typo（config-boot/1）

学习目标：配置键对不上时，框架静默用默认值——生效断言要成为配置的习惯。

编审：保留4⚡：逐字对照2⚡+来源快照1⚡是必要证据，修复不计定位成本。去除题面答案及错误的默认未知键告警承诺。

难度：L1→L1；六维[1, 1, 1, 1, 1, 1]。

1. 30s症状→精确键对照；原文依据（a-keydiff）：“中心实际键：export.timeouts=120000”
2. 完整两行键名；原文依据（a-keydiff）：“中心实际键：export.timeouts=120000”
3. 显式占位符默认值；原文依据（a-keydiff）：“代码：@Value("${export.timeout:30000}")”
4. 默认值与30s直接吻合；原文依据（a-impact）：“小报表正常；大报表均在30s超时，调整前后相同。”
5. 同一应用配置绑定；原文依据（scene.architecture）：“配置中心(Nacos) → 报表服务(启动读取 @Value("${export.timeout}")) → 导出功能(大报表生成)”
6. 无危险试错动作；原文依据（a-impact）：“小报表正常；大报表均在30s超时，调整前后相同。”

标准路径：a-impact → a-keydiff → a-loadcheck，4⚡，零错S；终态确认h-typo，其余全部excluded。

替代路径：a-impact → a-loadcheck → a-keydiff，4⚡，零错S；终态确认h-typo，其余全部excluded。

停止点：【停止规则】精确键不匹配和默认值路径已确认，加载、覆盖、profile均有反证。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## boot-order（config-boot/2）

学习目标：启动成功必须有精确定义——核心依赖 fail-fast，非核心显式降级。

编审：保留4⚡，修正MQ依赖因果、三条WARN及缓存污染自相矛盾；区分核心监听与可降级预热。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 功能分组→初始化分支；原文依据（a-bootlog）：“01:05:12缓存预热读DB被拒绝；01:05:12监听器读DB订阅游标被拒绝，未执行MQ注册；01:05:13业务配置快照读DB被拒绝。”
2. 日志与代码交叉；原文依据（a-bootlog）：“01:05:12缓存预热读DB被拒绝；01:05:12监听器读DB订阅游标被拒绝，未执行MQ注册；01:05:13业务配置快照读DB被拒绝。”
3. 就绪契约与初始化；原文依据（a-bootlog）：“三个init的catch仅记录WARN后返回，无状态上报或重试；缓存失败分支没有写入空对象，样本键均不存在。01:05:14打印started。”
4. 端口正常而功能缺失；原文依据（a-impact）：“正常 ✓：下单/查询/支付回调（核心读写，运行时才建连接）”
5. 业务组件与DB时间窗；原文依据（scene.architecture）：“订单服务：缓存预热、订阅游标和业务配置快照均读取DB；监听器读到游标后才注册MQ消费。普通请求按需借DB连接。”
6. 重启恢复掩盖无重试；原文依据（a-danger）：“DB 已恢复，重启后全部组件初始化成功——功能"全部醒来"。”

标准路径：a-impact → a-bootlog → a-poolcheck，4⚡，零错S；终态确认h-swallow，其余全部excluded。

替代路径：a-impact → a-poolcheck → a-bootlog，4⚡，零错S；终态确认h-swallow，其余全部excluded。

停止点：【停止规则】启动失败被忽略且无重试已确认，缓存占位、池等待和旧地址均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## hot-reload-gap（config-boot/3）

学习目标：推送解决"送达"，不解决"生效"——热更新需要刷新语义。

编审：保留4⚡；以使用点核对替代非必要全仓审计，修复字段注解错误及自动刷新过度概括。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 送达→绑定→读取；原文依据（a-injectmode）：“本案自定义Nacos监听器只替换MapPropertySource；不发布刷新事件，也未调用ContextRefresher。”
2. 运行值+代码+对照；原文依据（a-injectmode）：“本案自定义Nacos监听器只替换MapPropertySource；不发布刷新事件，也未调用ContextRefresher。”
3. 单例与刷新作用域；原文依据（a-injectmode）：“中心与代码精确键均为risk.threshold；Environment.getProperty=80，普通单例Bean中@Value字段仍50。”
4. ACK成功仍旧值；原文依据（a-impact）：“中心值 80 ✓、ACK 12/12 ✓、运行值 50 ✗”
5. 配置监听与业务字段；原文依据（scene.architecture）：“配置中心(推送+ACK 回执) → 风控服务(@Value 注入 risk.threshold) → 风控决策”
6. 重启可暂时掩盖；原文依据（a-danger）：“8 分钟完成，阈值生效。”

标准路径：a-impact → a-injectmode → a-usageaudit2，4⚡，零错S；终态确认h-frozen，其余全部excluded。

替代路径：a-impact → a-usageaudit2 → a-injectmode，4⚡，零错S；终态确认h-frozen，其余全部excluded。

停止点：【停止规则】Environment与字段差异及刷新对照已确认，键错、二次缓存和业务缓存均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)、[官方资料2](https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons/application-context-services.html)。

## priority-clash（config-boot/4）

学习目标：同键多源要标明用途及实际覆盖来源，迁移入口时审计遗留值。

编审：保留4⚡，纠正环境变量映射、固定Nacos优先级和双confirmed；全仓审计移出必要定位路径。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 面板→来源→运行；原文依据（a-sourcecheck）：“当前实例Environment来源诊断（高→低）：systemEnvironment中的POOL_SIZE=20；本案Nacos PropertySource中pool.size=50；application.yml中pool.size=30。”
2. 有序来源与启动记录；原文依据（a-sourcecheck）：“当前实例Environment来源诊断（高→低）：systemEnvironment中的POOL_SIZE=20；本案Nacos PropertySource中pool.size=50；application.yml中pool.size=30。”
3. 绑定与优先级；原文依据（a-sourcecheck）：“标准环境变量映射POOL_SIZE→pool.size；三次受控启动均显示相同来源顺序和origin，最终池容量20。不是Nacos在所有版本/接入方式下都低于环境变量。键名匹配，加载顺序确定。”
4. 送达成功但未采纳；原文依据（a-impact）：“中心值 50 ✓（回执 12/12 送达 ✓）”
5. 部署环境到应用池；原文依据（scene.architecture）：“Spring Boot服务：环境变量、Nacos自定义PropertySource、本地yml均可提供pool.size；具体顺序由当前集成及配置决定。”
6. 再改高优先级来源掩盖治理；原文依据（a-danger）：“连接池 50 生效，大促预案落地。”

标准路径：a-impact → a-sourcecheck → a-runtimecheck，4⚡，零错S；终态确认h-priority，其余全部excluded。

替代路径：a-impact → a-runtimecheck → a-sourcecheck，4⚡，零错S；终态确认h-priority，其余全部excluded。

停止点：【停止规则】实际来源覆盖已确认，键错、随机顺序及未重启均有反证。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## profile-maze（config-boot/5）

学习目标：profile 分层合并的隐形差异——环境专属键必须显式盘点。

编审：保留4⚡；把注入/版本反证真正写入被执行动作，区分包内文件与部署外置文件。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 同输入→最终值→origin；原文依据（a-profilediff）：“最终配置与origin：dev/test的export.format=CSV，来自打包application.yml；prod为XLSX，来自部署侧外置application-prod.yml。”
2. diff与单变量复验；原文依据（a-profilediff）：“最终配置与origin：dev/test的export.format=CSV，来自打包application.yml；prod为XLSX，来自部署侧外置application-prod.yml。”
3. profile合并与外置配置；原文依据（a-profilediff）：“当前激活profile分别为dev/test/prod，符合部署意图。只在同构副本移除prod外置文件这一行、保持其他来源不变，输出变回CSV。”
4. 镜像同而行为不同；原文依据（a-impact）：“三个环境同一镜像digest；同输入在dev/test得到CSV，在prod得到XLSX。中心各环境均无export.format。”
5. 部署目录到应用输出；原文依据（scene.architecture）：“报表服务(配置三层合并: application.yml → application-{profile}.yml → 配置中心) ｜ 三环境：dev/test/prod”
6. 文件级回滚破坏其他合法项；原文依据（a-danger）：“export.format 消失了（行为回归 CSV）——但同文件里三个月内合法加入的 7 个键（容量参数/凭据轮换）也一并消失，”

标准路径：a-impact → a-profilediff → a-artifactcompare，4⚡，零错S；终态确认h-profile，其余全部excluded。

替代路径：a-impact → a-artifactcompare → a-profilediff，4⚡，零错S；终态确认h-profile，其余全部excluded。

停止点：【停止规则】外置profile差异及输出对照已确认，产物、版本、注入均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## boot-storm（config-boot/6）

学习目标：恢复期的惊群要有刹车——分批、爬坡、抽样预热。

编审：人工裁定必要成本6⚡（原4遗漏DB状态与探活反证），不因章尾保留L3；六维中位数2.5向下为L2。重写不可能的980/800与混合单位算式。

难度：L3→L2；六维[2, 3, 2, 3, 2, 3]。

1. 区分首场与恢复事件；原文依据（a-stormcurves）：“第一轮：50×20=1000次建连尝试，DB普通连接上限800。50×240=12000次预热查询在60秒内执行/尝试，平均200QPS；命中率12%（暖态97%），磁盘读取显著增多。”
2. 多曲线与单位核算；原文依据（a-stormcurves）：“第一轮：50×20=1000次建连尝试，DB普通连接上限800。50×240=12000次预热查询在60秒内执行/尝试，平均200QPS；命中率12%（暖态97%），磁盘读取显著增多。”
3. 连接和预热容量；原文依据（a-stormcurves）：“同构冷池回放只改变恢复编排：10实例/批、初始5连接、有限速预热和退避，CPU峰值58%、无拒绝。连接与查询单位不同，分别算，不能相加成50×(20+240)。”
4. 恢复反而过载；原文依据（a-impact）：“01:20切换结束后CPU18%；01:22同时拉起50实例，10秒内首次建连尝试1000次。”
5. 应用启动到DB资源；原文依据（scene.architecture）：“DB 主从切换恢复(缓冲池冷) ← 50 个应用实例同时重启(每实例: 初始 20 连接 + 全量预热查询) ｜ 呼应 boot-order 事件”
6. 无退避重启再次触发；原文依据（a-danger）：“没有先暂停客户端重试就扩内存并重启DB，业务中断且缓冲池重新变冷；恢复后请求再次同时涌入。扩容可能改善容量，但不能自动消除本案未节流和无退避，先控制负载再评估容量。”

标准路径：a-impact → a-stormcurves → a-dbhealth → a-poolcfg → a-probestorm，6⚡，零错S；终态确认h-storm，其余全部excluded。

替代路径：a-impact → a-dbhealth → a-poolcfg → a-probestorm → a-stormcurves，6⚡，零错S；终态确认h-storm，其余全部excluded。

停止点：【停止规则】恢复风暴有时间线和同构对照，残留慢查询、稳态超配和探活主因均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/too-many-connections.html)、[官方资料2](https://dev.mysql.com/doc/refman/8.0/en/innodb-preload-buffer-pool.html)。

## required-field（contract/1）

学习目标：新增请求必填字段会破坏既有调用；响应新增字段也需要验证消费者是否允许扩展。

编审：人工裁定5⚡，原4漏编码反证；75%统一为35%+40%，去掉响应加字段永远安全断言。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 版本边界→契约变更；原文依据（a-schemacheck）：“v2.8请求携带channelSource→200；v2.6/v2.7合法旧请求无此字段。服务端新增@NotNull，缺字段时Bean Validation返回400。”
2. 请求与校验对照；原文依据（a-schemacheck）：“v2.8请求携带channelSource→200；v2.6/v2.7合法旧请求无此字段。服务端新增@NotNull，缺字段时Bean Validation返回400。”
3. 兼容性与校验；原文依据（a-schemacheck）：“同构对照仅撤销新增必填约束，旧请求恢复200，其他字段不变。响应加字段仅在旧消费者允许未知属性时兼容，严格schema/签名校验也可能拒绝，不能说永远安全。”
4. 新增字段破坏旧端；原文依据（a-impact）：“失败群：v2.6/v2.7 客户端 100% 失败，错误统一"channelSource must not be null"”
5. 客户端到服务端；原文依据（scene.architecture）：“App v2.6/v2.7/v2.8（渗透率 35%/40%/25%） → 网关 → 订单服务 v2.8(CreateOrderRequest: 新增 @NotNull channelSource)”
6. 网关注入增加规则散落；原文依据（a-danger）：“老 App 下单恢复（400 消失）。”

标准路径：a-impact → a-schemacheck → a-gatewayroute → a-encodingcheck，5⚡，零错S；终态确认h-required，其余全部excluded。

替代路径：a-impact → a-gatewayroute → a-encodingcheck → a-schemacheck，5⚡，零错S；终态确认h-required，其余全部excluded。

停止点：【停止规则】新增必填的单变量对照成立，路由、TLS和编码反证齐备。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://json-schema.org/understanding-json-schema/reference/object)、[官方资料2](https://spec.openapis.org/oas/v3.1.1.html)。

## doc-drift（contract/2）

学习目标：运行输出说明现状，已发布契约约束承诺；二者冲突不能自动判实现正确。

编审：人工裁定5⚡，补消费者脚本反证。统一GET响应场景，列足5处类型差异；修正实现必然正确、mock同源自动发现错误等不实承诺。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 差异→构建发布；原文依据（a-docvscode）：“同一路径和版本的教学响应：{"stock":123,"updateTime":1727901234567,"price":880,"warehouseId":3,"revision":7,"stockVersion":7,"frozenFlag":0,"warehouseTier":"A"}”
2. DTO/输出/schema三方；原文依据（a-docvscode）：“同一路径和版本的教学响应：{"stock":123,"updateTime":1727901234567,"price":880,"warehouseId":3,"revision":7,"stockVersion":7,"frozenFlag":0,"warehouseTier":"A"}”
3. 序列化与契约；原文依据（a-docvscode）：“文档前5项分别约定string/string/元number/string/string，实现在DTO中变为数量number/毫秒number/分number/number/number；warehouseCode、regionTag缺失，最后3项新增。”
4. 生成过仍会过期；原文依据（a-impact）：“类型不符 ×5：stock(string→int)、updateTime(string→long)、price(float→分 int)…”
5. 构建到合作方解析；原文依据（scene.architecture）：“合作方对接系统 → swagger 文档站(三个月前生成) → 库存接口(代码此后变更 4 次) → 库存服务”
6. 只锁文档不能交付；原文依据（a-danger）：“误导停止（没人再被旧文档坑）。”

标准路径：a-impact → a-docvscode → a-versioncheck → a-scriptcheck，5⚡，零错S；终态确认h-drift，其余全部excluded。

替代路径：a-impact → a-versioncheck → a-scriptcheck → a-docvscode，5⚡，零错S；终态确认h-drift，其余全部excluded。

停止点：【停止规则】同版本输出与发布schema脱节已确认，版本、序列化和消费者脚本候选排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://spec.openapis.org/oas/v3.1.1.html)、[官方资料2](https://json-schema.org/understanding-json-schema/reference/object)。

## timeout-contract（contract/3）

学习目标：沿链路传播剩余预算，排队、处理、重试与回传共同消耗体验期限。

编审：人工裁定5⚡，不保留没测的2.4倍或并行P99理论减半。8→12应增加4，40%重试按总尝试口径计算约1.67倍。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 分布→trace→取消；原文依据（a-timeouttable）：“单trace：t=0发起，t=3.000客户端计时器触发并重试；网关尚未到10s，服务端第一份工作直到t=5.000完成。未转发剩余预算，聚合也未观察取消。”
2. 计数及受控对照；原文依据（a-timeouttable）：“单trace：t=0发起，t=3.000客户端计时器触发并重试；网关尚未到10s，服务端第一份工作直到t=5.000完成。未转发剩余预算，聚合也未观察取消。”
3. 预算和协作取消；原文依据（a-timeouttable）：“同构保持工作负载不变，启用剩余预算和协作取消后，客户端放弃的工作按预算终止。取消是否真正停止DB/SDK工作还取决于具体调用是否支持，HTTP断开不会自动中断所有任务。”
4. 重试加重失败；原文依据（a-impact）：“客户端3s、网关10s、聚合无总预算；分布中22%超过3s，P99为5s。”
5. SDK到聚合与下游；原文依据（scene.architecture）：“客户端 SDK(timeout 3s) → 网关(timeout 10s) → 库存聚合服务(P99 5s: 串行聚合 12 个下游) → 下游×12”
6. 加长超时掩盖预算；原文依据（a-danger）：“客户端直接调到10s，只会扩大等待上限，不保证服务端不再超时，也没有补总预算和取消。体验目标若为8s，此改动还超过目标；先明确目标与尾延迟，再分配预算。”

标准路径：a-impact → a-timeouttable → a-p99check → a-retryaudit，5⚡，零错S；终态确认h-mismatch，其余全部excluded。

替代路径：a-impact → a-p99check → a-retryaudit → a-timeouttable，5⚡，零错S；终态确认h-mismatch，其余全部excluded。

停止点：【停止规则】客户端先退出且服务端继续工作已确认，网关先超时、全都慢和重试凭空制造失败已排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://grpc.io/docs/guides/deadlines/)、[官方资料2](https://grpc.io/docs/guides/cancellation/)。

## enum-drift（contract/4）

学习目标：枚举的语义漂移比类型漂移更毒——值合法、含义错。

编审：人工裁定5⚡；重建一致的PAID→3→SHIPPED叙事，消除原追踪自我否定；修正直接改字符串的二次破坏。

难度：L2→L2；六维[2, 2, 2, 3, 2, 2]。

1. 三状态层→映射；原文依据（a-enumdiff）：“旧契约/旧映射：PAID→2，SHIPPED→3；重构后序列化映射：PAID→3，SHIPPED→2。业务库存记录仍使用稳定字符串PAID/SHIPPED，本次只改了对外数字编码。”
2. diff与单变量样例；原文依据（a-enumdiff）：“旧契约/旧映射：PAID→2，SHIPPED→3；重构后序列化映射：PAID→3，SHIPPED→2。业务库存记录仍使用稳定字符串PAID/SHIPPED，本次只改了对外数字编码。”
3. 序列化协议映射；原文依据（a-enumdiff）：“同一新订单业务状态PAID，JSON输出3，合作方按旧契约解释SHIPPED。仅恢复对外映射后，相同PAID样例输出2并进入拣货通道。”
4. 类型合法语义相反；原文依据（a-impact）：“错误从重构上线开始；1204笔业务状态PAID的订单都发出status=3，消费者按既有契约3=SHIPPED走已发货通道。其他状态未改值，无同类错误。”
5. 生产者到消费者；原文依据（scene.architecture）：“订单服务(status 枚举) → 开放接口 → 物流合作方(按 status 语义路由：2=已支付→拣货通道) ｜ 文档站(旧) → 合作方对接代码”
6. 改文档追认破坏；原文依据（a-danger）：“文档"对了"（与代码一致）。”

标准路径：a-impact → a-enumdiff → a-ordertrace → a-fieldmap，5⚡，零错S；终态确认h-semantic，其余全部excluded。

替代路径：a-impact → a-fieldmap → a-ordertrace → a-enumdiff，5⚡，零错S；终态确认h-semantic，其余全部excluded。

停止点：【停止规则】同一订单的编码对照成立，乱序、历史混写及字段误用均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://spec.openapis.org/oas/v3.1.1.html)。

## error-contract（contract/5）

学习目标：错误响应也是契约——message 给人看，code 给程序读。

编审：保留4⚡；原“账户余额不足”仍包含关键字，不能复现；换为真实不包含的文案，3处实际影响与14处潜在风险分开。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 现象→执行分支；原文依据（a-erroranatomy）：“错误响应只有message，无机器可读code。调用链每次直接执行message.includes("余额不足")，无缓存映射；同构只替换文案即可重现true→false。”
2. 字节和真实includes；原文依据（a-erroranatomy）：“错误响应只有message，无机器可读code。调用链每次直接执行message.includes("余额不足")，无缓存映射；同构只替换文案即可重现true→false。”
3. 展示与协议职责；原文依据（a-erroranatomy）：“设计稿code从未落地。稳定code适合程序判断，message用于展示；code语义也需要契约维护，不能保证永恒不变。”
4. 文案变更改逻辑；原文依据（a-impact）：“本次受影响是3处余额不足引导，旧文案“余额不足，请充值”匹配true，新文案“可用资金不足，请先充值”匹配false。”
5. 错误提供方到前端；原文依据（scene.architecture）：“支付服务(错误响应: { message }) → 前端(按 message.includes("余额不足") 分支) → 充值引导页”
6. 回滚只能暂时恢复；原文依据（a-danger）：“前端分支恢复，充值引导正常——合规整改被迫撤回。”

标准路径：a-impact → a-erroranatomy → a-encoding，4⚡，零错S；终态确认h-nocontract，其余全部excluded。

替代路径：a-impact → a-encoding → a-erroranatomy，4⚡，零错S；终态确认h-nocontract，其余全部excluded。

停止点：【停止规则】真实字符串判断复现成立，无code耦合已确认，编码、缓存、网关均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes)、[官方资料2](https://spec.openapis.org/oas/v3.1.1.html)。

## contract-review（contract/6）

学习目标：把兼容、废弃、限流与语义承诺转成可执行门禁，而非仅给条款命名。

编审：人工裁定6⚡（原8、实际链5且漏限流审查）；把多个真实缺陷误标false的问题改为共同缺陷与三个可证伪方案。六维中位数2，L3→L2。

难度：L3→L2；六维[2, 3, 2, 2, 2, 2]。

1. 条款→反例→门禁；原文依据（a-compatcheck）：“兼容条款只写“尽量”，没有验证者、旧消费者矩阵和破坏判据。required-field教学档案中新增必填不会被此条款拦截。”
2. 跨条款对照；原文依据（a-compatcheck）：“兼容条款只写“尽量”，没有验证者、旧消费者矩阵和破坏判据。required-field教学档案中新增必填不会被此条款拦截。”
3. 契约与容量验证；原文依据（a-compatcheck）：“其他板块同样缺执行门槛：废弃无消费确认、限流无容量依据、错误码无语义样例。共同缺陷是可执行验证缺失，不是某一个常量选错。”
4. 完整框架仍不可执行；原文依据（a-impact）：“规范的价值不是"写得全"，是"拦得住"——判据：每条条款能否拦截一次已发生的事故？”
5. 平台到消费者；原文依据（scene.architecture）：“开放平台(300 注册应用) → 契约规范 v1(五板块：版本/废弃/错误码/限流/兼容) → 全部对外接口”
6. 草率批准或整包否决；原文依据（a-approve）：“按原稿批准会留下当前已证实的门禁缺口；后续事故类型和数量取决于实际变更，不能承诺三个月必然重演四起事故。”

标准路径：a-impact → a-compatcheck → a-sunsetcheck → a-ratecheck → a-errorcheck，6⚡，零错S；终态确认h-compat，其余全部excluded。

替代路径：a-impact → a-ratecheck → a-errorcheck → a-sunsetcheck → a-compatcheck，6⚡，零错S；终态确认h-compat，其余全部excluded。

停止点：【停止规则】共同门禁缺失成立，延长期限、统一加阈值和格式保证三个替代方案均被具体反例排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://spec.openapis.org/oas/v3.1.1.html)、[官方资料2](https://www.rfc-editor.org/rfc/rfc6585#section-4)。

## pool-exhausted（data/1）

学习目标：连接池：池是共享资源，任何租户不还，所有人都借不到。

编审：人工裁定8⚡，原6缺泄漏/主库反证且6条SQL无法占20连接；改成20条关联持有记录，不以“池满”直接排除流量。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 池报错→持有者→SQL；原文依据（a-poolstat）：“active=20/20、idle=0、wait=87；借出超过180s的20个连接均归属本次批量导出job。普通订单QPS与故障前相同；导出任务一次提交24个并行子任务，与订单共用池。”
2. 池/线程/DB关联；原文依据（a-slowquery）：“MySQL processlist与池connectionId关联：20条同类orders批量导出SQL，每条Time180~300s，占20个连接；另外4个导出子任务和87个业务请求在借连接前排队。”
3. 池租借与并发；原文依据（a-slowquery）：“对应查询缺少匹配索引，扫描量大。暂停该job并等现有查询结束的受控回放中，active回落4~6、订单恢复。20条足以占满20池，不用6条声称打满20。”
4. CPU闲而请求排队；原文依据（a-impact）：“下单/支付使用该主库连接池，发生借连接超时；浏览/搜索走独立只读库正常。CPU15%、内存平稳。读库正常不能排除主库故障，下一步定位借连接阶段和持有者。”
5. 应用池到主库；原文依据（scene.architecture）：“用户 App → 下单服务 → 连接池(max=20) → MySQL 主库”
6. 重启不阻止job重跑；原文依据（a-restart）：“重启后 3 分钟内正常，随后批量导出任务再次跑起来，连接重新被吃光。”

标准路径：a-impact → a-poolstat → a-slowquery → a-stack → a-mysql，8⚡，零错S；终态确认h-slow，其余全部excluded。

替代路径：a-impact → a-mysql → a-stack → a-poolstat → a-slowquery，8⚡，零错S；终态确认h-slow，其余全部excluded。

停止点：【停止规则】20条长查询与20池持有者吻合、受控回放恢复；普通流量、失联泄漏和主库整体故障均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/explain-output.html)。

## cache-drift（data/2）

学习目标：缓存新鲜度需要明确时效与失效机制，副本差异必须按同一主键核对。

编审：人工裁定5⚡（原4、旧链6）；移除重复DB证明但增加独立图片反证，限制真实影响群和刷新上限。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 端差异→副本→失效；原文依据（a-userprobe）：“同一用户最近上传已返回成功，MySQL持久化avatar_url为u/8899_new_hash.jpg；Redis仍为u/8899_old_hash.jpg，App接口返回旧URL，网页返回新URL。对该用户写入已成功，排除“新头像根本没入库”。”
2. 同主键对照+diff；原文依据（a-userprobe）：“同一用户最近上传已返回成功，MySQL持久化avatar_url为u/8899_new_hash.jpg；Redis仍为u/8899_old_hash.jpg，App接口返回旧URL，网页返回新URL。对该用户写入已成功，排除“新头像根本没入库”。”
3. Cache-Aside时效；原文依据（a-userprobe）：“同一用户最近上传已返回成功，MySQL持久化avatar_url为u/8899_new_hash.jpg；Redis仍为u/8899_old_hash.jpg，App接口返回旧URL，网页返回新URL。对该用户写入已成功，排除“新头像根本没入库”。”
4. 成功上传仍旧值；原文依据（a-impact）：“受影响：已有旧头像Redis缓存，且最近一次批量刷新后上传过新头像的App用户。未命中缓存的首次读取可加载新值；网页直读DB正常。”
5. 应用/Redis/DB/CDN；原文依据（scene.architecture）：“App(读缓存优先) → 缓存 Redis(头像 URL, TTL 24h) → MySQL(真相)”
6. 回滚要清受影响值；原文依据（a-rollback）：“发版恢复删缓存逻辑 + 按受影响名单清理 Redis 旧值。”

标准路径：a-impact → a-userprobe → a-gitlog → a-imgurl，5⚡，零错S；终态确认h-cache，其余全部excluded。

替代路径：a-impact → a-imgurl → a-gitlog → a-userprobe，5⚡，零错S；终态确认h-cache，其余全部excluded。

停止点：【停止规则】旧缓存返回与失效变更对照成立，数据库写入和新图片访问证据齐备。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)。

## slow-query（data/3）

学习目标：EXPLAIN 是 SQL 排查的显影液；数据增长不是根因，是放大器。

编审：人工裁定6⚡（原5），移除重复慢日志读取，补锁/资源反证；DDL标危险9⚡且不计定位成本。修正filesort和高扫描比过度推断。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 慢化→计划→索引；原文依据（a-explain）：“type=ALL，key=NULL，估算rows=4800000，Extra=Using where; Using filesort。”
2. 计划/定义/等待与对照；原文依据（a-tablestruct）：“现有索引PRIMARY(id)、idx_title(title)，缺(category_id,status,created_at)；字段与参数均INT。”
3. 索引与排序；原文依据（a-tablestruct）：“同一500万行同构副本、相同负载，仅增加匹配索引后查询不再全表访问，整体P99由3.5s降至180ms。增长放大扫描代价，但慢并非数据增长不可避免。”
4. ALL不等于磁盘排序；原文依据（a-impact）：“仅列表页这一条 SQL 慢；按 ID 查详情、类目聚合计数等其他查询全部正常。”
5. 应用到存储计划；原文依据（scene.architecture）：“App → 商品服务 → MySQL(商品表 products，500 万行)”
6. DDL同样有锁风险；原文依据（a-fixindex）：“经评审在低峰增加复合索引并观察锁、IO与回退条件；Online DDL也可能短暂等待元数据锁，不能承诺无阻塞或固定4分钟。”

标准路径：a-impact → a-explain → a-tablestruct → a-lockcheck → a-hostmetric，6⚡，零错S；终态确认h-index，其余全部excluded。

替代路径：a-impact → a-lockcheck → a-hostmetric → a-explain → a-tablestruct，6⚡，零错S；终态确认h-index，其余全部excluded。

停止点：【停止规则】匹配索引缺失及同数据优化对照成立，增长必然、锁和整体资源解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/explain-output.html)、[官方资料2](https://dev.mysql.com/doc/refman/8.0/en/order-by-optimization.html)、[官方资料3](https://dev.mysql.com/doc/refman/8.0/en/innodb-online-ddl-limitations.html)。

## cache-review（data/4）

学习目标：缓存设计的取舍：先问业务时效，再定技术参数。

编审：人工裁定8⚡保留：每项建议需独立边界核验，原专家链5⚡却声称三风险全查。改成价格路径和三个可证伪替代方案，不再把真实风险标false。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 约束→样例→收费；原文依据（a-orderpath）：“方案结算代码直接读取sku缓存price并charge，无有效价版本校验。教学样例：t0价格100，t1运营改DB为80，缓存仍100且到t0+30min才到期；t1+2min低流量订单仍按100收费。”
2. 多反例对照；原文依据（a-orderpath）：“方案结算代码直接读取sku缓存price并charge，无有效价版本校验。教学样例：t0价格100，t1运营改DB为80，缓存仍100且到t0+30min才到期；t1+2min低流量订单仍按100收费。”
3. 缓存时效与结算；原文依据（a-orderpath）：“该路径违反当前有效价成交和一分钟展示时效；是否最终产生资损还取决于促销方向和赔付口径，不预先编金额。”
4. 容量好仍能值错；原文依据（a-impact）：“运营明确：促销改价必须分钟级生效——价格是资损红线数据。”
5. 展示与订单收费；原文依据（scene.architecture）：“App → 详情页服务 → Redis(方案新增) → MySQL(商品表 500 万行)”
6. 原稿批准跳过红线；原文依据（a-approve）：“方案原样过审上线。”

标准路径：a-impact → a-orderpath → a-avalanche → a-stampede → a-capacity，8⚡，零错S；终态确认h-price，其余全部excluded。

替代路径：a-impact → a-capacity → a-stampede → a-avalanche → a-orderpath，8⚡，零错S；终态确认h-price，其余全部excluded。

停止点：【停止规则】低流量旧价成交路径成立，雪崩唯一解释、互斥单独解决和容量解决三种方案均被反例排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)。

## midnight-rollback（data/5）

学习目标：决策依据是风险不对称：回滚 10 分钟可逆，不行动的代价是用户持续受损——疑似即行动。

编审：5⚡保留，但定位链不再把9⚡状态变更算成2⚡取证；候选统一成决策命题，保留渠道未知，纠正失败请求/订单混淆和D-11→D-9被说7天。

难度：L3→L2；六维[2, 2, 2, 2, 2, 2]。

1. 影响→行动条件；原文依据（a-timeline）：“23:40发布，00:10放量到100%且错误抬升，堆栈指向新路由；这只支持高度可疑，不是根因确定。”
2. 时间线与回滚记录；原文依据（a-timeline）：“23:40发布，00:10放量到100%且错误抬升，堆栈指向新路由；这只支持高度可疑，不是根因确定。”
3. 不确定下决策；原文依据（a-timeline）：“排期负责人给定：回滚使功能延后约1天，安全回滚预案预计8分钟；继续完整定位预计1~2小时，期间仍受损。应结合可执行性先止损，不需等完整复现。”
4. 未知根因仍可止损；原文依据（a-impact）：“接口每分钟7000次尝试，错误率3%即约210次失败尝试/分钟，不等于210个独立订单或确定金额资损。90分钟仍处于2%~4%，没有持续下降到0.1%基线。”
5. 发布与支付约束；原文依据（scene.architecture）：“App → 结算服务(v2.6.0, 2h 前发布) → 支付渠道”
6. 等待或回滚都有代价；原文依据（a-observe）：“若错误率及流量维持6小时，约210×360=75600次失败尝试；这是条件情景估算，不是已发生的独立订单数，也不能凭波动证明绝不自愈。”

标准路径：a-impact → a-timeline → a-env → a-channel，5⚡，零错S；终态确认h-newcode，其余全部excluded。

替代路径：a-impact → a-env → a-channel → a-timeline，5⚡，零错S；终态确认h-newcode，其余全部excluded。

停止点：【停止规则】持续失败、版本关联、两侧代价与安全回滚条件齐备；本局只完成行动选择，回滚及根因复现尚未执行。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://sre.google/sre-book/managing-incidents/)。

## double-strike（data/6）

学习目标：到达速率与持有时间共同决定资源需求，分开聚合指标和故障窗口。

编审：人工裁定4⚡（原6、实际旧链4），保留三组对照作为最小证明；修正QPS/并发单位、池上限、不必全因同时修及日志阈值。L3→L2。

难度：L3→L2；六维[2, 3, 2, 3, 2, 2]。

1. 异常指标→组合对照；原文依据（a-combo）：“同构固定10秒输入窗口：A保留3000QPS、查询5ms，所需并发约15；B回源50QPS、查询350ms，约17.5；C同时3000QPS与350ms，约1050需求，实际200执行、队列上升并超时。”
2. 同窗三组实验；原文依据（a-combo）：“同构固定10秒输入窗口：A保留3000QPS、查询5ms，所需并发约15；B回源50QPS、查询350ms，约17.5；C同时3000QPS与350ms，约1050需求，实际200执行、队列上升并超时。”
3. QPS×秒容量；原文依据（a-combo）：“速率QPS×秒才得到并发需求，不能把3000个已并发请求再乘耗时。C在两个因素叠加时超出池预算。”
4. 单项不过阈值叠加过载；原文依据（a-impact）：“故障窗口回源速率3000次/秒，每次持连接约0.35秒，假设流量稳定且无排队时所需并发L=λW=1050。实际最多200连接在执行，其余等待；不是实际建立1000个连接。”
5. 缓存/SQL/池；原文依据（scene.architecture）：“App → 商品服务(Redis 缓存) → MySQL(商品表 500 万行)”
6. 扩池掩盖需求；原文依据（a-rollback）：“回退JOIN使查询恢复5ms，在相同3000QPS输入下并发需求约15，池排队消失。该状态变更可作为止血，但不作为已执行取证的一部分。”

标准路径：a-impact → a-combo → a-poolsize，4⚡，零错S；终态确认h-combo，其余全部excluded。

替代路径：a-impact → a-poolsize → a-combo，4⚡，零错S；终态确认h-combo，其余全部excluded。

停止点：【停止规则】三组同构对照和单位一致的容量模型成立，两个单因无关论及扩1000充分论均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://sre.google/sre-book/handling-overload/)。

## data-script-accident（data/7）

学习目标：实际执行文本、影响范围与事务提交状态共同决定误更新处置。

编审：5⚡保留，新增必要影响面1⚡、删重复环境取证；修正目标已下架却期望1行、行数等于全表就必无WHERE、已提交仍立刻ROLLBACK及CLI自带保护等错误。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 范围→执行文本→输入；原文依据（a-sqlcheck）：“已留存数据库审计的connectionId与执行时间对应：UPDATE inventory SET stock=-50；没有WHERE。CLI原样执行，无ORM。”
2. 审计与终端记录；原文依据（a-sqlcheck）：“已留存数据库审计的connectionId与执行时间对应：UPDATE inventory SET stock=-50；没有WHERE。CLI原样执行，无ORM。”
3. DML事务与恢复；原文依据（a-sqlcheck）：“编辑器文件是SET stock=50 WHERE sku_id=12345，实际输入却是旧模板的第一行；因此不是带WHERE但类型/值错误。”
4. 文件正确执行不同；原文依据（a-impact）：“仅inventory表50000行被改为-50，其他表无变化；目标sku12345存在且应为50。该CLI连接autocommit=1，语句已提交，普通ROLLBACK不能撤销。先暂停库存写入与对账任务，保护恢复证据。”
5. 编辑器/CLI/DB；原文依据（scene.architecture）：“运营后台 → 库存服务 → MySQL(inventory 表 5 万行)”
6. 整表恢复可能覆盖新写；原文依据（a-restore）：“该UPDATE已自动提交，不能普通回滚。将RDS备份和binlog恢复到隔离实例的误操作前时点，比对后按主键恢复库存，并处理误操作后合法业务变更，不能直接覆盖整库/整表丢掉新写入。恢复用时取决于实际备份规模，不承诺20分钟。”

标准路径：a-impact → a-sqlcheck → a-reason → a-triggercheck，5⚡，零错S；终态确认h-wheremissing，其余全部excluded。

替代路径：a-impact → a-triggercheck → a-reason → a-sqlcheck，5⚡，零错S；终态确认h-wheremissing，其余全部excluded。

停止点：【停止规则】实际输入与审计吻合，带WHERE条件错误、ORM和触发器均排除；恢复尚未执行。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/commit.html)、[官方资料2](https://dev.mysql.com/doc/refman/8.0/en/update.html)。

## replica-lag（data/8）

学习目标：读写分离读的是"过去"——写后立读必须有一致性保障。

编审：人工裁定5⚡（原4，旧链5但漏缓存/路由），移出未经验证的大事务制造者；纠正Seconds_Behind精度与固定10秒严格保证。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 双读路径→GTID时序；原文依据（a-lagprobe）：“订单事务GTID为G10001：主库t0提交、t0+0.08s接口响应；用户t0+0.5s在指定replica3查列表为空。replica3于t0+2.1s应用G10001，同一查询随后出现订单。”
2. 逐单到达记录；原文依据（a-lagprobe）：“订单事务GTID为G10001：主库t0提交、t0+0.08s接口响应；用户t0+0.5s在指定replica3查列表为空。replica3于t0+2.1s应用G10001，同一查询随后出现订单。”
3. 异步复制与可见性；原文依据（a-lagprobe）：“20单分别关联实际命中的replica与GTID，应用延迟1.8~7.9s，首查均早于到达。主库提交早于响应，排除提前返回；不能用一次主库可见推导所有写都已及时提交。”
4. 写成功不保证副本可见；原文依据（a-impact）：“订单详情（读主库）：下单后立刻可见，100% ✓”
5. 主库/副本/客户端；原文依据（scene.architecture）：“下单(写主库) → binlog 复制 → 从库×4(轮询读) ｜ 订单列表页：读从库 ｜ 订单详情页：读主库”
6. 全切主库增加负载；原文依据（a-danger）：“客诉立刻清零（读己之写天然成立）。”

标准路径：a-impact → a-lagprobe → a-cacheprobe → a-shardcheck，5⚡，零错S；终态确认h-replag，其余全部excluded。

替代路径：a-impact → a-shardcheck → a-cacheprobe → a-lagprobe，5⚡，零错S；终态确认h-replag，其余全部excluded。

停止点：【停止规则】GTID时序直接解释首查为空，提前返回、负缓存和分片错误均排除；延迟制造者尚需独立对照。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/show-replica-status.html)、[官方资料2](https://dev.mysql.com/doc/refman/8.0/en/gtid-functions.html)。

## implicit-cast（data/9）

学习目标：字符串列与数字比较采用数值语义，是否走索引要用同值绑定对照确认。

编审：人工裁定5⚡（原4、旧链5却漏锁）。MySQL8统一、CPU百分比口径明确；修正不同字段唯一差异、显式CAST假象和2100倍算术。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 同值对照→计划；原文依据（a-explain）：“MySQL8.0同一数据/统计信息对照：数字参数type=ALL、key=NULL；字符串绑定type=ref、key=idx_phone。字符串列与数值比较按数值语义比较，多种字符串（如前导零）可等于同一数值，字符串索引不能用于这种精确定位。”
2. 参数与计划对照；原文依据（a-explain）：“MySQL8.0同一数据/统计信息对照：数字参数type=ALL、key=NULL；字符串绑定type=ref、key=idx_phone。字符串列与数值比较按数值语义比较，多种字符串（如前导零）可等于同一数值，字符串索引不能用于这种精确定位。”
3. 数值比较语义；原文依据（a-explain）：“这是隐式比较语义的解释，并不是执行计划真的显示了CAST(phone AS DOUBLE)函数改写。仅改绑定类型即恢复2ms，约2100倍教学样例差异。”
4. 有索引仍不能定位；原文依据（a-impact）：“同一phone列、相同值、数据快照和查询字段：参数数字13800001234时4.2s，字符串"13800001234"时2ms。”
5. 服务绑定到优化器；原文依据（scene.architecture）：“客服后台 → 会员查询服务 → MySQL 会员表(3200 万行, phone VARCHAR(20), 索引 idx_phone)”
6. 只限流不修单次成本；原文依据（a-danger）：“CPU 回落至 60%，其他业务恢复。”

标准路径：a-impact → a-explain → a-lockcheck → a-cachecheck，5⚡，零错S；终态确认h-cast，其余全部excluded。

替代路径：a-impact → a-cachecheck → a-lockcheck → a-explain，5⚡，零错S；终态确认h-cast，其余全部excluded。

停止点：【停止规则】同值参数对照和计划差异成立，统计、锁与重复请求解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/type-conversion.html)、[官方资料2](https://dev.mysql.com/doc/refman/8.0/en/explain-output.html)。

## deep-pagination（data/10）

学习目标：索引有序访问仍需支付OFFSET跳过成本，keyset需匹配排序与过滤。

编审：人工裁定5⚡（原4、旧链5漏锁）。统一4501页/20条/OFFSET90000，分离COUNT1.2s与第一页60ms，去掉完美线性和任意场景恒定2ms。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 曲线→执行访问量；原文依据（a-explain）：“同一查询计划：主键倒序访问、无filesort；实际执行观测访问约90020条记录，前90000条被OFFSET丢弃，返回20条。EXPLAIN.rows只是估算，实际访问量由执行观测核对。”
2. 分页算术与分段；原文依据（a-explain）：“同一查询计划：主键倒序访问、无filesort；实际执行观测访问约90020条记录，前90000条被OFFSET丢弃，返回20条。EXPLAIN.rows只是估算，实际访问量由执行观测核对。”
3. OFFSET与keyset；原文依据（a-explain）：“同数据改为WHERE id<:last_id ORDER BY id DESC LIMIT20，取得后续20条而无需跳过90000；教学样例2ms，不能保证带过滤/JOIN时永远恰扫20或恒定2ms。”
4. 索引正确仍慢；原文依据（a-impact）：“每页20条：页1 OFFSET0，页100 OFFSET1980，页500 OFFSET9980，页4501 OFFSET90000。数据查询约60ms/190ms/720ms/6s，整体呈随访问量增加的趋势，不宣称完美线性。”
5. 交互到SQL计划；原文依据（scene.architecture）：“客服后台→订单列表ORDER BY id DESC LIMIT 90000,20→MySQL8000万行；另有独立COUNT计数查询。”
6. 禁深页会影响工作；原文依据（a-danger）：“DB 减压成功，CPU 回落。”

标准路径：a-impact → a-explain → a-lockcheck → a-countcheck，5⚡，零错S；终态确认h-offset，其余全部excluded。

替代路径：a-impact → a-lockcheck → a-countcheck → a-explain，5⚡，零错S；终态确认h-offset，其余全部excluded。

停止点：【停止规则】页码访问量及无COUNT对照成立，排序缺索引、锁与COUNT全部解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/explain-output.html)、[官方资料2](https://dev.mysql.com/doc/refman/8.0/en/limit-optimization.html)。

## oom-leak（runtime/1）

学习目标：内存与连接是有生命周期的资源——无界容器就是慢性泄漏。

编审：7⚡保留；修正137等于OOM、RSS形态直接判泄漏、缓存必需同时TTL/LRU及异步函数语法；增长量与36小时对账。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 退出→曲线→引用链；原文依据（a-k8sevent）：“终止Reason=OOMKilled、ExitCode137，cgroup memory.events中oom_kill递增，内存触及2Gi；三者共同确认本次内存限额杀进程。137只代表SIGKILL，单独不能排除人工kill等原因。”
2. cgroup/GC/快照对照；原文依据（a-heapsnap）：“相隔1小时的同负载快照：orderCache条目800000→880000；Map结构约+6Mi，持有订单字符串约+39Mi，总约45Mi，与曲线同量级。”
3. V8与容器内存；原文依据（a-heapsnap）：“Retainer为模块顶层Map；Timers/Listeners计数及保留体积稳定，排除监听器持续注册。”
4. CPU正常仍被杀；原文依据（a-impact）：“同节点同规格的其他服务全部安好，只有订单查询服务在死。”
5. 进程堆到cgroup；原文依据（scene.architecture）：“K8s Pod(内存限额 2Gi) → 订单查询服务(Node.js 18) → 订单库 MySQL”
6. 重启重复掩盖；原文依据（a-restartnow）：“受控重启后内存回到约400Mi而不是归零；若输入与实现不变，预计仍会累积。该动作恢复服务但会丢现场，不能单独证明Map就是根因。”

标准路径：a-impact → a-k8sevent → a-rsscurve → a-heapsnap → a-coderead，7⚡，零错S；终态确认h-cache，其余全部excluded。

替代路径：a-impact → a-k8sevent → a-heapsnap → a-coderead → a-rsscurve，7⚡，零错S；终态确认h-cache，其余全部excluded。

停止点：【停止规则】OOM事件、保留量增长和无界Map因果吻合，流量、监听器与固定正常容量不足均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://nodejs.org/api/process.html#processmemoryusage)、[官方资料2](https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/)。

## event-loop-blocked（runtime/2）

学习目标：事件循环是单线程服务的心脏：一个同步 CPU 任务会堵住所有并发请求。

编审：人工裁定7⚡（原6漏排错），删除低信息release读取，新增下游/DB反证；修复不存在压缩API和200ms/800ms/1.2s矛盾。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 健康检查→线程profile；原文依据（a-metrics）：“event-loop延迟约800ms，容器4核归一CPU25%；主线程profile接近一核算力。操作系统可迁移线程，不要求固定“核1”始终满。”
2. 分核/lag/CPU栈；原文依据（a-code）：“导出回调中：”
3. 事件循环与worker；原文依据（a-code）：“const hash = bcrypt.hashSync(password, 12);”
4. 平均CPU低仍堵；原文依据（a-impact）：“导出时同进程/health也延迟约800ms，其他副本不做导出时正常。不是所有业务代码无罪：某业务回调若堵主线程，也会拖住健康检查。”
5. 业务回调到进程调度；原文依据（scene.architecture）：“App → 网关聚合服务(Node.js 18, 4 核容器) → 下游微服务 ×5”
6. 回滚恢复但无长效边界；原文依据（a-revert）：“回滚后卡顿立即消失，P99 恢复 80ms。”

标准路径：a-impact → a-metrics → a-code → a-down → a-dblog，7⚡，零错S；终态确认h-cpu，其余全部excluded。

替代路径：a-impact → a-down → a-dblog → a-metrics → a-code，7⚡，零错S；终态确认h-cpu，其余全部excluded。

停止点：【停止规则】同步CPU热点与800ms阻塞吻合，GC、下游和数据库锁解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop)、[官方资料2](https://nodejs.org/api/zlib.html)。

## closure-leak（runtime/3）

学习目标：监听器和闭包的生命周期，必须与它们依附的对象对齐——否则每一次调用都在给内存上锁。

编审：人工裁定6⚡（原7、旧链5漏反证）；重建16KiB×2429/小时与900MiB/天自洽样例，移除不存在的临时Buffer保留因果与2.3GB释放；修正once及N²倍数。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 旧修复→新保留链；原文依据（a-snapdiff）：“同负载间隔1小时：全局emitter的label:done监听器12→2441，增加2429个；每个闭包持有约16KiB的JS标签上下文，约2429×16/1024=37.95MiB/小时。”
2. 引用链与内存分类；原文依据（a-snapdiff）：“同负载间隔1小时：全局emitter的label:done监听器12→2441，增加2429个；每个闭包持有约16KiB的JS标签上下文，约2429×16/1024=37.95MiB/小时。”
3. 闭包生命周期；原文依据（a-snapdiff）：“LRU保留量稳定，Timers句柄仍4个且保留量稳定；新增增长由listener闭包引用链解释，排除旧缓存与新增定时器。”
4. 无发布仍暴露旧路径；原文依据（a-impact）：“旧版接口已存在，服务器没有新发布；运营批量标注只是将调用频率放大50倍。LRU条目仍有上限，不能仅凭它排除其他持有链；也不能说本服务刚上线了新功能。”
5. 请求到全局emitter；原文依据（scene.architecture）：“K8s Pod(内存限额 2Gi) → 订单查询服务(Node.js 18) → 订单库 MySQL”
6. once不保证请求关联；原文依据（a-restart）：“受控滚动重启临时清除本次约900MiB保留对象；限额2Gi下不能说已释放2.3GiB常驻泄漏。重启不会自动撤销已经发送的重复事件，需按请求标识对账。”

标准路径：a-impact → a-snapdiff → a-coderead → a-heaptype，6⚡，零错S；终态确认h-listener，其余全部excluded。

替代路径：a-impact → a-heaptype → a-coderead → a-snapdiff，6⚡，零错S；终态确认h-listener，其余全部excluded。

停止点：【停止规则】监听器与上下文保留链及增长算术一致，旧缓存、timer和独立native泄漏均排除；重复回调另有样例，不冒充已对账推送数。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://nodejs.org/api/events.html)、[官方资料2](https://nodejs.org/api/process.html#processmemoryusage)。

## timewait-exhausted（runtime/4）

学习目标：按源/目的元组核对临时端口与连接留存，复用可降低持续新建速率。

编审：人工裁定9⚡（原6、旧链5遗漏速率及三项反证）。重写不可能的31284/28232与3000QPS×60但仅3%失败；区分Node版本、globalAgent与进程重启。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 阶段→元组→配置；原文依据（a-netstat）：“同一Pod网络命名空间、同一源IP→物流VIP:9443：TIME_WAIT28080、ESTABLISHED100。ip_local_port_range=32768~60999，共28232个候选端口；同元组占用已接近上限。”
2. 抓包/端口/速率；原文依据（a-netstat）：“同一Pod网络命名空间、同一源IP→物流VIP:9443：TIME_WAIT28080、ESTABLISHED100。ip_local_port_range=32768~60999，共28232个候选端口；同元组占用已接近上限。”
3. TCP状态与Agent；原文依据（a-netstat）：“本环境实测TIME_WAIT约60秒、无可用复用路径；connect失败前无SYN发出，localAddress存在。端口压力可解释本案，不能把跨目标聚合31284个连接塞进单目标28232范围。”
4. 对端正常本机失败；原文依据（a-impact）：“仅一个Pod到固定物流VIP:9443的出站连接受影响，其他目的地址及入站正常；错误为EADDRNOTAVAIL。源localAddress确为本Pod存在地址，下一步检查同一源/目的元组的临时端口可用量。”
5. 进程到内核与网络；原文依据（scene.architecture）：“6个Node.js18订单Pod→物流服务固定VIP:9443；每Pod一个源IP，故障Pod的网络命名空间独立。”
6. 进程重启不能清TIME_WAIT；原文依据（a-rollback）：“只重启Node进程不会清除同一网络命名空间中的TIME_WAIT。新建Pod若改变源IP/网络命名空间可能临时缓解，但需要容量与流量迁移预算；不能把滚动重启当成直接清空内核状态的证明。”

标准路径：a-impact → a-netstat → a-code → a-qps → a-down → a-dns → a-podcheck，9⚡，零错S；终态确认h-tw，其余全部excluded。

替代路径：a-impact → a-down → a-dns → a-podcheck → a-netstat → a-qps → a-code，9⚡，零错S；终态确认h-tw，其余全部excluded。

停止点：【停止规则】固定元组端口压力、显式短连接及速率算术吻合，远端拒绝、DNS和路由/地址异常均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://nodejs.org/api/http.html#class-httpagent)、[官方资料2](https://man7.org/linux/man-pages/man2/connect.2.html)、[官方资料3](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html)。

## container-review（runtime/5）

学习目标：统一治理前按目标负载验证资源参数，并区分request、limit和HPA指标口径。

编审：7⚡保留，改为完整5动作不再旧链5⚡冒称探针/历史/成本全查。纠正单核需要2核以上、HPA按limit、readiness重启及40Gi无清单。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 草案→画像→约束；原文依据（a-profile）：“给定峰值：商品达到目标吞吐需3.5CPU，统一2CPU会限制可用CPU；报表完整任务峰值4.8Gi>4Gi，有超限风险。网关只有1CPU的主线程，2CPU并不因“单核敏感”就必然不够。”
2. 资源峰值与分母复算；原文依据（a-profile）：“给定峰值：商品达到目标吞吐需3.5CPU，统一2CPU会限制可用CPU；报表完整任务峰值4.8Gi>4Gi，有超限风险。网关只有1CPU的主线程，2CPU并不因“单核敏感”就必然不够。”
3. K8s资源/HPA/探针；原文依据（a-profile）：“稳态3.2Gi本身也不能证明4Gi必然OOM；决定性证据是已给出的完整任务峰值4.8Gi。”
4. 统一管理仍可不合适；原文依据（a-uniform）：“草案同时统一资源request/limit和扩缩容目标；管理成本下降是动机，但需要逐服务验证目标负载。当前方案未发布，不能把评审预测写成已发生事故。”
5. 调度到业务吞吐；原文依据（scene.architecture）：“草案：17服务均CPU request=limit=2核、memory request=limit=4Gi；HPA CPU averageUtilization目标70%；readiness周期30s。”
6. 全量推行跳过峰值验证；原文依据（a-golive）：“按原稿直接全量推行违反已给出的商品与报表负载约束，具有节流/超限风险；方案未发布，没有依据声称已发生两次OOM和五次投诉。”

标准路径：a-uniform → a-profile → a-hpa → a-probe → a-oomhist，7⚡，零错S；终态确认h-uniform，其余全部excluded。

替代路径：a-uniform → a-oomhist → a-probe → a-hpa → a-profile，7⚡，零错S；终态确认h-uniform，其余全部excluded。

停止点：【停止规则】目标负载与统一参数冲突成立，HPA分母、readiness重启和未发布历史事故三个解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)、[官方资料2](https://kubernetes.io/docs/concepts/workloads/pods/probes/)、[官方资料3](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)。

## cascade-timeout（runtime/6）

学习目标：慢调用通过共享资源传播，隔离并发与有界排队，沿链路使用剩余预算。

编审：6⚡保留，补齐原旧链4⚡遗漏的网关/独立故障反证；修正30×4、5秒响应仍等满30、熔断唯一解药及22点/凌晨2点矛盾。L3→L2。

难度：L3→L2；六维[2, 3, 2, 2, 2, 2]。

1. 资源占比→等待栈；原文依据（a-timeout）：“调用代码没有评论独立并发额度、队列上限或取消传播；30s等待上限长于体验预算。线程trace显示shared-worker主要等待评论HTTP，其余请求排队。”
2. 容量/隔离/恢复曲线；原文依据（a-timeout）：“调用代码没有评论独立并发额度、队列上限或取消传播；30s等待上限长于体验预算。线程trace显示shared-worker主要等待评论HTTP，其余请求排队。”
3. 共享池与剩余预算；原文依据（a-timeout）：“同构保持50QPS慢评论输入，给评论独立20并发额度并快速拒绝/按业务允许降级后，普通订单仍可处理。证明共享资源传播；30秒不是0秒，5秒响应也不会被强行等满30秒。”
4. 5%流量挤占共享池；原文依据（a-impact）：“评论调用仅占订单1000QPS的5%=50QPS；每次持线程5s，稳定需求约250>共享200，慢调用逐步挤占处理能力，普通请求也排队。”
5. 评论到订单及网关；原文依据（scene.architecture）：“网关→商品→订单（共享200工作线程）；其中5%订单调用评论；评论→DB。各层HTTP总等待上限30s，未传播取消，无评论独立并发配额。”
6. 扩池放大下游压力；原文依据（a-emergency）：“盲扩到500可能让更多慢调用同时占线程并把负载推向下游，不保证恢复。先为非核心评论分配有界并发和队列，按业务允许降级，并停止无预算重试；扩池需同负载验证。”

标准路径：a-impact → a-timeout → a-threadpool → a-independent → a-gw，6⚡，零错S；终态确认h-cascade，其余全部excluded。

替代路径：a-impact → a-gw → a-independent → a-threadpool → a-timeout，6⚡，零错S；终态确认h-cascade，其余全部excluded。

停止点：【停止规则】共享线程持有量及隔离对照成立，正常池不足、独立故障和网关起因均排除；恢复曲线说明残留排队而非固定等待。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://sre.google/sre-book/addressing-cascading-failures/)、[官方资料2](https://grpc.io/docs/guides/deadlines/)。

## regex-catastrophe（runtime/7）

学习目标：回溯性能依赖实际模式、输入和引擎；用失败后缀及受限复现核对，不凭嵌套量词直接宣布指数级。

编审：人工裁定7⚡（原4、旧链5漏ES/GC且未复现实例）。本机Java25实际0.910/2.902/18.056/45.139ms，仅少样本复核，旧中文+\w输入开头失败；不再虚构指数阶或Java线程可中断保证。

难度：L2→L2；六维[2, 3, 2, 3, 2, 2]。

1. 输入形状→模式→对照；原文依据（a-flamegraph）：“实际Java模式为^(a+)+$，输入a重复n次再接!。末尾失败使重复分组反复尝试切分，profile热点对应Pattern匹配。”
2. 热点与受限长度实验；原文依据（a-flamegraph）：“实际Java模式为^(a+)+$，输入a重复n次再接!。末尾失败使重复分组反复尝试切分，profile热点对应Pattern匹配。”
3. 回溯及引擎语义；原文依据（a-flamegraph）：“本地Java25复核与简化线性模式^a+$比较，前者随n增加显著变慢；现代引擎可能优化部分回溯，不能从嵌套量词就断言n=30必8秒或必为2^n。”
4. 合法类型仍高成本；原文依据（a-impact）：“同长度对照：纯a重复串校验通过；a长串末尾加!失败，CPU开销明显高。生产场景profile热点在正则，不在ES或GC。”
5. 校验到业务线程；原文依据（scene.architecture）：“商家批量导入ASCII活动标识→Java搜索服务Pattern校验→Elasticsearch；本地语义复核使用Java25.0.2。”
6. 关闭校验改变接受范围；原文依据（a-danger）：“紧急绕过此格式校验降低CPU，但会改变输入接受规则，需要业务确认并限制影响范围。跳过校验不是无代价的长期修复，也不说明所有校验都可以随意关闭。”

标准路径：a-impact → a-flamegraph → a-repro → a-qpscmp → a-esstat → a-gcstat，7⚡，零错S；终态确认h-backtrack，其余全部excluded。

替代路径：a-impact → a-esstat → a-gcstat → a-qpscmp → a-flamegraph → a-repro，7⚡，零错S；终态确认h-backtrack，其余全部excluded。

停止点：【停止规则】实际模式、失败后缀和同引擎受限复核成立；流量单因、ES和GC均排除，修复及发布尚未执行。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/regex/Pattern.html)、[官方资料2](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Future.html)。

## 全量验收与边界

2026-11-04完成29/29题；目录与顺序保持原值，未改发布contentRevision，未触及首四题、学徒篇、index或chapters。最终六维产生1题L1与28题L2；原5道L3均降为L2，不因章尾/评审身份强留L3。这意味着当前工兵篇没有已校准L3，未来若需要L3梯度，应另行设计真正达到六维中位数的内容，不能仅改标签。

每题有两条动作顺序不同、证据可独立读取的路径，共58条路径；使用真实`app/utils/scoring.ts`的computeGrade，零错误均为S。每条路径都达到一个confirmed、其余excluded，并在停止前读到噪声收线动作。L1按规范免噪声，28题L2均有明确日志与收线依据；危险动作成本统一为9⚡且gain=none，状态变更不充当免费定位证据。

已运行29题validate、29题真实CasePayload/schema与check_case、29题真实DiagnosisCase TypeScript类型检查；工兵语义测试与首4题回归共53项通过，首4题基线检查不变。原始29个正文哈希逐一与98cc581源文件复核一致。语义测试命令：

```sh
node --test content/baselines/t04b-engineer-semantic.test.mjs content/baselines/t04a-semantic.test.mjs
node content/pipeline/baseline.mjs --check
java content/baselines/t04b-engineer-regex-repro.java
```

Java复核只在本机Java25.0.2做受限输入，不是线上事故复现，也未把本地耗时当作生产数据。初次512/1024/2048/4096长度的单样本为0.910/2.902/18.056/45.139ms；重复运行变为0.617/21.039/10.396/39.019ms，显示少量样本受JIT/调度影响，不能据此严格拟合指数阶或报告分位数。脚本验证两模式的正常/非法输入语义以及旧中文输入不能进入默认`\w`深回溯，性能数值只作定位边界示例。

本次是内容校准及评分/终态验收，不声称K8s/网络/支付渠道等教学情境已在真实生产复现。后续统一内容修订与发布基线由主线程处理。
