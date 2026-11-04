import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const eventLoopBlockedCase: DiagnosisCase = {
  id: 'event-loop-blocked',
  title: '接口集体超时，CPU 却很闲',
  intro: '新版上线后所有接口间歇性卡顿，但服务器 CPU 利用率只有 25%——"资源很闲，用户很急"。',
  domain: 'runtime',
  layer: '事件循环是单线程服务的心脏：一个同步 CPU 任务会堵住所有并发请求',
  part: 'engineer',
  chapterId: 'runtime',
  order: 2,
  typeTags: [
    'runtime',
    'code',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」网关聚合服务的负责人，新版上线第三天，客服和前端一起找上了你。',
    architecture: 'App → 网关聚合服务(Node.js 18, 4 核容器) → 下游微服务 ×5',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '监控大盘',
        text: '单Node进程运行于4核容器；导出期间全接口P99到2.4s，event-loop延迟约800ms；容器按4核归一CPU约25%，主线程约一核满。内存与下游延迟平稳。',
      },
      {
        type: 'text',
        title: '时间线',
        text: '卡顿从三天前 v2.3.0 发布后开始，此前半年无此现象。\nv2.3.0 内容：新增"发票导出"功能 + 常规依赖升级。',
      },
      {
        type: 'log',
        title: 'DNS重试记录',
        text: '[WARN] optional telemetry DNS retry=1；导出期间出现。',
      },
    ],
    timeline: 'v2.3.0 发布于三天前 ｜ 卡顿全天间歇出现，与流量高峰弱相关 ｜ 下游五个微服务零变更',
    impactHint: '"资源很闲，用户很急"——资源利用率的数字骗了所有人。什么程序结构会让 CPU 看起来很闲、服务却卡死？',
  },
  hypotheses: [
    {
      id: 'h-cpu',
      text: '单核被打满：某个同步 CPU 密集任务阻塞了事件循环，其余三个核在旁观',
      excludeActionId: 'a-code',
    },
    {
      id: 'h-gc',
      text: 'GC 停顿变长：堆内存暴涨导致全局停顿',
      excludeActionId: 'a-gclog',
    },
    {
      id: 'h-down',
      text: '某个下游依赖变慢，拖住了所有聚合请求',
      excludeActionId: 'a-down',
    },
    {
      id: 'h-lock',
      text: '数据库锁等待阻塞聚合路径，导致全接口卡顿',
      excludeActionId: 'a-dblog',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '圈定卡顿的影响面',
      desc: '所有接口还是特定接口，卡顿有没有节律',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [
        {
          id: 'h-down',
          status: 'down',
        },
      ],
      result: {
        type: 'text',
        title: '影响面分析',
        text: '导出时同进程/health也延迟约800ms，其他副本不做导出时正常。不是所有业务代码无罪：某业务回调若堵主线程，也会拖住健康检查。',
      },
    },
    {
      id: 'a-metrics',
      name: '查事件循环延迟与分核 CPU',
      desc: 'Node 的心电图：event loop lag 按秒看',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-cpu',
      ],
      hypotheses: [
        {
          id: 'h-cpu',
          status: 'up',
        },
      ],
      result: {
        type: 'code',
        title: '指标对比',
        text: 'event-loop延迟约800ms，容器4核归一CPU25%；主线程profile接近一核算力。操作系统可迁移线程，不要求固定“核1”始终满。\n这些指标支持主线程忙，尚不能单独区分业务同步计算与GC；需CPU profile与代码。',
      },
    },
    {
      id: 'a-release',
      name: '对齐发布与卡顿的时间线',
      desc: '三天前上了什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: 'v2.3.0 变更清单',
        text: '+ 发票导出功能（新）\n+ bcrypt 库（用于导出文件口令加密）\n+ 常规依赖升级\n→ 新增功能里的 bcrypt 调用，进入怀疑视野。',
      },
    },
    {
      id: 'a-code',
      name: '读发票导出的实现代码',
      desc: '新功能有没有同步 CPU 密集调用',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-cpu',
        'h-gc',
      ],
      hypotheses: [
        {
          id: 'h-cpu',
          status: 'confirmed',
        },
        {
          id: 'h-gc',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: 'export.js 关键行',
        text: '导出回调中：\nconst hash = bcrypt.hashSync(password, 12);\nconst zip = zlib.gzipSync(invoiceBytes);\n主线程CPU profile约800ms集中在这两处，且与event-loop阻塞同窗；不是不存在的archiver.sync.compress API。副本只移除同步导出步骤，相同输入下/health延迟恢复。GC轨迹最大8ms，不能解释800ms。',
      },
    },
    {
      id: 'a-down',
      name: '查下游五个服务的耗时',
      desc: '排除下游拖累',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-down',
      ],
      hypotheses: [
        {
          id: 'h-down',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '下游监控',
        text: '同trace下游调用各<60ms；/health不调用下游也在导出期间卡住。排除下游变慢主因，零变更本身不等于无故障。\n噪声收线：该解析属于独立遥测队列，/health无此调用；阻塞区间CPU profile集中同步导出而非解析等待，不能用它解释800ms主线程计算。',
      },
    },
    {
      id: 'a-gclog',
      name: '查 GC 日志与堆曲线',
      desc: '排除 GC 停顿',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-gc',
      ],
      hypotheses: [
        {
          id: 'h-gc',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'GC 日志',
        text: '堆内存平稳 380MB，GC 停顿 max 8ms，频率正常。\n→ GC 不背锅：8ms 解释不了 1.2s 的卡顿。',
      },
    },
    {
      id: 'a-dblog',
      name: '查慢查询与锁等待',
      desc: '排除共享资源锁竞争',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-lock',
      ],
      hypotheses: [
        {
          id: 'h-lock',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'DB 监控',
        text: '本次调用链DB锁等待与连接池等待均0；卡顿profile在bcrypt/zlib而非驱动等待，/health不查DB仍卡。排除数据库锁阻塞解释。',
      },
    },
    {
      id: 'a-fix',
      name: '同步改异步并灰度验证',
      desc: 'bcrypt 改异步接口 + 导出迁到 worker 线程',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: 'bcrypt使用其异步接口、压缩使用zlib异步接口或有界worker队列；异步通常转移工作到线程池，不会消除CPU成本。限制并发和队列，复验event-loop延迟、worker饱和、整体吞吐及P99。\n把同步函数包进async/Promise本身不会移出主线程。',
      },
    },
    {
      id: 'a-revert',
      name: '回滚 v2.3.0 止血',
      desc: '【状态变更】回滚到 v2.2.9',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果',
        text: '回滚后卡顿立即消失，P99 恢复 80ms。\n→ 止血完成；修复版走完整测试后重新发布。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-cpu',
      text: '导出回调在主线程执行bcrypt.hashSync与zlib.gzipSync，约800ms同步计算阻塞同进程事件循环，健康检查与其他请求一起延迟',
      correct: true,
    },
    {
      id: 'h-gc',
      text: '堆内存暴涨导致 GC 全局停顿',
      correct: false,
    },
    {
      id: 'rc-down',
      text: '某个下游依赖变慢拖住聚合请求',
      correct: false,
    },
    {
      id: 'rc-lock',
      text: '数据库锁等待阻塞全部接口',
      correct: false,
    },
  ],
  expertCost: 7,
  restartActionId: 'a-revert',
  expertChain: [
    {
      thought: '对齐导出与同进程健康检查。',
      update: '导出时连不查下游的health也卡。',
      actionId: 'a-impact',
      why: '1⚡指向共享调度，但业务同步回调仍可能是源头。',
      conclusion: '核对线程时间。',
    },
    {
      thought: '结合归一CPU和event-loop延迟。',
      update: '约一核算力，事件循环被占用。',
      actionId: 'a-metrics',
      why: '2⚡平均25%不等于主线程有余量，指标仍需profile定性。',
      conclusion: '同步计算候选升权。',
    },
    {
      thought: '读取profile与真实API代码并做对照。',
      update: 'hashSync/gzipSync约800ms，移出后恢复，GC仅8ms。',
      actionId: 'a-code',
      why: '2⚡具体热点与受控对照证明机制，同时排除GC。',
      conclusion: '确认同步CPU阻塞。',
    },
    {
      thought: '核对同trace下游耗时。',
      update: '下游正常，health无下游依赖仍卡。',
      actionId: 'a-down',
      why: '1⚡实际调用证据排除下游主因。',
      conclusion: '排除下游。',
    },
    {
      thought: '核对DB等待与调用栈。',
      update: '没有锁/池等待，热点不在DB。',
      actionId: 'a-dblog',
      why: '1⚡数据库锁候选需独立等待证据。',
      conclusion: '全部候选收敛。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】同步CPU热点与800ms阻塞吻合，GC、下游和数据库锁解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '导出回调在主线程执行bcrypt.hashSync与zlib.gzipSync，约800ms同步计算阻塞同进程事件循环，健康检查与其他请求一起延迟',
    },
  ],
  lessons: [
    {
      text: '事件循环是单线程服务的心脏：一个同步 CPU 任务会堵住所有并发请求——哪怕容器有 64 个核。',
      principle: 'Node 的并发靠事件循环调度，同步调用 = 心脏骤停。CPU 利用率要按核看：容器平均 25% 不代表没打满，单核 100% 就足以瘫痪全服务。',
    },
    {
      text: '同步CPU计算会占用当前事件循环；async函数或Promise包装不会自动把计算送到其他线程。',
      principle: '选择真正异步的SDK接口或worker_threads，并设置并发预算。异步压缩和bcrypt仍消耗worker资源与CPU，可能把瓶颈转移到线程池。',
    },
    {
      text: 'event loop lag 是 Node 服务的心电图——没有这个监控，这类故障无解。',
      principle: 'event-loop延迟和主线程CPU profile是重要定位证据，GC、同步JS、原生调用都可能抬高延迟。不能仅看lag就宣布同步业务计算已确认，更不能说没有监控就无解。',
    },
    {
      text: '"资源很闲，用户很急"——平均利用率是最会骗人的监控数字。',
      principle: '验证思维：任何聚合数字（平均 CPU、平均延迟）都要能下钻到分布（按核/分位数）。数字打架的地方，就是真相所在。',
    },
  ],
}
