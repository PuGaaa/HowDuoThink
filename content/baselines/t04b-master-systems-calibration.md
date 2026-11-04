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

## mq-lost（messaging/1）

学习目标：消息链路三段：生产者→Broker→消费者——丢在哪一段，排查方向完全不同。

编审：人工裁定7⚡（原5、重复动作旧链仅2）。SDK统一amqplib、L1升L2；重建一次崩溃3%而非每天固定3%，区分confirm背压/路由/持久化，消除多真因却false。

难度：L1→L2；六维[2, 3, 2, 2, 2, 2]。

1. 同批ID→两处丢失窗口；原文依据（a-confirmcheck）：“Node amqplib使用createChannel而非createConfirmChannel，无confirm回调或waitForConfirms；publish boolean只表示客户端背压。false也不是投递失败，应等待drain；true更不是持久化成功。”
2. 唯一ID账本与重启关联；原文依据（a-durablecheck）：“队列durable:false，消息persistent:false；重启会丢该队列及尚未消费的瞬态消息。即使publisher confirm收到，也不使非持久化消息自动跨重启保留。”
3. confirm/route/persistence语义；原文依据（a-durablecheck）：“本案可靠性缺陷包含成功边界和重启保留两项，不能把持久化这个真实缺口另标为假根因。”
4. true不等于可靠送达；原文依据（a-impact）：“固定10000条唯一业务ID，应用都宣称成功；消费结果9700，缺300。按ID而非混合日计数关联，暂不从“没收到”推断到底丢在哪一段。”
5. 发送端/Broker/消费者；原文依据（scene.architecture）：“库存服务(生产者) → RabbitMQ(exchange→queue) → 物流服务(消费者)”
6. 热改durable可能属性冲突；原文依据（a-rollbackmq）：“回滚前先核对队列声明兼容性；同名队列从durable:false直接声明为true会发生属性不等价错误，不能仅热改配置承诺恢复。迁移需处理已有队列和待重发意图，并验证新流量确认。”

标准路径：a-impact → a-confirmcheck → a-durablecheck → a-msgcount → a-brokerlog → a-routecheck → a-ackcheck，7⚡，零错S；终态确认h-confirm/h-durable，其余全部excluded。

替代路径：a-impact → a-ackcheck → a-routecheck → a-msgcount → a-durablecheck → a-confirmcheck → a-brokerlog，7⚡，零错S；终态确认h-confirm/h-durable，其余全部excluded。

停止点：【停止规则】同批ID两段缺口与瞬态队列崩溃证据吻合，路由和消费者先ack解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://amqp-node.github.io/amqplib/channel_api.html)、[官方资料2](https://www.rabbitmq.com/docs/confirms)、[官方资料3](https://www.rabbitmq.com/docs/queues#queue-properties)。

## mq-duplicate（messaging/2）

学习目标：at-least-once 语义下，重复不是异常，是常态。

编审：人工裁定7⚡（原4），补付款/拓扑反证；移除RabbitMQ消费ack等待Broker确认、内置8/28s退避及messageId自动幂等假象。

难度：L2→L2；六维[2, 3, 3, 2, 3, 2]。

1. 交易→入队→delivery→提交；原文依据（a-paylog）：“订单 P20260929001 在支付服务只有一次支付请求（11:01:58，带防重令牌）。”
2. channel/连接与业务关联；原文依据（a-logcheck）：“同一入队事件/P1：11:02:11首次开始，17.2秒业务副作用已提交；17.3秒连接关闭，ack未到Broker。19秒重投；第二次完成后ack帧在中断网络未到Broker，45秒连接失效被关闭，47秒第三投递。”
3. ack及跨系统副作用；原文依据（a-logcheck）：“RabbitMQ消费者basic.ack通常是单向方法，没有“等Broker回ack确认超时”的二次确认。这里是连接关闭仍有unacked导致重投，8/28秒来自具体断线/重连，不是Broker内置指数退避。”
4. 处理成功仍会重投；原文依据（a-impact）：“同一支付业务键出现2~3次流水和短信意图。8秒/28秒间隔只是形状，用户也可能隔秒重试，不能单靠间隔排除付款重复。需要相同键与Broker投递关联。”
5. Broker/业务DB/短信；原文依据（scene.architecture）：“RabbitMQ同一工作队列→2个竞争消费者→本地流水和短信投递；单支付业务键P1，副作用各自不幂等。”
6. 停消费增加积压；原文依据（a-rollback）：“消费者暂停，积压消息暂存队列；财务按对账名单冲正多记流水，补发安抚短信。”

标准路径：a-impact → a-paylog → a-publish → a-topology → a-logcheck → a-idemsearch，7⚡，零错S；终态确认h-redeliver，其余全部excluded。

替代路径：a-impact → a-topology → a-paylog → a-publish → a-idemsearch → a-logcheck，7⚡，零错S；终态确认h-redeliver，其余全部excluded。

停止点：【停止规则】入队、连接、投递与业务提交关联，重复生产/广播/付款均排除，副作用无幂等已确认。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://www.rabbitmq.com/docs/confirms)、[官方资料2](https://www.rabbitmq.com/docs/reliability)。

## mq-dlq（messaging/3）

学习目标：死信队列是隔离区不是垃圾桶——只进不出的兜底等于没有兜底。

编审：人工裁定8⚡（原4、旧链5漏3类反证）。修复21/17天与80412总量、500条98.7%非整数、缺字段非JSON解码错误及重放条数不等于成功通知。

难度：L2→L2；六维[2, 3, 2, 2, 3, 2]。

1. 快照→样例→兼容对照；原文依据（a-sample）：“不同日期样例为ValidationError: pushTemplateId Field required；旧基线样例是手机号格式无效。JSON文本可正常解析，缺业务必填字段不是JSONDecodeError。样例说明字段校验方向，不代表全部80412条同死因。”
2. 分层样本与累计账；原文依据（a-version）：“Python消费schema新增pushTemplateId必填，上游旧合法消息无此字段。受控旧消息在旧消费者可处理、新版在字段校验拒绝；仅提供兼容映射或撤销新增必填后同输入通过。”
3. schema/DLX领域机制；原文依据（a-version）：“这支持契约破坏，不以第一个错误日志或单次版本相关性判根因。”
4. 主队列正常仍隔离失败；原文依据（a-impact）：“快照累计80412：前4天历史基线共480；D-17跳变9800；随后16天共70132（约4383/天），合计80412。时间单位与总量一致。”
5. 生产契约/消费/通道/治理；原文依据（scene.architecture）：“订单服务 → MQ(订单通知) → 通知消费者(发短信/Push) —失败重试3次→ 死信队列 DLQ（无消费者、无监控）”
6. 回放可能过期或重复；原文依据（a-rollback）：“回滚到旧版消费者（无新字段校验），增量通知恢复发送，DLQ 停止增长。”

标准路径：a-impact → a-sample → a-version → a-ratio → a-smslog → a-retry → a-monitor，8⚡，零错S；终态确认h-format，其余全部excluded。

替代路径：a-impact → a-monitor → a-retry → a-smslog → a-ratio → a-version → a-sample，8⚡，零错S；终态确认h-format，其余全部excluded。

停止点：【停止规则】同输入版本对照及DLX原因吻合，孤立毒消息、配额和误转移解释均排除，长期静默有监控证据。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://www.rabbitmq.com/docs/dlx)、[官方资料2](https://docs.pydantic.dev/latest/errors/errors/#error-messages)。

## mq-delay（messaging/4）

学习目标：时刻与时长要分开，已从目标减去当前时间后不能再次扣创建后经过时长。

编审：人工裁定7⚡（原4、旧链5却遗漏queuelog/多项排错）；原时区因果无法产生不定分钟偏差，重建可复算重复扣elapsed机制。四维L3保留L3。

难度：L3→L3；六维[3, 3, 2, 3, 2, 3]。

1. 多时刻→变偏差→重复扣除机制；原文依据（a-queuelog）：“三个记录delayMs为1020000/1320000/1500000（17/22/25分钟），dueAt为18:47/18:52/18:55；正确剩余均1800000。MQ是在对应dueAt后收到，提前已发生在调度字段。”
2. 提前量与elapsed函数对账；原文依据（a-tzaudit）：“实际代码：const remaining = targetEpoch - nowEpoch;”
3. epoch/持续时间领域机制；原文依据（a-tzaudit）：“const delayMs = remaining - (nowEpoch - createdEpoch);”
4. 时区看似可疑但三个epoch正确；原文依据（a-impact）：“同目标19:00、同写表18:30：创建18:17→执行18:47（提前13）；18:22→18:52（提前8）；18:25→18:55（提前5）。提前量恰等于写表前已经经过的13/8/5分钟。变化形状提示输入依赖，不足以单独排除任何机器漂移。”
5. 调度表到消息投递两跳；原文依据（scene.architecture）：“运营创建活动→延迟服务写应用调度表dueAt→扫描dueAt<=now后发布MQ→开售执行器；时间统一为带时区解析后的epoch。”
6. 只统一UTC看似正确却未修重复扣；原文依据（a-haltdeliver）：“延迟开售入口下线，未执行的活动转人工定时；队列中未到期消息全部废弃重建。”

标准路径：a-impact → a-queuelog → a-tzaudit → a-poller → a-ntp → a-settime，7⚡，零错S；终态确认h-tz，其余全部excluded。

替代路径：a-impact → a-settime → a-ntp → a-poller → a-queuelog → a-tzaudit，7⚡，零错S；终态确认h-tz，其余全部excluded。

停止点：【停止规则】13/8/5分钟公式复算与实际dueAt吻合，扫描提前、目标误解和时钟漂移均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.parse)、[官方资料2](https://docs.python.org/3/library/datetime.html#datetime.timedelta)。

## mq-slowpart（messaging/5）

学习目标：分区内保序的代价是队头阻塞——一条慢消息卡住整个分区。

编审：人工裁定7⚡（原4、旧链5漏并发/Broker反证）。重建250条/480秒自洽模型，局部五分之一与全局八成分开；不擅自事后风控。四维L3，中位数3，L2升L3。

难度：L2→L3；六维[3, 3, 2, 3, 3, 2]。

1. 局部/全局→成本分布→顺序等待；原文依据（a-skewstat）：“按同一窗口入队消息数量和key分布核对，16分区无显著量倾斜；但类型/耗时倾斜确实存在。排除“只有消息数量过多”的解释，不把数量均匀当内容也均匀。”
2. 服务时间加权与积压模型；原文依据（a-handlereval）：“正常handler持有约0.48s（含I/O）；慢4分区每250条中1条人工审核约480s，无期限；同分区后续不启动。阻塞栈在风控HTTP，非fetch或CPU。”
3. 分区串行领域机制；原文依据（a-handlereval）：“本案单分区串行处理造成应用队头阻塞，不把所有Kafka客户端都描述成Broker强制等业务回调才允许后续读取。”
4. CPU闲却长审核占进度；原文依据（a-impact）：“消息数量各分区偏差<6%，但慢4分区约0.4%触发8分钟人工审核，其余分区该类型接近0。局部下降80%，按4/16权重只导致全局下降约20%；不能在12/16正常且均量时说全局掉80%。”
5. Kafka/handler/风控与业务待审；原文依据（scene.architecture）：“Kafka16分区，应用明确按分区单任务串行处理；8实例×2处理线程，按分区追踪分配；handler同步等待风控结果。”
6. 回滚审核会改变业务承诺；原文依据（a-rollbackmq）：“不能擅自把事前风控改成事后补审并当订单通过。止血可对待审核订单明确挂起、限制进入该路径，保留业务审核承诺；任何临时放行需业务明确接受风险。”

标准路径：a-impact → a-skewstat → a-conccfg → a-brokerio → a-handlereval → a-poisoncount，7⚡，零错S；终态确认h-slowcall，其余全部excluded。

替代路径：a-impact → a-brokerio → a-conccfg → a-skewstat → a-poisoncount → a-handlereval，7⚡，零错S；终态确认h-slowcall，其余全部excluded。

停止点：【停止规则】慢handler栈、同窗分配和量化模型吻合，量倾斜、少配线程和Broker取数慢均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)。

## partition-split（messaging/5）

学习目标：保序承诺的边界 = 分区拓扑——改分区数就是重排所有 key 的家。

编审：人工裁定6⚡（原4）补生产/源序列反证；纠正所有key重排、Kafka缩分区、6→12必须24及时间戳重放/无差别丢旧增量。五维L3保留L3。

难度：L3→L3；六维[3, 3, 2, 3, 3, 3]。

1. 实体跨切换→路由→旧积压→投影；原文依据（a-rebalanceaudit）：“本案显式key分区算法positiveHash(key)%N；一个样本hash余24为19，则余12为7。均匀hash下12→24约一半落点不变、一半变为旧p+12，不是所有key都换家。”
2. hash余数与offset/业务序列对账；原文依据（a-rebalanceaudit）：“本案显式key分区算法positiveHash(key)%N；一个样本hash余24为19，则余12为7。均匀hash下12→24约一半落点不变、一半变为旧p+12，不是所有key都换家。”
3. 分区路由领域机制；原文依据（a-rebalanceaudit）：“旧记录不会自动搬迁，新记录按新N定位，两分区各自有序仍无跨分区先后保证；该实体跨切换序列可乱序，不代表一定每次都会乱。”
4. 扩容正常却打破实体顺序；原文依据（a-impact）：“同keyK的支付事件14:00前写p7/offset801，仍积压；14:02发货按新分区数写p19/offset5且先完成，14:06才处理p7旧事件。同事件ID无双发。跨分区offset不能直接比较大小，应关联实体业务序列。”
5. 生产/Broker/消费者/投影；原文依据（scene.architecture）：“订单服务 → 订单事件 topic(原 12 分区, key=orderId, 分区内 FIFO) → 状态服务(按事件顺序维护订单状态机) ｜ 大促扩容: 分区 12→24, 消费者 6→12”
6. 缩分区/双写看似回退但不保证；原文依据（a-danger）：“Kafka标准分区管理不能把已增加分区直接减回12；该调用会被拒绝，不是自动第二次重排。若删除/新建主题或改自定义路由则是另一次迁移，存在数据和顺序风险，不能把它冒充简单回滚。”

标准路径：a-impact → a-rebalanceaudit → a-consumerspeed → a-producercheck → a-ordercheck，6⚡，零错S；终态确认h-resplit，其余全部excluded。

替代路径：a-impact → a-ordercheck → a-producercheck → a-consumerspeed → a-rebalanceaudit，6⚡，零错S；终态确认h-resplit，其余全部excluded。

停止点：【停止规则】取模、旧积压与跨分区完成顺序一致，单分区倒序、新事件双发和源业务序列错误均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://kafka.apache.org/41/documentation/#basic_ops_modify_topic)、[官方资料2](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)。

## mq-bus-review（messaging/6）

学习目标：事件总线把一次调用变成一份承诺——发出去的每个事件都要到、要对、要有序。

编审：人工裁定7⚡（原8、旧链6却漏两类审查），把多个真缺陷误标false改成核心契约错配及三个可证伪误区；明确Kafka而非混合queue/group语义，保留L3。

难度：L3→L3；六维[3, 3, 2, 3, 3, 3]。

1. 合同基数→拓扑→顺序/恢复；原文依据（a-orderproof）：“同group的assignment按分区分摊：库存只领部分，分析领另一部分，双方各缺事件。另因null key，同订单事件可分散分区，独立处理不提供实体顺序。”
2. 1600与100交付模型；原文依据（a-orderproof）：“同group的assignment按分区分摊：库存只领部分，分析领另一部分，双方各缺事件。另因null key，同订单事件可分散分区，独立处理不提供实体顺序。”
3. Kafka组/offset领域机制；原文依据（a-orderproof）：“用独立group满足各业务交付，按需key=orderId并定义生产、分区内处理和重试顺序；一个key本身不保证消费者任意并发也有序。”
4. 总线化反而让业务漏订阅；原文依据（a-impact）：“合同要求每个订阅方各处理同100事件，即1600份交付；草案相同group实际每条记录分给组内一个消费者，合计约100份而非1600。”
5. 发布/16业务/Broker进度；原文依据（scene.architecture）：“Kafka order-events（16分区、无key）；16个不同业务下游都要独立订阅，但草案统一group.id=order-subscribers；失败3次后commit offset丢弃。”
6. 同group省管理及先commit看似便利；原文依据（a-approve）：“原稿直接发布会违反已知交付份数和恢复承诺；具体事故数量与发生日未验证，不能写成双11预演已发生。”

标准路径：a-impact → a-orderproof → a-slowprobe → a-schemaprobe → a-dropprobe，7⚡，零错S；终态确认h-ordering，其余全部excluded。

替代路径：a-impact → a-dropprobe → a-schemaprobe → a-slowprobe → a-orderproof，7⚡，零错S；终态确认h-ordering，其余全部excluded。

停止点：【停止规则】交付基数与组语义错配成立，独立组必共享、编码万能及commit自动重试三个命题均被反例排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)。

## rebalance-storm（messaging/7）

学习目标：留在消费者组里有两个时钟——心跳之外，还有拉取间隔的死线。

编审：人工裁定7⚡（原4、旧链5漏两项反证），固定classic动态协议；纠正10分钟周期与300秒、6×40=8%、N×P95硬预算及心跳绝不受GC影响。四维L3升L3。

难度：L2→L3；六维[3, 3, 2, 3, 3, 2]。

1. 心跳/进度两时钟→成员协议→旧任务；原文依据（a-pollaudit）：“动态classic Java消费者在max.poll.interval内未继续poll，会因进度超时失去组成员资格；旧处理线程不会自动停止，迟到提交可能失败或副作用重复。”
2. 批时长与期限矩阵；原文依据（a-pollaudit）：“动态classic Java消费者在max.poll.interval内未继续poll，会因进度超时失去组成员资格；旧处理线程不会自动停止，迟到提交可能失败或副作用重复。”
3. Kafka组进度领域机制；原文依据（a-pollaudit）：“本题慢批500条含2个160秒审核，加普通处理约40秒，总360秒>300。未提交记录可由新成员再取，不能把这叫Broker根据积压主动搬分区。”
4. 仍有心跳却失去所有权；原文依据（a-impact）：“慢实例处理批期间，心跳在max.poll期限前仍有记录；最后poll到超期约300秒，客户端报告poll timeout并离组。其余实例poll<60秒。不是“仍有心跳所以必不能被移出”。”
5. worker/客户端/coordinator/副作用；原文依据（scene.architecture）：“Kafka Java classic协议，动态成员（无group.instance.id），eager RangeAssignor；24分区/6实例；max.poll.interval=300s、session.timeout=600s，Broker允许该范围。”
6. 放宽期限延长停滞窗口；原文依据（a-danger）：“将max.poll放宽30分钟可能使当前6分钟批不再触发进度超时，但没有修复慢批或副作用重复；真正进程心跳消失仍按session检测，不能说它关闭了所有故障转移。放宽后的进度停滞窗口需明确承担。”

标准路径：a-impact → a-pollaudit → a-repro → a-sessioncfg → a-brokermove → a-deploylog，7⚡，零错S；终态确认h-polltimeout，其余全部excluded。

替代路径：a-impact → a-deploylog → a-brokermove → a-sessioncfg → a-repro → a-pollaudit，7⚡，零错S；终态确认h-polltimeout，其余全部excluded。

停止点：【停止规则】协议、批时长与coordinator原因一致，session失联、Broker积压迁移和部署扰动均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://kafka.apache.org/41/configuration/consumer-configs/#max.poll.interval.ms)、[官方资料2](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)。

## replay-surge（messaging/7）

学习目标：重放是全量负载注入——幂等窗口、下游容量、时效语义都要在重放前对表。

编审：人工裁定6⚡（原4、旧链4漏资格/修复反证）；统一11000实际执行、9900重复29700积分，81000只潜在；删除全预插已处理导致漏任务的错误修复，保留L3。

难度：L3→L3；六维[3, 3, 2, 3, 3, 3]。

1. 候选/执行→业务权益→负载；原文依据（a-idemaudit）：“去重以msgId保留7天，候选92%超过7天；这只表示可能超出去重窗口，不等于92%都应处理或都重复。按稳定积分权益业务键关联人工和自动流水，确认27000已兑现；人工补发的不同msgId也必须归到同权益。”
2. 账本基数与单位换算；原文依据（a-idemaudit）：“去重以msgId保留7天，候选92%超过7天；这只表示可能超出去重窗口，不等于92%都应处理或都重复。按稳定积分权益业务键关联人工和自动流水，确认27000已兑现；人工补发的不同msgId也必须归到同权益。”
3. 幂等与任务恢复领域机制；原文依据（a-idemaudit）：“实际重复9900个业务键都有历史兑现记录，短期消息记录已无或不能关联人工补发，重放把历史当新任务。”
4. 修复性重放引发二次事故；原文依据（a-impact）：“候选30000，已兑现27000；实际执行11000中重复9900×3=29700积分，81000是若全部重复候选再执行的潜在量。样本200条90%不能单独证明全量27000；本题该数来自兑付账本全量关联。”
5. 消息/人工账本/权益/共享DB；原文依据（scene.architecture）：“积分平台：死信队列(3 万条积分发放失败消息) → 重放工具(批量推送) → 积分服务 → 积分 DB ｜ 同机群: 下单主链路”
6. 全预插去重看似安全实则漏任务；原文依据（a-danger）：“中止后按实际11000执行ID对账，再评估29700重复积分的冲正/已用部分；没有依据声称回收72000。暂停减轻新增负载，恢复速度由当前队列与DB状态决定，不预先保证P99为300ms。”

标准路径：a-impact → a-idemaudit → a-dbnorm → a-stalecheck → a-fixverify，6⚡，零错S；终态确认h-idemwindow，其余全部excluded。

替代路径：a-impact → a-fixverify → a-stalecheck → a-dbnorm → a-idemaudit，6⚡，零错S；终态确认h-idemwindow，其余全部excluded。

停止点：【停止规则】实际兑付账本、资格与资源预算共同解释后果，天然安全速率、永久资格和全部未执行三个命题均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)、[官方资料2](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)。

## mq-disk（messaging/8）

学习目标：TTL 是标记，清理是执行——两个机制缺一不可。

编审：人工裁定7⚡（原4、旧链5漏硬件/窗口）。重建12TB内10.92TB现场，纠正默认无限、TTL通用机制、page cache推断及删除后百分比；四维L3升L3。

难度：L2→L3；六维[3, 3, 2, 3, 3, 2]。

1. 物理账→配置层→扫描资格；原文依据（a-retentioncfg）：“应用expiresAt=3d只决定业务是否接受旧事件，不是Kafka原生TTL。Broker保留72h被topic显式retention.ms=-1覆盖，retention.bytes=-1，cleanup.policy=delete。”
2. 空间/副本/净增/窗口对账；原文依据（a-retentioncfg）：“应用expiresAt=3d只决定业务是否接受旧事件，不是Kafka原生TTL。Broker保留72h被topic显式retention.ms=-1覆盖，retention.bytes=-1，cleanup.policy=delete。”
3. Kafka段保留领域机制；原文依据（a-retentioncfg）：“清理扫描正常运行，但没有满足保留条件的段被删除；不是Kafka默认保留无限，也不是必须另开自研删除任务。恢复保留后仍按segment/检查周期异步清理，不保证瞬时精确释放。”
4. 配过业务TTL但日志保留无限；原文依据（a-impact）：“按全部副本物理空间同一口径：order-events约3.5TB，测试死信归档topic约3.2TB，其他约3.78TB，总日志约10.48；加系统/备份0.44约10.92TB。”
5. 应用/Broker配置/物理存储；原文依据（scene.architecture）：“Kafka3 broker×4TB SSD（合计12TB）；消息业务expiresAt=3d；Broker默认保留72h，但topic模板显式retention.ms=-1/retention.bytes=-1。”
6. 手删段可能损恢复；原文依据（a-danger）：“经业务owner确认后删除可废弃测试归档topic的3.2TB物理数据，理论占用10.92−3.2=7.72TB，即64.3%，不是62%。”

标准路径：a-impact → a-retentioncfg → a-volumetrend → a-dirusage → a-diskhealth → a-riskmodel，7⚡，零错S；终态确认h-retention，其余全部excluded。

替代路径：a-impact → a-diskhealth → a-dirusage → a-volumetrend → a-riskmodel → a-retentioncfg，7⚡，零错S；终态确认h-retention，其余全部excluded。

停止点：【停止规则】物理账与有效topic覆盖解释增长，流量暴涨、其他文件和硬件劣化均排除，风险窗口口径明确。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://kafka.apache.org/41/configuration/topic-configs/#retention.ms)、[官方资料2](https://kafka.apache.org/41/configuration/topic-configs/#cleanup.policy)。

## mq-dualwrite（messaging/9）

学习目标：两次写入之间没有原子性——消息要和业务数据同生共死。

编审：人工裁定6⚡（原4、旧链5漏消费者反证）。删重启频率×3ms伪概率，区分GC暂停与期限分支；纠正同步零漏、失败后补表无间隙和outbox跨系统exactly-once。

难度：L2→L2；六维[2, 3, 2, 2, 3, 3]。

1. 提交→控制流→恢复意图；原文依据（a-codeseq）：“代码：tx.commit(order);”
2. 同键分支审计与定点复放；原文依据（a-codeseq）：“代码：tx.commit(order);”
3. outbox事务边界；原文依据（a-codeseq）：“if (requestDeadlineExpired()) return;”
4. GC不等于线程被杀；原文依据（a-impact）：“固定30个业务键：22进程退出、2OOM在commit后且send前；6个长GC后执行明确的deadline过期return分支。GC只是暂停诱因，直接跳过发送来自应用分支。受控故障注入可重现无消息意图状态。”
5. 请求/DB/Broker/积分；原文依据（scene.architecture）：“下单服务：① DB 事务(订单落库) ② 发送 MQ(积分消息) → 积分消费者(幂等入账)”
6. 同步外呼看似修一致性仍有双写窗；原文依据（a-danger）：“改同步积分调用不会自动原子：若仍先commit再调用，进程在二者之间退出照样漏；若先外呼后commit，又有外部完成而订单回滚风险。同步还耦合期限/容量，不能宣称漏发归零。”

标准路径：a-impact → a-codeseq → a-sendlog → a-brokercheck → a-consumerside，6⚡，零错S；终态确认h-gap，其余全部excluded。

替代路径：a-impact → a-consumerside → a-brokercheck → a-sendlog → a-codeseq，6⚡，零错S；终态确认h-gap，其余全部excluded。

停止点：【停止规则】提交与发送前终止/分支复现吻合，send异常、Broker后丢和消费提交失败均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。

技术机制依据：[官方资料1](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)、[官方资料2](https://www.rabbitmq.com/docs/confirms)。

