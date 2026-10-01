import { DiagnosisCase } from '../../types/case'

/**
 * B1-3 · runtime L3（oom-leak 的续集）
 * 主训思维：程序设计（监听器/闭包的生命周期必须与对象生命周期对齐）
 * 次训思维：验证思维（堆快照对比法可复用——上次修好不代表永远修好）
 * 真实原型：修复无界缓存后，事件监听器重复注册 + 闭包持有请求上下文再次泄漏
 * 情绪兽设计：不行蜗（迟疑）——"上次的修复明明有效，怎么又来了"
 * 检查单：思维型 3 + 知识型 1
 */
export const closureLeakCase: DiagnosisCase = {
  id: 'closure-leak',
  title: '泄漏的第二次侦查——闭包与监听器',
  intro: '上次修掉无界缓存后，内存曲线安静了 40 天。昨天起 RSS 又开始爬坡，这次堆里没有缓存对象。',
  domain: 'runtime',
  layer: '监听器和闭包的生命周期，必须与它们依附的对象对齐——否则每一次调用都在给内存上锁',
  part: 'engineer',
  chapterId: 'runtime',
  order: 3,
  typeTags: ['runtime', 'code'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」订单查询服务的负责人。40 天前你修掉了无界缓存，今天运维第四次在群里 @你。',
    architecture: 'K8s Pod(内存限额 2Gi) → 订单查询服务(Node.js 18) → 订单库 MySQL',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '监控告警',
        text: 'RSS 曲线：修复后走平 40 天，昨天 14:00 起再次爬坡，24 小时上涨 900MB，未见顶。\nheap used 与 RSS 同步上涨——泄漏在堆内。',
      },
      {
        type: 'text',
        title: '时间线核对',
        text: '修复版本 v2.4.1 一直未变（无发布）。\n昨天 14:00 的变更是：运营后台上线了"订单导出批量标注"功能（调用本服务的接口频率 ×50）。',
      },
    ],
    timeline: '上次 OOM 修复后稳定 40 天 ｜ 昨天 14:00 运营上线批量标注功能 ｜ 泄漏速率：每小时约 37MB',
    impactHint: '上次的修复有没有可能成为这次的隐患？——先验证旧结论，再找新答案。',
  },

  hypotheses: [
    { id: 'h-cache', text: '上次的缓存修复失效：无界缓存复发', excludeActionId: 'a-cachecheck' },
    { id: 'h-listener', text: '新功能的接口在全局 emitter 上重复注册监听器，从未移除', excludeActionId: 'a-snapdiff' },
    { id: 'h-timer', text: '新功能引入的定时器未清理，闭包持有大对象', excludeActionId: 'a-timercheck' },
    { id: 'h-native', text: '堆外内存泄漏（Buffer/native 模块）', excludeActionId: 'a-heaptype' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '复盘上次的修复与本次时间线',
      desc: '上次的修复还在生效吗，泄漏和什么变更对齐',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [{ id: 'h-cache', status: 'down' }],
      result: {
        type: 'text',
        title: '时间线与修复核对',
        text: '上次修复：无界缓存加 LRU 上限（10 万条）——仍在生效。\n本次爬坡起点 = 昨天 14:00 = "批量标注"功能上线时间，接口调用频率 ×50。\n→ 旧修复有效；泄漏源是新功能。走验证思维的老路：堆快照对比。',
      },
    },
    {
      id: 'a-snapdiff',
      name: '间隔 1 小时采两份堆快照对比',
      desc: '老方法：Retained Size 排序找增长源',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-listener'],
      hypotheses: [{ id: 'h-listener', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '堆快照 Diff',
        text: '增长 Top1: EventEmitter._events → listeners 数组\n  orderEmitter.listenerCount("label:done") : 12 → 2441（+2429/小时）\n增长 Top2: Closure (labelBatchTask) 持有 Buffer 4MB × 2441\n→ 每处理一个批量标注请求，就往全局 emitter 上挂一个新监听器，从不移除。',
      },
    },
    {
      id: 'a-coderead',
      name: '读批量标注的监听器代码',
      desc: '谁在注册，为什么没人移除',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-listener'],
      hypotheses: [{ id: 'h-listener', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'label-batch.js 关键行',
        text: 'orderEmitter.on("label:done", async (evt) => {\n  const buf = await renderLabel(evt.order)   ← 4MB 标签图 Buffer 被闭包持有\n  await pushToWarehouse(buf)\n})   ← 每次请求都执行一次 on()，从不 off()\n→ 闭包持有 4MB Buffer；监听器数组线性增长 = 内存泄漏 + 重复响应的双重 bug。',
      },
    },
    {
      id: 'a-dupresp',
      name: '验证重复响应的副作用',
      desc: '监听器重复注册除了泄漏，还有什么',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '副作用确认',
        text: '第 N 个批量标注请求完成时，"label:done" 事件触发 N 个监听器 → 同一订单向仓库推送 N 次。\n→ 不只是内存泄漏：批量标注的推送量是需求量的 N²/2 倍——仓库侧已收到重复推送 3.7 万次。',
      },
    },
    {
      id: 'a-cachecheck',
      name: '核对无界缓存的修复状态',
      desc: '排除旧问题复发',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'excluded' }],
      result: {
        type: 'text',
        title: '缓存状态',
        text: 'orderCache.size 恒定 100000 上限（LRU 生效），堆快照中无缓存对象增长。\n→ 上次的修复依然健康。旧结论通过验证。',
      },
    },
    {
      id: 'a-timercheck',
      name: '核对定时器数量与闭包',
      desc: '排除定时器泄漏',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-timer'],
      hypotheses: [{ id: 'h-timer', status: 'excluded' }],
      result: {
        type: 'text',
        title: '定时器审计',
        text: '全局 setTimeout/setInterval 句柄数量恒定（4 个全局单例），无新定时器。\n→ 定时器无辜。泄漏源锁定监听器闭包。',
      },
    },
    {
      id: 'a-heaptype',
      name: '区分堆内与堆外增长',
      desc: '排除 Buffer/native 堆外泄漏',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-native'],
      hypotheses: [{ id: 'h-native', status: 'down' }],
      result: {
        type: 'text',
        title: '内存构成对比',
        text: 'heap used 与 container RSS 同步上涨（比例稳定 78%）。\n→ Buffer 虽是堆外对象，但本次增长可被堆快照完整解释——泄漏在堆内的闭包引用链。',
      },
    },
    {
      id: 'a-fix',
      name: '监听器改请求级并加移除',
      desc: '【状态变更】on→once + 请求结束 removeListener，修复重复推送',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '改法：orderEmitter.once("label:done", handler) + finally 中 removeListener；\n标签 Buffer 改为流式处理不驻留。\n灰度 48h：监听器数量恒定，RSS 走平，重复推送归零。',
      },
    },
    {
      id: 'a-restart',
      name: '滚动重启止血',
      desc: '【状态变更】释放已泄漏内存',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '滚动重启释放 2.3GB 泄漏内存。\n→ 止血完成；重复推送的副作用仍需对账（仓库侧去重）。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-listener', text: '批量标注接口每次请求都在全局 emitter 上重复注册闭包监听器且从不移除——监听器数组与闭包持有的 4MB Buffer 线性增长致内存泄漏，并发生产 N² 重复推送', correct: true },
    { id: 'rc-cache', text: '上次的缓存修复失效，无界缓存复发', correct: false },
    { id: 'rc-timer', text: '新功能定时器未清理，闭包持有大对象', correct: false },
    { id: 'rc-native', text: 'Buffer/native 模块堆外内存泄漏', correct: false },
  ],

  expertCost: 7,
  restartActionId: 'a-restart',

  expertChain: [
    {
      thought: '上次的修复还在生效吗？——先验证旧结论：修复失效和全新泄漏是两种完全不同的病。',
      update: 'LRU 上限仍在生效；爬坡起点精确对齐"批量标注"功能上线（接口频率 ×50）→ 全新泄漏源。',
      actionId: 'a-impact',
      why: '1⚡ 先验证旧结论再找新答案：旧修复健康排除了"复发"，泄漏源锁定在新功能的调用路径上。',
      conclusion: '新功能嫌疑 → 走验证思维的老路：堆快照对比。',
    },
    {
      thought: '老方法依然是最强工具：两份快照 diff，Retained Size 排序——让泄漏源自己浮出来。',
      update: '监听器数组每小时 +2429 个，闭包持有 4MB Buffer——双重增长源都指向同一个 emitter。',
      actionId: 'a-snapdiff',
      why: '2⚡ 堆快照 diff 是内存泄漏的实锤动作：它不猜，它直接告诉你"谁在增长、被谁持有"。',
      conclusion: '监听器重复注册实锤 → 读代码找机制。',
    },
    {
      thought: '读代码找"谁在注册、为什么没人移除"——闭包持有 4MB Buffer 说明监听器还带着大行李。',
      update: '每次请求执行一次 emitter.on()，闭包持有请求级 Buffer，从不 removeListener——泄漏 + 重复推送双重 bug。',
      actionId: 'a-coderead',
      why: '2⚡ 直捣机制：on() 写在请求处理函数里 = 每次调用注册一次；监听器还闭包持有 4MB Buffer——泄漏速率因此高达 37MB/小时。',
      conclusion: '机制闭环：重复注册 × 闭包持有 = 内存泄漏 + N² 重复推送。',
    },
    {
      thought: '缓存/定时器/堆外全部排除，副作用（重复推送 3.7 万次）确认——证据闭合，停止收集。',
      update: '停止收集。止血重启 + 修复监听器生命周期 + 仓库侧去重对账。',
      actionId: '',
      why: '【停止规则】四条假设一条实锤三条排除；双重副作用（内存 + 重复推送）都已确认。继续收集不改变"改 once + removeListener"的行动。',
      conclusion: '止血滚动重启；修复：once + finally removeListener + Buffer 流式化；仓库侧对账去重。',
    },
  ],

  lessons: [
    {
      text: 'emitter.on() 写在请求处理函数里 = 每次请求注册一个监听器：监听器的生命周期必须与它依附的对象对齐。',
      principle: '程序设计纪律：全局 emitter 的监听器要么启动时注册一次，要么请求结束时精确移除（once + finally removeListener）。重复注册不只是泄漏——事件触发时 N 个监听器执行 N 次，是更隐蔽的正确性 bug。',
    },
    {
      text: '闭包会把"用完即弃"的东西变成"永久驻留"的行李：监听器闭包持有 4MB Buffer，泄漏速率因此 ×100。',
      principle: '闭包引用链审计：回调函数里引用的每一个大对象都会被闭包锁住。异步任务的中间产物要流式处理或用完即置空。',
    },
    {
      text: '上次的修复不代表永远修复：回归测试要覆盖"修复后新增代码是否会再次触发同类问题"。',
      principle: '沉淀思维：每次泄漏修复都应留下两样东西——一条检查单 + 一个内存增长的回归测试（启动后压测 1 小时，RSS 涨幅超阈值即失败）。',
    },
    {
      text: '堆快照对比法是可复用的方法论：两次 diff 让泄漏源自己浮出来——不管泄漏的是缓存、监听器还是别的什么。',
      principle: '验证思维：内存泄漏排查不依赖背案例，依赖方法（快照 diff → Retained 排序 → 引用链）。工具用对，泄漏源自己招供。',
    },
  ],
}
