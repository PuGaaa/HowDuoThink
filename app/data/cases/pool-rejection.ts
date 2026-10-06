import { DiagnosisCase } from '../../types/case'

/**
 * 第 9 章 · 并发迷宫 第三批（线程池拒绝策略静默丢任务 L2）
 * 教学点：程序设计——队列是缓冲不是容量；拒绝异常被吞 = AbortPolicy 变相 DiscardPolicy；
 * 提交/执行/结果三账对齐是异步链路的对账底线。
 * 专家路径：impact(1) + rejectaudit(2) + policycheck(1) = 4⚡︎
 */
export const poolRejectionCase: DiagnosisCase = {
  id: 'pool-rejection',
  title: '0.4% 的订单跳过了风控，没人知道',
  intro: '审计对账发现高峰期 0.4% 的订单"免检通过"：风控预检任务静默消失——没有报错，没有日志，凭空蒸发。',
  domain: 'concurrency',
  layer: '队列是缓冲不是容量——拒绝被吞掉，任务就蒸发了',
  part: 'master',
  chapterId: 'concurrency',
  order: 8,
  typeTags: ['race', 'resource', 'security'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」风控平台的负责人，财务审计的一纸对账单让你的风控系统出了大丑。',
    architecture: '下单 → 提交风控预检任务(线程池: 8 线程 + 1000 队列, AbortPolicy) → 立即返回"已受理" → 异步出结果',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '风控审计对账',
        text: '近 30 天：0.4% 订单（日均 480 单）无预检记录，全部"免检通过"。\n其中 23 笔事后被认定欺诈——本应被拦截的交易完成了支付。',
      },
      {
        type: 'text',
        title: '诡异之处',
        text: '应用日志零异常、零 ERROR；线程池指标"健康"；\n丢失全部集中在高峰期（低峰零发生）——且是"提交时"就消失，不是执行中失败。',
      },
    ],
    timeline: '上月大促扩容：线程 4→8、队列 500→1000（"加了容量"）｜ 丢失自扩容后高峰期出现 ｜ 下单侧代码"三个月没动过"',
    impactHint: '任务在"提交时"消失 + 零日志 + 高峰限定——提交那一刻，池子里发生了什么没人记录的事？',
  },

  hypotheses: [
    { id: 'h-reject', text: '队列满触发 AbortPolicy 拒绝异常，被空 catch 吞掉——任务消失且无痕', excludeActionId: 'a-rejectaudit' },
    { id: 'h-discard', text: '拒绝策略被误配为 DiscardPolicy（静默丢弃）', excludeActionId: 'a-policycheck' },
    { id: 'h-timeout', text: '任务执行超时被取消，结果未写回', excludeActionId: 'a-timeoutcheck' },
    { id: 'h-callback', text: '任务执行了但结果回调丢失，"看起来"没执行', excludeActionId: 'a-callbackcheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '对齐丢失率与队列水位曲线',
      desc: '影响面：丢失发生在队列的什么水位',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '丢失率 × 队列水位',
        text: '队列水位 < 60%：丢失率 0\n队列水位 60~95%：丢失率 0.02%\n队列水位 = 100%（打满）：丢失率 2.1%\n高峰时段队列打满累计 3.8 小时/天——与丢失订单的时间分布完全吻合\n→ 丢失与"队列满"强相关：容量边界上的行为，就是嫌疑。',
      },
    },
    {
      id: 'a-rejectaudit',
      name: '审计任务提交代码的异常处理',
      desc: 'submit 外面那层 try-catch 里藏着什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-reject'],
      hypotheses: [{ id: 'h-reject', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '提交代码解剖',
        text: 'try {\n  executor.submit(riskTask)\n  return "已受理"\n} catch (Exception e) {\n  log.debug("submit failed", e)   ← debug 级！生产不输出\n}\n拒绝链完整还原：队列满 → AbortPolicy 抛 RejectedExecutionException\n→ catch(Exception) 吞掉（debug 日志看不见）→ 返回"已受理" → 订单免检通过。\n实锤：AbortPolicy 被 try-catch 改造成了"带日志的 DiscardPolicy"——还是看不见日志的那种。',
      },
    },
    {
      id: 'a-policycheck',
      name: '核对线程池拒绝策略配置',
      desc: '排除策略误配',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-discard'],
      hypotheses: [{ id: 'h-discard', status: 'excluded' }],
      result: {
        type: 'text',
        title: '策略核对',
        text: '策略确认 AbortPolicy（默认值，非显式配置）——不是 Discard。\n但被吞的异常让它行为上等效于 Discard，还更糟：连"发生了拒绝"这个事实都被藏起来了。\n→ 排除误配，确认"默认值 + 吞异常"的组合罪。',
      },
    },
    {
      id: 'a-watermark',
      name: '算清容量账：提交速率 vs 消费速率',
      desc: '队列为什么必然打满',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '容量账',
        text: '高峰提交速率：1200 任务/秒\n消费速率：8 线程 × 单任务 9ms ≈ 900 任务/秒\n缺口 300/s → 队列 1000 满 = 约 3.3 秒——高峰一开跑队列必满\n→ 队列是缓冲不是容量：缺口不解决，队列只是延迟了拒绝的发生。',
      },
    },
    {
      id: 'a-timeoutcheck',
      name: '核对任务超时逻辑',
      desc: '排除超时取消',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-timeout'],
      hypotheses: [{ id: 'h-timeout', status: 'excluded' }],
      result: {
        type: 'text',
        title: '超时核对',
        text: '预检任务无超时取消机制；丢失的订单连"任务开始"记录都没有——不是执行中失败。\n→ 排除超时。',
      },
    },
    {
      id: 'a-callbackcheck',
      name: '核对结果回调链路',
      desc: '排除"执行了但结果丢"',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-callback'],
      hypotheses: [{ id: 'h-callback', status: 'excluded' }],
      result: {
        type: 'text',
        title: '回调核对',
        text: '已执行任务的结果回写率 100%（有执行记录的都有结果）。\n→ 排除回调丢失：丢失发生在执行之前。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急切换 CallerRunsPolicy',
      desc: '【状态变更】拒绝时由提交线程自己执行任务',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '切换结果',
        text: '任务零丢失（CallerRuns 保证执行）。\n代价：高峰期下单线程被迫亲自跑风控预检（9ms×积压），下单 RT 从 80ms 涨到 300ms，吞吐下降 25%。\n→ 止血换来了"不丢"，但"慢"的压力转移到了主链路——容量缺口仍在，只是换了承担者。',
      },
    },
    {
      id: 'a-fixdegrade',
      name: '修复：拒绝显式化 + 分级降级',
      desc: '【状态变更】拒绝时走"同步快速风控"（简化规则集）并打点告警；队列水位监控',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 提交失败不再吞：显式分支到"快速风控"（核心规则同步执行，保证高危拦截）+ WARN 日志 + 拒绝计数指标\n② 队列水位 > 80% 告警，> 95% 触发扩容联动\n③ 回归：对账差异 0.4% → 0%；高峰下单 RT 恢复 85ms（CallerRuns 撤销）。',
      },
    },
    {
      id: 'a-fixlint',
      name: '沉淀：异常与策略双门禁',
      desc: '【状态变更】lint 禁止空 catch/log.debug 吞异常；线程池拒绝策略必须显式声明+注释理由',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '门禁上线',
        text: '① catch 块静态检查：必须 log.warn 以上或 rethrow，debug 级吞异常直接拦截\n② 线程池创建检查：拒绝策略为默认值时要求显式写出并注释——"默认"不再是无声的选择。',
      },
    },
    {
      id: 'a-fixrecon',
      name: '沉淀：三账对账制度',
      desc: '【状态变更】提交量 / 执行量 / 结果量三账对齐，差异即告警——异步链路的对账底线',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '对账上线',
        text: '三账指标：submitted / executed / resulted 每分钟对齐，差异 > 0.01% 告警。\n这次的事故若有对账，第一秒就会尖叫——而不是等财务审计月后发现。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-reject', text: '队列满触发 AbortPolicy 抛 RejectedExecutionException，被 log.debug 级空 catch 吞掉——拒绝无痕、订单"已受理"，0.4% 免检通过；高峰缺口 300/s 使队列必然打满', correct: true },
    { id: 'rc-discard', text: '拒绝策略误配为 DiscardPolicy 静默丢弃', correct: false },
    { id: 'rc-timeout', text: '任务执行超时被取消结果未写回', correct: false },
    { id: 'rc-callback', text: '任务执行了但结果回调丢失', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '丢失集中在高峰、且在"提交时"消失——先对齐丢失率与队列水位：容量边界上发生了什么。',
      update: '水位 100% 时丢失率 2.1%——强相关成立；嫌疑聚焦"队列满后的行为"。',
      actionId: 'a-impact',
      why: '1⚡︎ 水位曲线把"高峰限定"翻译成"容量边界行为"：低峰零发生说明代码主路径是对的，边界路径（拒绝）才有鬼。',
      conclusion: '嫌疑锁定：拒绝路径（h-reject 升权）。',
    },
    {
      thought: '解剖提交代码：拒绝异常抛出后去了哪——catch 块是最大的嫌疑。',
      update: '实锤：catch(Exception) + log.debug 吞掉拒绝异常，上游照常返回"已受理"——AbortPolicy 被改造成隐形 Discard。',
      actionId: 'a-rejectaudit',
      why: '2⚡︎ 代码解剖揭开"零日志"之谜：不是没有异常，是异常被降级到 debug——"日志干净"与"系统健康"是两回事，这里恰恰相反：干净的日志是最深的坑。',
      conclusion: '根因实锤：拒绝被吞。',
    },
    {
      thought: '策略本身单独核对——"误配 Discard"假设要关掉，才能把账算到"吞异常"头上。',
      update: '策略是 AbortPolicy（默认值）——误配排除；但吞异常让它行为等效于 Discard，"默认值+吞异常"的组合才是全貌。',
      actionId: 'a-policycheck',
      why: '1⚡︎ 归因的精度决定整改的精度：只怪"默认策略"会漏掉吞异常的整改，只怪吞异常会漏掉策略显式化——两个都要修，复盘叙事才完整。',
      conclusion: '双缺陷确认 → 容量账补全。',
    },
    {
      thought: '容量账算清：缺口 300/s，队列 3.3 秒必满——"扩容过"的错觉要被数字戳破。',
      update: '线程 4→8、队列 500→1000 仍缺口 300/s——队列是缓冲不是容量，缺口不解决拒绝必然发生。',
      actionId: 'a-watermark',
      why: '1⚡︎ 容量账防止"修复回到老路"：加线程加队列治不了缺口——修复必须同时覆盖"缺口时的行为"（降级）与"缺口的观测"（水位告警）。',
      conclusion: '修复三层：显式降级 + 双门禁 + 三账对账。',
    },
    {
      thought: '止血（CallerRuns 有代价）、修复（显式降级）、门禁（禁吞异常+策略显式化）、对账（三账齐）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（拒绝被吞）✓ 容量（缺口必满）✓ 观测（三账对齐）✓——行为、容量、防线三层闭合。',
      conclusion: '沉淀：队列是缓冲不是容量；拒绝必须显式——被吞掉的拒绝是最贵的静默失败，因为它的代价由风控账单支付。',
    },
  ],

  lessons: [
    {
      text: '队列是缓冲不是容量：提交速率 > 消费速率时，队列只会延迟拒绝的发生——缺口要靠容量或降级解决。',
      principle: '程序设计：线程池容量账先于线程池配置——提交速率、单任务耗时、线程数的乘除法。缺口存在时，拒绝策略决定"谁承担过载"：Abort 抛给调用方、CallerRuns 拖慢调用方、Discard 静默丢数据——没有免费选项，只有显式选择。',
    },
    {
      text: '被吞掉的拒绝是最贵的静默失败：log.debug 的 catch 块让 AbortPolicy 变成隐形 DiscardPolicy，连"发生过"都不留痕。',
      principle: '程序设计：catch 块的门禁（warn 以上或 rethrow）+ 拒绝策略显式声明是底线配置。"零异常日志"不等于"零异常发生"——关键路径的失败必须至少大声一次，否则对账发现时已经是月后。',
    },
    {
      text: '异步链路必须三账对账：提交量、执行量、结果量——任何两账之间的差异就是丢失，第一秒就该尖叫。',
      principle: '可观测性设计：异步/线程池/MQ 链路的丢失天然"无痕"，对账是唯一可靠的发现手段。差异告警的阈值要远严于业务容忍度——0.4% 的丢失在财务眼里是 480 单欺诈通道。',
    },
  ],
}
