# T04B 大师系统四章逐题校准记录

范围为当前清单40题；不调整章节顺序、免费体验序列或发布修订号。原始版本4c5e25e。以下案例均为技术机制教学重建，日志与数值为教学样本，不是实际事故原始记录或生产性能实测。技术来源仅支持机制，不为虚构情境背书。

难度维度顺序：推理距离 / 证据形态 / 知识层次 / 反直觉度 / 跨层跨度 / 陷阱主动性；取中位数，半档向下。成本按定位必要证据人工裁定，修复与全仓制度审计不冒充已执行取证。两路径均逐动作运行真实computeGrade与假设终态规则。

## oversell-race（concurrency/1）

学习目标：竞态：检查与扣减是两步，并发下两步之间世界会变。

编审：人工裁定6⚡（原4、旧链6）；重建Redis非权威职责，删除严格100令牌却137独立成交与不可能的实物少37。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 账本→交错；原文依据（a-orderlog）：“同一进程内trace和DB语句审计：库存剩1时，多个请求先完成普通SELECT并读到1；随后各自执行stock=stock-1，最后37次将0扣到-37。”
2. 读值与事务对照；原文依据（a-code）：“事务中先普通SELECT stock，if>0再UPDATE stock=stock-1 WHERE id=2049，且无stock>0谓词/受保护锁读；INSERT订单与扣减同事务。UPDATE本身有行锁，但检查已在锁前发生。”
3. 锁边界与条件更新；原文依据（a-code）：“同构将库存设1、两个事务都先读1，再依次UPDATE，两者均插单、库存-1；仅改条件UPDATE并以affected rows=1才插单，第二笔不通过。唯一订单键不能单独防不同用户超卖。”
4. 语句成功而不变量错；原文依据（a-impact）：“订单明细137笔、不同支付流水/用户且无重试重复；活动初始DB库存100，未补货，137次有效扣减后为-37。137笔是真实承诺，不是已发出137件实物。”
5. 缓存提示到权威DB；原文依据（scene.architecture）：“秒杀服务→MySQL权威库存和订单；Redis仅缓存库存展示/粗略读提示，不承担原子预扣或唯一准入。”
6. 下架改变业务状态；原文依据（a-off）：“活动下架，超卖止损。已成交的 37 单走补偿方案（退款+补偿券）。”

标准路径：a-impact → a-orderlog → a-redis → a-code，6⚡，零错S；终态确认h-race，其余全部excluded。

替代路径：a-impact → a-redis → a-code → a-orderlog，6⚡，零错S；终态确认h-race，其余全部excluded。

停止点：【停止规则】真实订单与交错对照证明非原子准入，初始缓存值错、重复和盘点口径均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)。

## idempotent-fail（concurrency/2）

学习目标：幂等：同一操作执行一次和执行 N 次，结果必须相同。

编审：6⚡保留，明确MQ旁路，200晚于网关deadline；纠正唯一eventId即外部exactly-once和PAID检查充分论。

难度：L2→L2；六维[2, 3, 2, 2, 2, 2]。

1. 基数→父trace→回放；原文依据（a-orderlist）：“O-8811两张WMS单的调用父trace均为pay_callback请求C1/C2，actor=system；同一支付业务键P1，没有人工操作或MQ消费父trace。MQ审计消息另有ID A1，不参与这两次WMS API。”
2. 双端期限与调用归属；原文依据（a-code）：“on_callback按order.status==PAID就调用create_delivery，无唯一履约业务键。对同一P1回放两次，产生两次WMS创建；付款状态PAID不能表示已完成履约。”
3. 跨系统幂等边界；原文依据（a-code）：“修复应使用稳定业务键（订单+履约阶段/版本）创建唯一履约意图，再可靠投递，并让WMS以同键幂等。仅先插已处理再外呼会在崩溃时丢任务，外呼后才标记又可能重复。”
4. 200日志不等于收到；原文依据（a-impact）：“23笔业务订单各支付一次、WMS各有两张拣货单，两次触发间隔15~90秒。这提示重复输入，但不能凭“有间隔”排除跨请求并发或处理重叠。”
5. 回调到DB与WMS；原文依据（scene.architecture）：“支付网关→我方回调处理器→履约WMS；MQ仅发送已支付审计事件，WMS创建本案不由MQ消费触发。”
6. 作废/拦截副作用；原文依据（a-void）：“23 单全部拦截成功，未发出的直接作废，已发出的走拒收回款。”

标准路径：a-impact → a-orderlist → a-paylog → a-code，6⚡，零错S；终态确认h-retry，其余全部excluded。

替代路径：a-impact → a-orderlist → a-code → a-paylog，6⚡，零错S；终态确认h-retry，其余全部excluded。

停止点：【停止规则】重试输入与两次外部创建因果吻合，人工和MQ来源均排除；修复设计不冒充已经跨系统原子。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://www.rabbitmq.com/docs/confirms)、[官方资料2](https://docs.stripe.com/webhooks#handle-duplicate-events)。

## msg-order（concurrency/3）

学习目标：顺序是隐藏的维度：至少一次投递 + 覆盖写 = 旧数据随时可以覆盖新数据。

编审：人工裁定8⚡（原6漏源库和Redis反证）。三维L3而中位数2.5向下L2；补对账恢复制造者，去掉至少一次必乱序和状态枚举递增即通用版本论。

难度：L2→L2；六维[2, 3, 3, 2, 3, 2]。

1. 版本→重试→覆盖；原文依据（a-apiread）：“GET /order/8899/status → 200 {"status": "shipping"}  12:03:11”
2. 事件与写审计；原文依据（a-msgtrace）：“同订单业务版本v2 shipping、v3 shipped、v4 delivered依次提交，生产记录带该版本。扩容后轮询到不同RabbitMQ队列；v2首次通知超时并重投，v4先写，v2在12:03:05完成。”
3. 原子版本及副作用；原文依据（a-msgtrace）：“12:06对账任务读取订单库v4并补发，缓存恢复；不是无原因自己变回。时间戳经过事件ID/版本和写入确认关联，不仅凭不同机器最早日志判乱序。”
4. 最终正确仍曾旧写；原文依据（a-impact）：“14单集中在短时多次变更；12:03时即使重开App也仍旧，12:06后刷新才恢复。重开只是重新读当时服务数据，不能当作数据未损坏或客户端清白的证明。”
5. 源库/MQ/Redis/App；原文依据（scene.architecture）：“订单服务 → MQ(状态变更事件, 至少一次投递) → 推送服务 → Redis(最新状态) → App 轮询展示”
6. 重推掩盖下一次回退；原文依据（a-fixseq）：“同实体路由键和有序消费约束减少乱序；独立重试队列会绕开原顺序，不能声称它还能严格保证实体顺序。缓存采用原子业务版本比较；外部notify用独立幂等键，分别验证丢弃旧状态和保留必要副作用。”

标准路径：a-impact → a-apiread → a-msgtrace → a-codepush → a-orderstate → a-redislog，8⚡，零错S；终态确认h-order，其余全部excluded。

替代路径：a-impact → a-orderstate → a-redislog → a-codepush → a-msgtrace → a-apiread，8⚡，零错S；终态确认h-order，其余全部excluded。

停止点：【停止规则】业务版本、写审计与回放一致，App、源状态机及存储丢写/第三方覆盖均排除，恢复由明确对账动作解释。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://www.rabbitmq.com/docs/queues#message-ordering)、[官方资料2](https://redis.io/docs/latest/develop/programmability/eval-intro/)。

## false-lead（concurrency/4）

学习目标：告警告诉你"哪里在响"，不告诉你"哪里在着火"——第一个告警是最便宜的线索，不是最准确的答案。

编审：人工裁定7⚡（原6、旧链5遗漏ES和隔离证据）；改正Node每origin分池及4500需求算术，序列化清除旧重复对象键；量化、链式归因、反向直觉及跨系统四维L3，中位数3，保留L3。

难度：L3→L3；六维[3, 3, 2, 3, 3, 2]。

1. 多目标正常→阶段分解→全局预算→隔离因果链；原文依据（a-connpool）：“共享Agent配置maxSockets=50/每origin，maxTotalSockets=50/总量。快照广告48活动socket、推荐2，总50；推荐新请求在Agent.requests中等待，不是排在推荐服务内部。”
2. 活动归属与局部QPS量化模型；原文依据（a-connpool）：“共享Agent配置maxSockets=50/每origin，maxTotalSockets=50/总量。快照广告48活动socket、推荐2，总50；推荐新请求在Agent.requests中等待，不是排在推荐服务内部。”
3. Node Agent每origin/总量领域机制；原文依据（a-connpool）：“Node按origin分池，未设置全局总上限时，广告用满自己50不会自动占掉推荐50。这里是显式总预算导致争用。”
4. 告警目标正常而实际是另一目标占本机资源；原文依据（a-rec）：“推荐已到达请求P99约45ms；失败trace的3秒主要发生在分配socket前，尚未到推荐端。独立直连同一推荐目标正常。对端零告警不是充分证明，关键是本次失败尚未发送。”
5. 本机执行器与三个远端服务跨系统关联；原文依据（scene.architecture）：“App → 搜索服务(同时调推荐/广告/ES) → 推荐服务 + 广告服务 + ES”
6. 重启只暂时重置连接；原文依据（a-restartsvc）：“滚动重启释放连接池 + 杀掉广告服务的长请求。”

标准路径：a-rec → a-connpool → a-ad → a-es → a-separate，7⚡，零错S；终态确认h-pool，其余全部excluded。

替代路径：a-rec → a-es → a-ad → a-separate → a-connpool，7⚡，零错S；终态确认h-pool，其余全部excluded。

停止点：【停止规则】本机socket等待、显式总budget与隔离对照吻合，推荐/ES自身慢和错误路由均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://nodejs.org/docs/latest-v18.x/api/http.html#agentmaxsockets)、[官方资料2](https://nodejs.org/docs/latest-v18.x/api/http.html#agentmaxtotalsockets)。

## pool-deadlock（concurrency/5）

学习目标：全部线程在等结果，却没有线程在算结果。

编审：人工裁定5⚡（原4、旧链5但漏队列反证）。32子任务与8×4对齐，确定复现依赖barrier，纠正allOf再join就异步及Future等待>0告警。

难度：L2→L2；六维[2, 3, 3, 2, 2, 2]。

1. 归属→资源环→交错；原文依据（a-stacktrace）：“全量关联：8个父worker各submit4个子任务到同一固定8线程池，再Future.get；32子任务在队列。父任务等待的位置还未调用DB/借连接，排除SQL锁或借连接等待。”
2. 全栈/队列/barrier；原文依据（a-stacktrace）：“全量关联：8个父worker各submit4个子任务到同一固定8线程池，再Future.get；32子任务在队列。父任务等待的位置还未调用DB/借连接，排除SQL锁或借连接等待。”
3. 执行器资源饥饿；原文依据（a-stacktrace）：“形成资源等待环：父占全部worker→等子结果→子等worker；不是Java monitor锁的循环。”
4. 无monitor锁也死锁；原文依据（a-impact）：“8个运行worker均为父任务A~H；32个排队任务均为它们等待的子任务。资源归属提示池饥饿，单父正常是线索，不保证少于8在所有代码结构都不死锁。”
5. 调度器到任务执行器；原文依据（scene.architecture）：“报表调度器 → 线程池(8 workers, 无界队列) → 聚合任务(可拆分子任务并行) → DB”
6. 串行回滚牺牲吞吐；原文依据（a-danger）：“串行版上线，卡死消失。代价：报表耗时从 2 分钟回到 7 分钟。”

标准路径：a-impact → a-stacktrace → a-repro → a-queuecfg，5⚡，零错S；终态确认h-selfwait，其余全部excluded。

替代路径：a-impact → a-queuecfg → a-repro → a-stacktrace，5⚡，零错S；终态确认h-selfwait，其余全部excluded。

停止点：【停止规则】Future归属、全池资源环和受控交错一致，SQL锁、借连接与内存压力均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)、[官方资料2](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)。

## lock-expiry（concurrency/6）

学习目标：锁保护的是窗口，不是任务——窗口必须覆盖任务全生命周期。

编审：人工裁定5⚡（原4、旧链5遗漏时钟反证），必要续期排除合入同一锁审计；纠正30秒覆盖2分钟、T300误删T35已过期锁、看门狗保证互斥。六维中位数2.5向下L2。

难度：L3→L2；六维[2, 3, 3, 2, 3, 2]。

1. 租约→完成标记→写边界；原文依据（a-ttlmath）：“锁命令SET key unique-token NX EX30，无续期；Redis服务端审计同周期A获锁、30秒后过期、35秒B获锁。A任务仍执行且周期未标DONE，B检查未完成继续执行。”
2. 服务端命令和有效区间；原文依据（a-ttlmath）：“锁命令SET key unique-token NX EX30，无续期；Redis服务端审计同周期A获锁、30秒后过期、35秒B获锁。A任务仍执行且周期未标DONE，B检查未完成继续执行。”
3. 租约/fencing/幂等；原文依据（a-ttlmath）：“此前20秒完成可先写DONE；2分钟长尾本就有风险，不是增长后30秒才突然变成短于2分钟。”
4. 锁存在不保证执行权；原文依据（a-impact）：“事故 1：A T+0 获锁执行 → B T+34s 获锁”
5. 调度/Redis/外部账务；原文依据（scene.architecture）：“每小时同周期任务投递3实例；抢锁失败者每5s重试，获锁后检查周期完成标记；Redis租约；账务外部写入。”
6. 暂停入账影响业务；原文依据（a-danger）：“调度暂停，账务系统冻结对客入账；2,131 笔重复流水进入冲正流程。”

标准路径：a-impact → a-ttlmath → a-releasecheck → a-clockcheck，5⚡，零错S；终态确认h-ttl，其余全部excluded。

替代路径：a-impact → a-clockcheck → a-releasecheck → a-ttlmath，5⚡，零错S；终态确认h-ttl，其余全部excluded。

停止点：【停止规则】Redis租约区间和周期未完成记录解释首次重入，已有续期失效、提前DEL和客户端过期判断解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)。

## threadlocal-leak（concurrency/7）

学习目标：线程池复用线程——ThreadLocal 不清理，上下文就会穿越请求。

编审：人工裁定7⚡（原4、旧链5冒称排错全查）；补漏set必要条件、改正afterCompletion和HTTP指定线程论、null检查不识别旧身份。

难度：L2→L2；六维[2, 3, 3, 2, 3, 2]。

1. 前情→覆盖→复现；原文依据（a-tlexamine）：“实际过滤器：UserContext.set(userId); chain.doFilter(...); UserContext.remove(); // remove只在正常返回时执行，未放finally”
2. 身份/worker/代码序列；原文依据（a-tlexamine）：“实际过滤器：UserContext.set(userId); chain.doFilter(...); UserContext.remove(); // remove只在正常返回时执行，未放finally”
3. ThreadLocal生命周期；原文依据（a-tlexamine）：“前请求B抛异常由外层错误处理映射，remove被跳过；后请求A转到/internal/address-query，因排除规则不执行set，但公共组件读取旧B。”
4. 非null也可能错身份；原文依据（a-impact）：“例 1：串数据前 1.2s，同线程（tomcat-042）刚处理过一个抛异常的请求（NPE 日志）”
5. 网关/路由/worker/缓存；原文依据（scene.architecture）：“已认证网关把/my/address转到用户服务/internal/address-query；Tomcat复用worker；该内部路径被身份ThreadLocal过滤器排除，却仍调用UserContext读取身份。”
6. 下线上下文大改动；原文依据（a-danger）：“上下文机制下线，全部改回显式传参——代码改动面 40 个文件，回滚包紧急发布。”

标准路径：a-impact → a-tlexamine → a-threadreplay → a-cachekey → a-gatewaylog → a-asyncshare，7⚡，零错S；终态确认h-threadlocal，其余全部excluded。

替代路径：a-impact → a-gatewaylog → a-cachekey → a-asyncshare → a-threadreplay → a-tlexamine，7⚡，零错S；终态确认h-threadlocal，其余全部excluded。

停止点：【停止规则】受控同worker复现与过滤器边界吻合，缓存键、网关主体和异步共享解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ThreadLocal.html)、[官方资料2](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/servlet/HandlerInterceptor.html)。

## pool-rejection（concurrency/8）

学习目标：队列是缓冲不是容量——拒绝被吞掉，任务就蒸发了。

编审：人工裁定7⚡（原4、旧链5漏超时/回调）；修正catch返回位置、888.9/s算术、3.8小时与120000/日冲突、CallerRuns无条件保证及同分钟三账误判。

难度：L2→L2；六维[2, 3, 3, 2, 2, 2]。

1. 缺口→提交分支→受理；原文依据（a-rejectaudit）：“实际代码：try { executor.submit(task); } catch(RejectedExecutionException e) { log.debug("submit failed",e); }”
2. 满池回放和任务ID；原文依据（a-rejectaudit）：“实际代码：try { executor.submit(task); } catch(RejectedExecutionException e) { log.debug("submit failed",e); }”
3. 拒绝与可靠受理；原文依据（a-rejectaudit）：“return "已受理"; // return在catch之后，两条分支都返回受理”
4. 零ERROR不等于接受；原文依据（a-impact）：“缺口集中在短时高峰；分钟采样水位有时不足100%也不能排除采样间瞬时满。现有指标缺少attempted/accepted/rejected，先从具体订单与提交代码核对，不能把“线程池健康”当事实。”
5. 线程池到业务放行；原文依据（scene.architecture）：“下单 → 提交风控预检任务(线程池: 8 线程 + 1000 队列, AbortPolicy) → 立即返回"已受理" → 异步出结果”
6. CallerRuns转移负载；原文依据（a-danger）：“在executor未shutdown时CallerRuns可让拒绝任务在调用线程运行，形成背压；shutdown时默认CallerRuns会丢弃，不保证所有情况零丢。同步执行会转移CPU/时延到下单，必须按期限和吞吐验证，不能直接承诺300ms或25%下降。”

标准路径：a-impact → a-rejectaudit → a-policycheck → a-watermark → a-timeoutcheck → a-callbackcheck，7⚡，零错S；终态确认h-reject，其余全部excluded。

替代路径：a-impact → a-policycheck → a-timeoutcheck → a-callbackcheck → a-watermark → a-rejectaudit，7⚡，零错S；终态确认h-reject，其余全部excluded。

停止点：【停止规则】满池回放和返回契约确认静默拒绝，Discard误配、执行超时和回调丢失均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)。

## callback-mismatch（concurrency/9）

学习目标：闭包捕获共享变量 × 并发交错 = 结果串位。

编审：人工裁定7⚡（原4、旧链5漏邮件/表单），修正延迟render伪码无法解释A附件、0.2%与81/1000分母及owner==recipient无效授权断言。

难度：L2→L2；六维[2, 3, 3, 2, 2, 2]。

1. 批次→执行顺序→受控完成；原文依据（a-closureread）：“旧路径实际代码：”
2. 真实入口组合及Promise对照；原文依据（a-closureread）：“旧路径实际代码：”
3. JS闭包与迭代绑定；原文依据（a-closureread）：“for(var r of batch) {”
4. 低总体率掩盖确定分支；原文依据（a-impact）：“12个旧批次各有A/B两请求，A附件发送给B；其他5976次使用独立上下文。批次内关联是线索，不能由12个样本声称跨批永远不会发生。”
5. render到投递上下文；原文依据（scene.architecture）：“导出请求 → 任务池(并发 50) → 报表生成回调 → 邮件服务(按请求携带的收件人发送)”
6. 串行回滚影响吞吐；原文依据（a-danger）：“错配归零。代价：高峰导出排队 20 分钟，财务月结期间投诉上升。”

标准路径：a-impact → a-closureread → a-repro → a-mapcheck → a-maillog → a-formcheck，7⚡，零错S；终态确认h-closure，其余全部excluded。

替代路径：a-impact → a-formcheck → a-maillog → a-mapcheck → a-repro → a-closureread，7⚡，零错S；终态确认h-closure，其余全部excluded。

停止点：【停止规则】受控异步绑定复现成立，映射表、邮件重排和源表单均排除；修复不将owner与recipient错误等同。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures)、[官方资料2](https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-for-in-and-for-of-statements)。

