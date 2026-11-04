# T04A 首批四题校准记录

日期：2026-11-04。案例 ID、章节与顺序不变，四题正文已完成本轮编辑核实。`t04a-cases.json` 保留最初正文哈希，另记录校准后哈希、两条路径与成本。

本记录的“已校准”指技术依据、证据关系、假设效应、停止点与评分已核对；不代替正式客户端的截图和全流程验收。最终 UI 验收由主实施流程继续完成，无需用户充当内容编辑。

## 证据边界与依据

四题均为基于真实技术机制的**教学重建**，场景已明确标识。公司、用户、请求、监控数值和故障时间线是用于推理训练的一致性材料，不冒充原始线上工单或已实际执行的生产负载结果。本轮没有取得原事故工单，故不宣称这些业务事件实际发生过。

- [OpenJDK17 增强 NPE 官方测试](https://github.com/openjdk/jdk/blob/jdk-17%2B35/test/hotspot/jtreg/runtime/exceptionMsgs/NullPointerException/NullPointerExceptionTest.java)：方法返回值为空与接收对象为空有不同提示；本题使用“the return value of”形式。
- [HikariCP 5.1.0 的 HikariPool](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-5.1.0/src/main/java/com/zaxxer/hikari/pool/HikariPool.java)：借连接等待到期产生 `SQLTransientConnectionException`，不自动生成“池耗尽→Socket读取超时→Connection reset”的包装链。
- [HikariCP 参数说明](https://github.com/brettwooldridge/HikariCP#frequently-used)：`connectionTimeout` 限制等待可用连接，不等于查询超时或连接回收周期。
- [HikariCP 池大小说明](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing)：池大小需结合数据库能力实测，不能由前端并发数直接推导扩池数值。
- [OpenTelemetry 日志关联](https://opentelemetry.io/docs/specs/otel/logs/#log-correlation)：区分执行上下文、时间和资源身份；用请求关联到具体实例后，才能对照实例事件。
- [Logback MDC](https://logback.qos.ch/manual/mdc.html)：MDC按线程管理，不能假设自动跨线程传播；请求结束需要清理上下文。
- [JDK17 ThreadPoolExecutor.afterExecute](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html#afterExecute(java.lang.Runnable,java.lang.Throwable))：`submit` 使用的任务对象捕获并保存计算异常，任务异常不会自动逃出工作线程；可以检查Future读取异常。
- [JDK17 Future.get](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/Future.html#get())：计算异常通过 `ExecutionException` 交付。

本机实际机制探针使用 **Java 25.0.2**，没有将它写成 JDK17 实测：

1. `UserPoint.getAccount()` 返回null后调用 `getBalance()`，实际得到：`Cannot invoke "com.xj.points.PointAccount.getBalance()" because the return value of "com.xj.points.UserPoint.getAccount()" is null`。
2. 单线程池安装 `UncaughtExceptionHandler`，`submit` 内先对空模板解引用，再计数模拟后续上传阶段；保留Future并调用get。实际输出：

```text
Future.get cause=NullPointerException
done=true
nextTask=probe-worker
uncaughtHandlerCalls=0
uploadCalls=0
```

该探针仅核对JDK异常交付机制，没有调用或替换OSS服务，也不冒充真实报表系统的故障复现。

## first-npe

- 主训：全栈视野；次训：验证思维。六维为 `1/1/1/1/1/1`，保持L1教学关。
- 定位：消息与88行代码区分 `userPoint` 本身为空与 `getAccount()` 返回空；前者被排除，后者仅升权，直到建账流水确认机制。
- 影响面改为注册后建账完成前失败，已有账户的老用户正常；不再用异步建账解释无法支持的“老用户偶发”。
- 同一用户流水包含成功SELECT、首次INSERT和无DELETE，分别排除查询失败与旧账户被删。
- 标准路径：`a-impact(1) → a-frameread(2) → a-rpctime(1)`，合计4。
- 替代顺序：`a-impact(1) → a-rpctime(1) → a-frameread(2)`，合计4。流水先提供生命周期，业务帧再定位断点，两者互相印证。
- `a-logcheck`保留为2成本的可选交叉检查；与消息/代码重复的对象判断不强塞进标准链。
- 停止点：空引用位置、异步资源生命周期与失败窗口闭合。返回PENDING表达尚未就绪，不伪造余额0。

## caused-by

- 主训：假设思维；次训：验证思维。六维为 `2/2/2/2/1/2`，保持L2。
- 表层改为显式业务 `ExportException`，包装代码保留SQLException作为cause；链底明确是getConnection借连接等待，未执行该失败请求自己的SQL。
- 池与同一MySQL实例对账：20连接实际执行长查询、无空闲、等待上升、无断链/重启证据。异常只是线索，资源占用解释原因。
- 磁盘72%预警由 `a-sizecheck` 收线，不能当文件写满；额外包装代码检查保留为可选动作。
- 标准路径：`a-impact(1) → a-chaindeep(2) → a-poolmetrics(1)`，合计4。
- 替代顺序：`a-impact(1) → a-poolmetrics(1) → a-chaindeep(2)`，合计4。资源证据先形成假设，cause链确认失败调用。
- 停止点：失败位置、长占用来源和高峰等待闭合；不拿修复方案或监控规划当作事前证据。
- 修复先缩短连接占用与限制导出并发，池参数按相同负载验证；移除“并发30所以扩池40”、混淆连接回收参数及“告警必早30秒”。

## log-correlation

- 主训：全栈视野；次训：验证思维。六维为 `2/2/2/2/2/2`，保持L2。
- C业务日志缺ID，但B出口与独立入口访问记录能将 `req-7712a` 定位到c-7。没有借别的实例的GC曲线补故事。
- B于01.250开始等C，5秒期限在06.250到达；c-7暂停01.270至09.070，共7.8秒，覆盖B期限；C于09.090才处理完成。
- A于01.200开始调B，8秒期限为09.200，06.280收到的是B的504，不是A自己的读取超时。
- 对时同时核对UTC+8与NTP偏差小于20毫秒；相同时区不自动意味着时钟一致。
- 标准路径：`a-impact(1) → a-tzcheck(1) → a-correlate(2)`，合计4。
- 替代顺序：`a-impact(1) → a-correlate(2) → a-tzcheck(1)`，合计4。先形成候选时间线，校对偏差后才能下停止结论。
- 配置WARN归另一请求，由 `a-retrycount` 收线；日志级别为INFO，排除错误级别过滤。
- 停止点：请求、目标实例、暂停窗口和期限闭合。补MDC提升排查能力，不能宣布它已消除GC或恢复下单。

## async-swallow

- 主训：程序设计；次训：验证思维。六维为 `2/2/2/2/1/2`，保持L2。
- 任务开始前已有GENERATING记录；第一条业务日志在render之后，故render提前异常可以没有后续日志。“没有日志”不等于没有执行。
- 代码与同输入诊断记录证明：Future异常完成，get交付render NPE，线程继续工作，上传未调用，handler未触发。异常是保存在Future中，不是必须缺handler才会失联。
- 失败终态由任务边界落实；Future由指定后台收集者或afterExecute观察。不能为了观察异常把请求改为同步等待，也不能声称一次catch覆盖进程崩溃。
- 标准路径：`a-impact(1) → a-taskaudit(2) → a-osslog(1)`，合计4。
- 替代顺序：`a-impact(1) → a-osslog(1) → a-taskaudit(2)`，合计4。先定位上传前阶段，再解释异常保存及终态缺口。
- 队列和OOM假设由任务出队/异常完成、进程身份与明确NPE证据区分；不把内核OOM killer描述为只杀一个Java任务线程。
- OSS慢告警是另一成功任务，由同taskId证据收线。停止点是阶段、异常交付机制与失败终态责任闭合。

## 自动回归与交付边界

- `node content/pipeline/validate.mjs` 对四题结构检查无错误、无警告。
- `node --test content/baselines/t04a-semantic.test.mjs content/pipeline/baseline.test.mjs content/pipeline/catalog.test.mjs` 校验两条路径、假设终态、真实评分函数的S评级、已知错误机制与时间算术。
- `node content/pipeline/baseline.mjs --check`、`node content/pipeline/validate-catalog.mjs` 校验校准哈希及固定目录。
- 这些测试不会证明界面已经运行；App/H5正式页面、长文本、抽屉、复盘与登录承接仍由主实施流程实际截图验收。
