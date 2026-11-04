# T04B 工兵篇逐题校准记录

范围为当前清单29题；不调整章节顺序、免费体验序列或发布修订号。原始版本98cc581。以下案例均为技术机制教学重建，日志与数值为教学样本，不是实际事故原始记录或生产性能实测。技术来源仅支持机制，不为虚构情境背书。

难度维度顺序：推理距离 / 证据形态 / 知识层次 / 反直觉度 / 跨层跨度 / 陷阱主动性；取中位数，半档向下。成本按定位必要证据人工裁定，修复与全仓制度审计不冒充已执行取证。两路径均逐动作运行真实computeGrade与假设终态规则。

## config-typo（config-boot/1）

学习目标：配置键对不上时，框架静默用默认值——生效断言要成为配置的习惯。

编审：保留4⚡：逐字对照2⚡+来源快照1⚡是必要证据，修复不计定位成本。去除题面答案及错误的默认未知键告警承诺。

难度：L1→L1；六维[1, 1, 1, 1, 1, 1]。

1. 30s症状→精确键对照
2. 完整两行键名
3. 显式占位符默认值
4. 默认值与30s直接吻合
5. 同一应用配置绑定
6. 无危险试错动作

标准路径：a-impact → a-keydiff → a-loadcheck，4⚡，零错S；终态确认h-typo，其余全部excluded。

替代路径：a-impact → a-loadcheck → a-keydiff，4⚡，零错S；终态确认h-typo，其余全部excluded。

停止点：【停止规则】精确键不匹配和默认值路径已确认，加载、覆盖、profile均有反证。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## boot-order（config-boot/2）

学习目标：启动成功必须有精确定义——核心依赖 fail-fast，非核心显式降级。

编审：保留4⚡，修正MQ依赖因果、三条WARN及缓存污染自相矛盾；区分核心监听与可降级预热。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 功能分组→初始化分支
2. 日志与代码交叉
3. 就绪契约与初始化
4. 端口正常而功能缺失
5. 业务组件与DB时间窗
6. 重启恢复掩盖无重试

标准路径：a-impact → a-bootlog → a-poolcheck，4⚡，零错S；终态确认h-swallow，其余全部excluded。

替代路径：a-impact → a-poolcheck → a-bootlog，4⚡，零错S；终态确认h-swallow，其余全部excluded。

停止点：【停止规则】启动失败被忽略且无重试已确认，缓存占位、池等待和旧地址均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## hot-reload-gap（config-boot/3）

学习目标：推送解决"送达"，不解决"生效"——热更新需要刷新语义。

编审：保留4⚡；以使用点核对替代非必要全仓审计，修复字段注解错误及自动刷新过度概括。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 送达→绑定→读取
2. 运行值+代码+对照
3. 单例与刷新作用域
4. ACK成功仍旧值
5. 配置监听与业务字段
6. 重启可暂时掩盖

标准路径：a-impact → a-injectmode → a-usageaudit2，4⚡，零错S；终态确认h-frozen，其余全部excluded。

替代路径：a-impact → a-usageaudit2 → a-injectmode，4⚡，零错S；终态确认h-frozen，其余全部excluded。

停止点：【停止规则】Environment与字段差异及刷新对照已确认，键错、二次缓存和业务缓存均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)、[官方资料2](https://docs.spring.io/spring-cloud-commons/reference/spring-cloud-commons/application-context-services.html)。

## priority-clash（config-boot/4）

学习目标：同一键多个来源时，优先级链决定最终事实——同键多源就是治理工单。

编审：保留4⚡，纠正环境变量映射、固定Nacos优先级和双confirmed；全仓审计移出必要定位路径。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 面板→来源→运行
2. 有序来源与启动记录
3. 绑定与优先级
4. 送达成功但未采纳
5. 部署环境到应用池
6. 再改高优先级来源掩盖治理

标准路径：a-impact → a-sourcecheck → a-runtimecheck，4⚡，零错S；终态确认h-priority，其余全部excluded。

替代路径：a-impact → a-runtimecheck → a-sourcecheck，4⚡，零错S；终态确认h-priority，其余全部excluded。

停止点：【停止规则】实际来源覆盖已确认，键错、随机顺序及未重启均有反证。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## profile-maze（config-boot/5）

学习目标：profile 分层合并的隐形差异——环境专属键必须显式盘点。

编审：保留4⚡；把注入/版本反证真正写入被执行动作，区分包内文件与部署外置文件。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 同输入→最终值→origin
2. diff与单变量复验
3. profile合并与外置配置
4. 镜像同而行为不同
5. 部署目录到应用输出
6. 文件级回滚破坏其他合法项

标准路径：a-impact → a-profilediff → a-artifactcompare，4⚡，零错S；终态确认h-profile，其余全部excluded。

替代路径：a-impact → a-artifactcompare → a-profilediff，4⚡，零错S；终态确认h-profile，其余全部excluded。

停止点：【停止规则】外置profile差异及输出对照已确认，产物、版本、注入均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)。

## boot-storm（config-boot/6）

学习目标：恢复期的惊群要有刹车——分批、爬坡、抽样预热。

编审：人工裁定必要成本6⚡（原4遗漏DB状态与探活反证），不因章尾保留L3；六维中位数2.5向下为L2。重写不可能的980/800与混合单位算式。

难度：L3→L2；六维[2, 3, 2, 3, 2, 3]。

1. 区分首场与恢复事件
2. 多曲线与单位核算
3. 连接和预热容量
4. 恢复反而过载
5. 应用启动到DB资源
6. 无退避重启再次触发

标准路径：a-impact → a-stormcurves → a-dbhealth → a-poolcfg → a-probestorm，6⚡，零错S；终态确认h-storm，其余全部excluded。

替代路径：a-impact → a-dbhealth → a-poolcfg → a-probestorm → a-stormcurves，6⚡，零错S；终态确认h-storm，其余全部excluded。

停止点：【停止规则】恢复风暴有时间线和同构对照，残留慢查询、稳态超配和探活主因均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/too-many-connections.html)、[官方资料2](https://dev.mysql.com/doc/refman/8.0/en/innodb-preload-buffer-pool.html)。

## required-field（contract/1）

学习目标：新增请求必填字段会破坏既有调用；响应新增字段也需要验证消费者是否允许扩展。

编审：人工裁定5⚡，原4漏编码反证；75%统一为35%+40%，去掉响应加字段永远安全断言。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 版本边界→契约变更
2. 请求与校验对照
3. 兼容性与校验
4. 新增字段破坏旧端
5. 客户端到服务端
6. 网关注入增加规则散落

标准路径：a-impact → a-schemacheck → a-gatewayroute → a-encodingcheck，5⚡，零错S；终态确认h-required，其余全部excluded。

替代路径：a-impact → a-gatewayroute → a-encodingcheck → a-schemacheck，5⚡，零错S；终态确认h-required，其余全部excluded。

停止点：【停止规则】新增必填的单变量对照成立，路由、TLS和编码反证齐备。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://json-schema.org/understanding-json-schema/reference/object)、[官方资料2](https://spec.openapis.org/oas/v3.1.1.html)。

## doc-drift（contract/2）

学习目标：运行输出说明现状，已发布契约约束承诺；二者冲突不能自动判实现正确。

编审：人工裁定5⚡，补消费者脚本反证。统一GET响应场景，列足5处类型差异；修正实现必然正确、mock同源自动发现错误等不实承诺。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 差异→构建发布
2. DTO/输出/schema三方
3. 序列化与契约
4. 生成过仍会过期
5. 构建到合作方解析
6. 只锁文档不能交付

标准路径：a-impact → a-docvscode → a-versioncheck → a-scriptcheck，5⚡，零错S；终态确认h-drift，其余全部excluded。

替代路径：a-impact → a-versioncheck → a-scriptcheck → a-docvscode，5⚡，零错S；终态确认h-drift，其余全部excluded。

停止点：【停止规则】同版本输出与发布schema脱节已确认，版本、序列化和消费者脚本候选排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://spec.openapis.org/oas/v3.1.1.html)、[官方资料2](https://json-schema.org/understanding-json-schema/reference/object)。

## timeout-contract（contract/3）

学习目标：超时是递减的预算链——每层预算要覆盖下一层的最坏情况。

编审：人工裁定5⚡，不保留没测的2.4倍或并行P99理论减半。8→12应增加4，40%重试按总尝试口径计算约1.67倍。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 分布→trace→取消
2. 计数及受控对照
3. 预算和协作取消
4. 重试加重失败
5. SDK到聚合与下游
6. 加长超时掩盖预算

标准路径：a-impact → a-timeouttable → a-p99check → a-retryaudit，5⚡，零错S；终态确认h-mismatch，其余全部excluded。

替代路径：a-impact → a-p99check → a-retryaudit → a-timeouttable，5⚡，零错S；终态确认h-mismatch，其余全部excluded。

停止点：【停止规则】客户端先退出且服务端继续工作已确认，网关先超时、全都慢和重试凭空制造失败已排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://grpc.io/docs/guides/deadlines/)、[官方资料2](https://grpc.io/docs/guides/cancellation/)。

## enum-drift（contract/4）

学习目标：枚举的语义漂移比类型漂移更毒——值合法、含义错。

编审：人工裁定5⚡；重建一致的PAID→3→SHIPPED叙事，消除原追踪自我否定；修正直接改字符串的二次破坏。

难度：L2→L2；六维[2, 2, 2, 3, 2, 2]。

1. 三状态层→映射
2. diff与单变量样例
3. 序列化协议映射
4. 类型合法语义相反
5. 生产者到消费者
6. 改文档追认破坏

标准路径：a-impact → a-enumdiff → a-ordertrace → a-fieldmap，5⚡，零错S；终态确认h-semantic，其余全部excluded。

替代路径：a-impact → a-fieldmap → a-ordertrace → a-enumdiff，5⚡，零错S；终态确认h-semantic，其余全部excluded。

停止点：【停止规则】同一订单的编码对照成立，乱序、历史混写及字段误用均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://spec.openapis.org/oas/v3.1.1.html)。

## error-contract（contract/5）

学习目标：错误响应也是契约——message 给人看，code 给程序读。

编审：保留4⚡；原“账户余额不足”仍包含关键字，不能复现；换为真实不包含的文案，3处实际影响与14处潜在风险分开。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 现象→执行分支
2. 字节和真实includes
3. 展示与协议职责
4. 文案变更改逻辑
5. 错误提供方到前端
6. 回滚只能暂时恢复

标准路径：a-impact → a-erroranatomy → a-encoding，4⚡，零错S；终态确认h-nocontract，其余全部excluded。

替代路径：a-impact → a-encoding → a-erroranatomy，4⚡，零错S；终态确认h-nocontract，其余全部excluded。

停止点：【停止规则】真实字符串判断复现成立，无code耦合已确认，编码、缓存、网关均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes)、[官方资料2](https://spec.openapis.org/oas/v3.1.1.html)。

## contract-review（contract/6）

学习目标：把兼容、废弃、限流与语义承诺转成可执行门禁，而非仅给条款命名。

编审：人工裁定6⚡（原8、实际链5且漏限流审查）；把多个真实缺陷误标false的问题改为共同缺陷与三个可证伪方案。六维中位数2，L3→L2。

难度：L3→L2；六维[2, 3, 2, 2, 2, 2]。

1. 条款→反例→门禁
2. 跨条款对照
3. 契约与容量验证
4. 完整框架仍不可执行
5. 平台到消费者
6. 草率批准或整包否决

标准路径：a-impact → a-compatcheck → a-sunsetcheck → a-ratecheck → a-errorcheck，6⚡，零错S；终态确认h-compat，其余全部excluded。

替代路径：a-impact → a-ratecheck → a-errorcheck → a-sunsetcheck → a-compatcheck，6⚡，零错S；终态确认h-compat，其余全部excluded。

停止点：【停止规则】共同门禁缺失成立，延长期限、统一加阈值和格式保证三个替代方案均被具体反例排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://spec.openapis.org/oas/v3.1.1.html)、[官方资料2](https://www.rfc-editor.org/rfc/rfc6585#section-4)。

## pool-exhausted（data/1）

学习目标：连接池：池是共享资源，任何租户不还，所有人都借不到。

编审：人工裁定8⚡，原6缺泄漏/主库反证且6条SQL无法占20连接；改成20条关联持有记录，不以“池满”直接排除流量。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 池报错→持有者→SQL
2. 池/线程/DB关联
3. 池租借与并发
4. CPU闲而请求排队
5. 应用池到主库
6. 重启不阻止job重跑

标准路径：a-impact → a-poolstat → a-slowquery → a-stack → a-mysql，8⚡，零错S；终态确认h-slow，其余全部excluded。

替代路径：a-impact → a-mysql → a-stack → a-poolstat → a-slowquery，8⚡，零错S；终态确认h-slow，其余全部excluded。

停止点：【停止规则】20条长查询与20池持有者吻合、受控回放恢复；普通流量、失联泄漏和主库整体故障均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/explain-output.html)。

## cache-drift（data/2）

学习目标：缓存与数据库之间，永远隔着一致性窗口。

编审：人工裁定5⚡（原4、旧链6）；移除重复DB证明但增加独立图片反证，限制真实影响群和刷新上限。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 端差异→副本→失效
2. 同主键对照+diff
3. Cache-Aside时效
4. 成功上传仍旧值
5. 应用/Redis/DB/CDN
6. 回滚要清受影响值

标准路径：a-impact → a-userprobe → a-gitlog → a-imgurl，5⚡，零错S；终态确认h-cache，其余全部excluded。

替代路径：a-impact → a-imgurl → a-gitlog → a-userprobe，5⚡，零错S；终态确认h-cache，其余全部excluded。

停止点：【停止规则】旧缓存返回与失效变更对照成立，数据库写入和新图片访问证据齐备。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)。

## slow-query（data/3）

学习目标：EXPLAIN 是 SQL 排查的显影液；数据增长不是根因，是放大器。

编审：人工裁定6⚡（原5），移除重复慢日志读取，补锁/资源反证；DDL标危险9⚡且不计定位成本。修正filesort和高扫描比过度推断。

难度：L2→L2；六维[2, 2, 2, 2, 2, 2]。

1. 慢化→计划→索引
2. 计划/定义/等待与对照
3. 索引与排序
4. ALL不等于磁盘排序
5. 应用到存储计划
6. DDL同样有锁风险

标准路径：a-impact → a-explain → a-tablestruct → a-lockcheck → a-hostmetric，6⚡，零错S；终态确认h-index，其余全部excluded。

替代路径：a-impact → a-lockcheck → a-hostmetric → a-explain → a-tablestruct，6⚡，零错S；终态确认h-index，其余全部excluded。

停止点：【停止规则】匹配索引缺失及同数据优化对照成立，增长必然、锁和整体资源解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/explain-output.html)、[官方资料2](https://dev.mysql.com/doc/refman/8.0/en/order-by-optimization.html)、[官方资料3](https://dev.mysql.com/doc/refman/8.0/en/innodb-online-ddl-limitations.html)。

## cache-review（data/4）

学习目标：缓存设计的取舍：先问业务时效，再定技术参数。

编审：人工裁定8⚡保留：每项建议需独立边界核验，原专家链5⚡却声称三风险全查。改成价格路径和三个可证伪替代方案，不再把真实风险标false。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 约束→样例→收费
2. 多反例对照
3. 缓存时效与结算
4. 容量好仍能值错
5. 展示与订单收费
6. 原稿批准跳过红线

标准路径：a-impact → a-orderpath → a-avalanche → a-stampede → a-capacity，8⚡，零错S；终态确认h-price，其余全部excluded。

替代路径：a-impact → a-capacity → a-stampede → a-avalanche → a-orderpath，8⚡，零错S；终态确认h-price，其余全部excluded。

停止点：【停止规则】低流量旧价成交路径成立，雪崩唯一解释、互斥单独解决和容量解决三种方案均被反例排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)。

