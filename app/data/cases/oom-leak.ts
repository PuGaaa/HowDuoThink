import { DiagnosisCase } from '../../types/case'

/**
 * 第 8 章 · 运行时暗面（无界缓存 OOM L3）
 * 教学点：OOMKilled 是内核杀的不是自己崩的；锯齿曲线是泄漏的指纹；
 * 无界缓存 = 慢性泄漏；重启是止血不是修复。
 * 专家路径：impact(1) + k8sevent(1) + rsscurve(1) + heapsnap(2) + coderead(2) = 7⚡︎
 */
export const oomLeakCase: DiagnosisCase = {
  id: 'oom-leak',
  title: '服务每 36 小时准时死一次',
  intro: '订单查询服务每隔一天半左右就被重启一次，K8s 记录 OOMKilled。重启后一切正常，然后开始新一轮倒计时。',
  domain: 'runtime',
  layer: '内存与连接是有生命周期的资源——无界容器就是慢性泄漏',
  part: 'engineer',
  chapterId: 'runtime',
  order: 1,
  typeTags: ['resource', 'capacity', 'code'],
  difficulty: 3,

  scene: {
    role: '你是订单查询服务的负责人。运维第三次在群里 @你：你们服务又 OOM 重启了，集市查询超时了 40 秒。',
    architecture: 'K8s Pod(内存限额 2Gi) → 订单查询服务(Node.js 18) → 订单库 MySQL',
    symptoms: [
      {
        type: 'error',
        title: 'K8s Pod 事件',
        text: 'Last State: Terminated\n  Reason:   OOMKilled\n  Exit Code: 137\n  Restart Count: 6（近 9 天）',
      },
      {
        type: 'text',
        title: '用户与监控',
        text: '每次重启前 1~2 分钟，查询接口批量超时；重启后立即恢复。\n服务 CPU 全程平稳（<30%），重启不挑时间——深夜也会被杀。',
      },
    ],
    timeline: '近 9 天第 6 次重启，间隔稳定在 34~38 小时 ｜ 一个月前上过一次"订单查询提速"优化 ｜ 限额与镜像三个月未变',
    impactHint: '"重启后恢复"说明进程状态里有东西在长大——它是什么，从哪来的？',
  },

  hypotheses: [
    { id: 'h-cache', text: '进程内缓存无上限，条目只进不出，慢慢撑爆限额', excludeActionId: 'a-heapsnap' },
    { id: 'h-listener', text: '事件监听器/闭包被重复注册，对象无法回收', excludeActionId: 'a-listenercheck' },
    { id: 'h-traffic', text: '流量自然增长，内存水位随之上涨', excludeActionId: 'a-qps' },
    { id: 'h-limit', text: '容器内存限额配置过低，正常业务本就不够用', excludeActionId: 'a-limitcfg' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定重启规律与影响面',
      desc: '是所有服务还是这一个；重启间隔有没有规律',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [{ id: 'h-traffic', status: 'down' }],
      result: {
        type: 'text',
        title: '重启规律',
        text: '同节点同规格的其他服务全部安好，只有订单查询服务在死。\n间隔稳定在 34~38 小时，与流量高峰（午晚高峰）无关——深夜低峰也照杀不误。\n→ 不是全局问题，是这一个进程"自己长大"。',
      },
    },
    {
      id: 'a-k8sevent',
      name: '查退出码与容器事件',
      desc: '区分"进程自己崩"还是"被内核杀"',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [{ id: 'h-limit', status: 'down' }],
      result: {
        type: 'code',
        title: 'kubectl describe pod',
        text: 'Last State: Terminated, Reason: OOMKilled, Exit Code: 137\nLimits:  memory: 2Gi\n→ exit 137 = 内核 cgroup OOM killer 所为，不是 Node 自己抛错。\n且每次重启后内存从约 400Mi 起步——正常业务 400Mi 就能跑。',
      },
    },
    {
      id: 'a-rsscurve',
      name: '看 72 小时内存曲线形态',
      desc: '爬升形态：是峰谷起伏还是只涨不跌',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [{ id: 'h-traffic', status: 'excluded' }],
      result: {
        type: 'text',
        title: '内存曲线（Prometheus container_memory_rss）',
        text: '重启后 400Mi 起步 → 每小时稳定上涨 40~50Mi → 36h 左右触顶 2Gi 被杀。\n深夜 QPS 只有白天 1/5，内存却照涨不误、从不回落。\n→ 只涨不跌 = 泄漏指纹；正常的内存曲线应该"峰涨谷落"。',
      },
    },
    {
      id: 'a-heapsnap',
      name: '间隔 1 小时采两份堆快照对比',
      desc: '看哪类对象在增长、被谁持有',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '堆快照 Diff（t1 → t1+1h）',
        text: 'Map               3.1M → 3.9M 个条目   (+180MB)\n  └ retainer: orderCache (module 顶层 Map)\nstring(订单JSON)   +96MB   被 orderCache 持有\nTimers/Listeners   数量稳定，无增长\n→ 增长全部被顶层 Map「orderCache」持有：只进不出。',
      },
    },
    {
      id: 'a-listenercheck',
      name: '查事件监听器注册情况',
      desc: '排除监听器重复注册导致闭包堆积',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-listener'],
      hypotheses: [{ id: 'h-listener', status: 'excluded' }],
      result: {
        type: 'text',
        title: '监听器数量',
        text: 'emitter.listenerCount() 各事件名稳定，启动以来无新增；快照里 Timers/Listeners 也没有增长。\n→ 不是监听器泄漏。',
      },
    },
    {
      id: 'a-qps',
      name: '查三周流量曲线',
      desc: '对比流量增长与内存增长的斜率',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-traffic'],
      hypotheses: [{ id: 'h-traffic', status: 'excluded' }],
      result: {
        type: 'text',
        title: '流量 vs 内存',
        text: '三周 QPS 波动 ±10%，基本平坦；内存却从 400Mi 线性爬到 2Gi。\n流量没涨，内存涨了 5 倍——两者不相关。',
      },
    },
    {
      id: 'a-limitcfg',
      name: '查限额配置变更历史',
      desc: '确认 2Gi 限额是不是最近调低的',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-limit'],
      hypotheses: [{ id: 'h-limit', status: 'excluded' }],
      result: {
        type: 'text',
        title: '限额历史',
        text: 'memory limit 2Gi 自服务上线以来从未改过；同规格同限额的兄弟服务已稳定运行半年。\n→ 限额没变也没配错；变的是这个进程自己的行为。',
      },
    },
    {
      id: 'a-coderead',
      name: '读 orderCache 实现代码',
      desc: '看缓存的写入、容量控制与淘汰逻辑',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'cache.js（一个月前"查询提速"优化引入）',
        text: 'const orderCache = new Map()            // 顶层常驻\nexport function getOrder(id) {\n  if (orderCache.has(id)) return orderCache.get(id)\n  const o = await db.query(...)\n  orderCache.set(id, o)                 // ← 只进不出\n  return o\n}\n// 没有 TTL、没有容量上限、没有淘汰；\n// 注释：「先内存顶着，下期换 Redis」→ 下期一直没来',
      },
    },
    {
      id: 'a-restartnow',
      name: '手动重启服务止血',
      desc: '【状态变更】立即 kubectl rollout restart 释放内存',
      cost: 2,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '重启后内存归零、查询恢复。但如果什么都不改，36 小时后它会准时回来。\n→ 重启是止血，不是修复——别把它写进值班手册就完事。',
      },
    },
    {
      id: 'a-fixcache',
      name: '给缓存加上限与 TTL 并发版',
      desc: '【状态变更】LRU 容量 10 万条 + TTL 30 分钟，灰度发布',
      cost: 6,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: 'lru-cache 替换裸 Map：max 100000、ttl 30min，命中场景不变。\n灰度 72h：内存呈健康锯齿（白天缓涨、夜间回落），稳定在 600~800Mi。\n连续 7 天零重启。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-cache', text: '一个月前"提速"优化引入的进程内订单缓存（裸 Map）无上限、无 TTL，条目只进不出，约 36 小时撑爆 2Gi 限额被内核 OOMKilled', correct: true },
    { id: 'rc-listener', text: '事件监听器重复注册，闭包堆积导致对象无法回收', correct: false },
    { id: 'rc-traffic', text: '业务流量增长，内存水位自然上涨', correct: false },
    { id: 'rc-limit', text: '容器内存限额配置过低，正常业务本就不够用', correct: false },
  ],

  expertCost: 7,
  restartActionId: 'a-fixcache',

  expertChain: [
    {
      thought: '只有这一个服务在死，先看重启有没有时间规律——有规律的死一定有节律性的原因。',
      update: '间隔稳定 34~38h 且与流量高峰无关 → 像是进程内部有个东西在匀速长大。',
      actionId: 'a-impact',
      why: '1⚡︎ 先圈范围再找节律：单服务死亡排除全局问题；"间隔固定"提示是累积型而非触发型故障。',
      conclusion: '单服务 + 固定间隔死亡 → 方向锁定进程内累积。',
    },
    {
      thought: 'OOMKilled 要先和进程自杀区分：exit 137 是内核 cgroup 限额所为。',
      update: '确认是被内核杀；且重启后 400Mi 就能正常跑——说明限额本身够用，是有什么东西额外长到了 2Gi。',
      actionId: 'a-k8sevent',
      why: '1⚡︎ 退出码一步区分"崩了"和"被杀"，两者排查对象完全不同（代码异常 vs 内存占用）。',
      conclusion: '内核 OOMKill 实锤 + 限额够用的基线确立。',
    },
    {
      thought: '看内存曲线形态：泄漏的曲线"只涨不跌"，正常曲线"峰涨谷落"。',
      update: '低峰不回落、匀速爬升 → 泄漏特征成立，流量假设进一步失权。',
      actionId: 'a-rsscurve',
      why: '1⚡︎ 曲线形态是免费的诊断信息：一条 Prometheus 曲线就能区分"泄漏"与"水位"，决定后面走堆分析还是走容量扩容。',
      conclusion: '泄漏指纹成立 → 采堆快照找"谁在长"。',
    },
    {
      thought: '堆快照对比是泄漏排查的实锤动作：两份快照做 diff，看增长对象的 retainer 链。',
      update: '增长全部被顶层 Map orderCache 持有，3 小时长了 3 万条订单 JSON——只进不出。',
      actionId: 'a-heapsnap',
      why: '2⚡︎ 快照 diff 直接给出"谁在长、被谁持有"，把猜测变成指认——这是内存排查里信息密度最高的动作。',
      conclusion: '无界缓存实锤 → 读它的实现代码找引入原因。',
    },
    {
      thought: '看代码确认机制：这个 Map 为什么会存在、为什么没有淘汰逻辑。',
      update: '一个月前"提速"优化引入的裸 Map 缓存，注释写着"先内存顶着，下期换 Redis"——临时方案变成了永久隐患。',
      actionId: 'a-coderead',
      why: '2⚡︎ 找到引入动机才能正确修复：不知道它是为了"减少 DB 压力"，就可能直接删缓存导致 DB 被打挂——修复要保留收益、补上边界。',
      conclusion: '机制闭环：提速优化引入无界缓存 → 匀速增长 → 36h 触顶被杀。',
    },
    {
      thought: '证据闭合：OOMKilled 实锤 + 泄漏曲线 + 快照指认 + 代码机制。锁、流量、限额全部排除。停止收集。',
      update: '停止。修复：LRU + TTL 保留缓存收益、补上容量边界；重启只能止血，不能写进结论。',
      actionId: '',
      why: '根因与修复方案都已明确；监听器/流量/限额三条假设已排除，继续收集不改变行动。',
      conclusion: 'LRU(10万)+TTL(30min) 上线后内存稳定锯齿，7 天零重启。检查单：进程内缓存必须同时有容量上限和过期策略。',
    },
  ],

  lessons: [
    {
      text: 'exit code 137 + Reason OOMKilled = 内核杀的，不是进程自己崩的——排查对象从"代码异常"切换为"谁在吃内存"。',
      principle: 'cgroup 限额触顶时内核直接 SIGKILL，进程来不及打任何日志。所以"没有报错日志就重启"的服务，第一步永远是查退出码，而不是翻应用日志。',
    },
    {
      text: '内存曲线形态是免费诊断：只涨不跌是泄漏，峰涨谷落是正常水位。',
      principle: '先看形态再动手：泄漏曲线匀速爬升且低峰不回落，与流量形态脱相关。这一眼能省掉大半盲目排查——直接进入堆分析，而不是去扩容。',
    },
    {
      text: '无界缓存 = 慢性泄漏：没有容量上限和 TTL 的 Map，结局一定是 OOM，只是时间问题。',
      principle: '进程内缓存的写入速度永远大于清理速度（如果没有清理）。任何缓存必须同时具备：容量上限（LRU）+ 过期时间（TTL）。"先内存顶着"的临时方案必须有到期日。',
    },
    {
      text: '重启是止血不是修复：它能证明"状态在进程里"，但不能写进值班手册当解决方案。',
      principle: '面对周期性故障，重启的价值是恢复服务并确认"凶手在进程内"。如果只重启不排查，故障间隔就是你的破案倒计时——36 小时后它准时回来。',
    },
  ],
}
