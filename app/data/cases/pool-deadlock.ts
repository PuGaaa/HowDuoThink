import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 并发迷宫 第二批（线程池自等待死锁 L2）
 * 教学点：假设思维——"全部线程在等结果，却没有线程在算结果"；
 * 父任务占满线程池等待子任务（子任务排在同一队列）= 线程池死锁；
 * 父子任务必须隔离（独立池）或不阻塞等待。
 * 专家路径：impact(1) + stacktrace(2) + repro(1) = 4⚡︎
 */
export const poolDeadlockCase: DiagnosisCase = {
  id: 'pool-deadlock',
  title: '每天随机卡死几次：任务在等它自己',
  intro: '报表服务每天随机卡死两三次：线程全部 WAITING、队列堆满、重启就好——好得像什么都没发生过。',
  domain: 'concurrency',
  layer: '全部线程在等结果，却没有线程在算结果',
  part: 'master',
  chapterId: 'concurrency',
  order: 5,
  typeTags: ['race', 'resource', 'capacity'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」报表平台的后端，定时聚合任务每天随机"假死"由你排查。',
    architecture: '报表调度器 → 线程池(8 workers, 无界队列) → 聚合任务(可拆分子任务并行) → DB',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '卡死时刻的 jstack',
        text: '8 个 worker 线程状态：全部 WAITING on Future.get()\n队列长度：31 个任务排队——但没有一个线程在 RUNNING。',
      },
      {
        type: 'text',
        title: '运维视角',
        text: '卡死时间随机，凌晨聚合任务并发时高发；重启立即恢复。\n无法稳定复现——开发跑了十遍压测脚本都是绿的。',
      },
    ],
    timeline: '上月新增"汇总任务可拆分子任务并行加速"功能 ｜ 卡死自此每周 2~3 次 ｜ 线程池参数从未调整',
    impactHint: '8 个线程都在等结果，队列里有 31 个待算的任务——结果应该由谁来算？',
  },

  hypotheses: [
    { id: 'h-selfwait', text: '父任务提交子任务到同一个池并阻塞等待：父占着线程等，子排在队列里永远轮不到', excludeActionId: 'a-stacktrace' },
    { id: 'h-dblock', text: '数据库行锁/死锁，任务全部阻塞在 SQL 上', excludeActionId: 'a-dbshow' },
    { id: 'h-queue', text: '队列无界导致任务堆积，内存/OOM 前兆表现为假死', excludeActionId: 'a-queuecfg' },
    { id: 'h-conn', text: '数据库连接池耗尽，任务在等连接', excludeActionId: 'a-connpool' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定卡死的任务构成',
      desc: '影响面：卡死时正在跑/排队的是什么任务',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '卡死现场任务盘点',
        text: '8 个 worker：全部是"汇总任务"（A/B/C…H）\n队列 31 个任务：全部是"子任务"（A1/A2/B1/B2…）\n规律：卡死只发生在多个汇总任务并发时；单个汇总任务从不卡。\n→ 父任务在线程上、子任务在队列里——两代人被同一个池隔开了。',
      },
    },
    {
      id: 'a-stacktrace',
      name: '完整线程栈 + 队列快照分析',
      desc: '每个线程在等谁、每个排队任务在等谁',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-selfwait'],
      hypotheses: [{ id: 'h-selfwait', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '线程栈与队列对照',
        text: 'worker#1: 汇总任务A → submit(A1..A4) → Future.get() WAITING\nworker#2: 汇总任务B → submit(B1..B4) → Future.get() WAITING\n……8 个 worker 同构\n队列: [A1, A2, B1, C3, ……] 31 个子任务等待空闲 worker\n→ 闭环：子任务等线程，线程等子任务的结果。线程池死锁——不是锁，是"排队等自己"。',
      },
    },
    {
      id: 'a-repro',
      name: '构造并发阈值复现实验',
      desc: '同时提交 N 个汇总任务，N 多大时必死',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '并发阈值实验',
        text: '提交 1 个汇总任务：正常（它占 1 线程，其余 7 线程能跑它的子任务）\n提交 4 个：正常（8 线程 > 4 父 + 部分子任务能插空）\n提交 8 个：100% 卡死——8 线程全被父任务占满，子任务全军覆没在队列\n→ 复现条件 = 并发父任务数 ≥ 线程数。凌晨高发的原因：定时调度把 12 个汇总任务同时放进来。',
      },
    },
    {
      id: 'a-dbshow',
      name: '检查数据库锁等待',
      desc: '排除 DB 死锁',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-dblock'],
      hypotheses: [{ id: 'h-dblock', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'DB 锁检查',
        text: 'SHOW ENGINE INNODB STATUS：无死锁、无长事务；\n卡死线程的栈根本还没执行到 SQL——卡在提交子任务之后。',
      },
    },
    {
      id: 'a-connpool',
      name: '检查连接池水位',
      desc: '排除连接耗尽',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-conn'],
      hypotheses: [{ id: 'h-conn', status: 'excluded' }],
      result: {
        type: 'text',
        title: '连接池',
        text: '活跃连接 8/20、等待队列 0——连接充足。\n→ 排除连接问题。',
      },
    },
    {
      id: 'a-queuecfg',
      name: '评估无界队列的隐患',
      desc: '队列本身是不是问题',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-queue'],
      hypotheses: [{ id: 'h-queue', status: 'excluded' }],
      result: {
        type: 'text',
        title: '队列评估',
        text: '无界队列（LinkedBlockingQueue）确实是隐患（极端时内存膨胀）。\n但本次卡死的本质是"队列里的任务永远轮不到"——不是队列太长，是调度死结。\n→ 排除队列作为根因；无界队列列为整改项。',
      },
    },
    {
      id: 'a-danger',
      name: '回滚"子任务并行"功能',
      desc: '【状态变更】汇总任务退回串行执行版本',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '串行版上线，卡死消失。代价：报表耗时从 2 分钟回到 7 分钟。\n→ 止血成立。并行收益要用正确的方式找回来，而不是永远放弃。',
      },
    },
    {
      id: 'a-fixpool',
      name: '修复：父子任务隔离到独立池',
      desc: '【状态变更】子任务走专用池；父任务改"回调聚合"不阻塞等待',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 子任务专用池（16 线程，与父池物理隔离）\n② 父任务改 CompletableFuture.allOf 异步聚合，不再占着线程空等\n③ 并发 8 父任务 × 全量子任务压测 100 轮：零卡死，报表耗时稳定 2.2 分钟——并行收益保住。',
      },
    },
    {
      id: 'a-fixdeadline',
      name: '沉淀：池任务强制 deadline 与水位监控',
      desc: '【状态变更】所有池任务带超时；池水位/等待-get-线程数告警',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控 v2',
        text: '① 池指标三件套：活跃线程 / 队列深度 / "WAITING on Future.get 的 worker 数"\n② 最后一项 > 0 即告警——线程池死锁的特异性指纹\n③ 所有池任务强制 deadline，超时转储现场。',
      },
    },
    {
      id: 'a-fixlint',
      name: '沉淀：静态检查禁止池内同步等待',
      desc: '【状态变更】CI 静态检查：worker 内 Future.get() 同步等待同池任务直接拦截',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '规范落进工具',
        text: '静态检查规则上线：识别"线程池任务体内向同一池提交并 get()"的模式，合并拦截。\n写法断层从源头停产——这类死锁的复发性靠工具守门。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-selfwait', text: '汇总任务（父）把子任务提交到同一个 8 线程池并 Future.get() 阻塞等待：并发父任务 ≥ 线程数时，线程全被父占用、子任务滞留队列——线程池自等待死锁（凌晨定时调度并发 12 个汇总任务时高发）', correct: true },
    { id: 'rc-dblock', text: '数据库死锁/行锁导致任务阻塞在 SQL', correct: false },
    { id: 'rc-queue', text: '无界队列堆积导致内存压力假死', correct: false },
    { id: 'rc-conn', text: '连接池耗尽，任务等待连接', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '8 个线程全在等结果、队列里 31 个待算任务——先盘点"谁在线程上、谁在队列里"。',
      update: '线程上全是父任务、队列里全是子任务——两代人被同一个池隔开，"等自己"的闭环浮现。',
      actionId: 'a-impact',
      why: '1⚡︎ 现场盘点的价值在于身份对照：WAITING 的不是"任务慢"而是"任务在等队列里的自己人"——结构问题一目了然。',
      conclusion: '嫌疑锁定：父子任务同池的死锁结构（h-selfwait 升权）。',
    },
    {
      thought: '线程栈与队列做全量对照，把闭环钉死：每个线程等谁、每个队列任务等谁。',
      update: '实锤：8×(父占线程等子) + 31×(子排队等线程)——自等待死锁完整闭环。',
      actionId: 'a-stacktrace',
      why: '2⚡︎ 全量对照是死锁排查的铁律：死锁是结构不是性能，必须看到"互相等待的环"才能下结论——这里环的两半分别是线程侧和队列侧。',
      conclusion: '根因实锤：线程池自等待死锁。',
    },
    {
      thought: '解释"为什么随机、为什么压测复现不了"：构造并发阈值实验——死锁有确定的触发条件。',
      update: '并发父任务 ≥ 8 必死、< 8 不死；凌晨调度并发 12 个——"随机"其实是确定性的并发条件。',
      actionId: 'a-repro',
      why: '1⚡︎ 阈值实验同时完成两件事：解释"随机性"（条件未满足而已）和给出压测脚本怎么写（并发 ≥ 线程数）——此前压测绿是因为永远只提交 1 个任务。',
      conclusion: '触发条件明确 → 验证修复的验收标准也有了。',
    },
    {
      thought: 'DB 锁、连接池、队列三个经典嫌疑各用 1⚡︎ 排除——尤其 DB 死锁，是这类 jstack 最常被误判的方向。',
      update: '栈上还没到 SQL、连接充足、队列不是死结——三个假设有证据排除。',
      actionId: 'a-dbshow',
      why: '1⚡︎ 死锁排查的第一陷阱是"看到 WAITING 就想到数据库锁"——线程栈上"卡在哪一行"比任何猜测都可靠，排除证据要跟到栈帧。',
      conclusion: '嫌疑收敛单点。',
    },
    {
      thought: '止血（回滚并行）、修复（父子隔离+异步聚合）、沉淀（监控指纹+静态检查）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】结构（同池自等待）✓ 触发条件（并发 ≥ 线程数）✓ 复发防线（工具守门）✓——机制、条件、防复发三层闭合。',
      conclusion: '沉淀：线程池死锁不需要锁——只需要"占着资源等排在资源后面的自己"。父子任务要么分池，要么不阻塞等待。',
    },
  ],

  lessons: [
    {
      text: '线程池死锁不需要任何锁：父任务占着线程等待子任务，子任务排在同一个池的队列里——"等自己"就是死锁。',
      principle: '程序设计：同池嵌套提交 + 同步等待是结构性死锁。两条出路：父子任务物理隔离（子任务专用池），或父任务异步聚合（CompletableFuture 回调，不占线程等待）。',
    },
    {
      text: '"无法复现"经常是"并发条件没到"：单个任务复现不了，并发数 ≥ 线程数时 100% 复现——先找触发阈值再谈随机。',
      principle: '假设思维：偶发问题先把它翻译成"条件表达式"（什么条件下必然发生）。阈值实验（从 1 个提交逐级加到 N 个）把随机问题变成确定性复现——复现条件本身就是验收标准。',
    },
    {
      text: '线程池要有自己的监控指纹：活跃线程、队列深度、"WAITING 在 Future.get 的线程数"——最后一项 > 0 就是死锁前兆。',
      principle: '可观测性设计：线程池死锁在业务指标上表现为"任务停止"（不可区分于低流量），在池指标上却有特异性指纹。把结构性风险的指纹做成告警，比每次靠 jstack 人肉抓快一个量级。',
    },
  ],
}
