import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const closureLeakCase: DiagnosisCase = {
  id: 'closure-leak',
  title: '泄漏的第二次侦查——闭包与监听器',
  intro: 'LRU缓存修复后稳定40天，批量调用频率上升后堆基线又增长。先验证旧修复，再追踪新的持有链。',
  domain: 'runtime',
  layer: '监听器和闭包的生命周期，必须与它们依附的对象对齐——否则每一次调用都在给内存上锁',
  part: 'engineer',
  chapterId: 'runtime',
  order: 3,
  typeTags: [
    'runtime',
    'code',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」订单查询服务的负责人。40 天前你修掉了无界缓存，今天运维第四次在群里 @你。',
    architecture: 'K8s Pod(内存限额 2Gi) → 订单查询服务(Node.js 18) → 订单库 MySQL',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '监控告警',
        text: 'RSS约24小时上涨900MiB，完整GC后heapUsed同步增长；external/arrayBuffers基本稳定。没有仅凭RSS就确定堆内；下面还要核对保留链。',
      },
      {
        type: 'text',
        title: '时间线核对',
        text: '修复版本 v2.4.1 一直未变（无发布）。\n昨天 14:00 的变更是：运营后台上线了"订单导出批量标注"功能（调用本服务的接口频率 ×50）。',
      },
      {
        type: 'log',
        title: '归档投递重试',
        text: '[WARN] log archive retry=1；监听器告警附近还有此条。',
      },
    ],
    timeline: '上次 OOM 修复后稳定 40 天 ｜ 昨天 14:00 运营上线批量标注功能 ｜ 泄漏速率：每小时约 37MB',
    impactHint: '无发布也会因已有路径被更高频调用而暴露；先确认增长对象和调用关系。',
  },
  hypotheses: [
    {
      id: 'h-cache',
      text: '上次的缓存修复失效：无界缓存复发',
      excludeActionId: 'a-cachecheck',
    },
    {
      id: 'h-listener',
      text: '新功能的接口在全局 emitter 上重复注册监听器，从未移除',
      excludeActionId: 'a-snapdiff',
    },
    {
      id: 'h-timer',
      text: '新功能引入的定时器未清理，闭包持有大对象',
      excludeActionId: 'a-timercheck',
    },
    {
      id: 'h-native',
      text: '与JS持有链无关的独立native/Buffer分配泄漏',
      excludeActionId: 'a-heaptype',
    },
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
      hypotheses: [
        {
          id: 'h-cache',
          status: 'down',
        },
      ],
      result: {
        type: 'text',
        title: '时间线与修复核对',
        text: '旧版接口已存在，服务器没有新发布；运营批量标注只是将调用频率放大50倍。LRU条目仍有上限，不能仅凭它排除其他持有链；也不能说本服务刚上线了新功能。',
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
      tests: [
        'h-listener',
        'h-cache',
        'h-timer',
      ],
      hypotheses: [
        {
          id: 'h-listener',
          status: 'confirmed',
        },
        {
          id: 'h-cache',
          status: 'excluded',
        },
        {
          id: 'h-timer',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '堆快照 Diff',
        text: '同负载间隔1小时：全局emitter的label:done监听器12→2441，增加2429个；每个闭包持有约16KiB的JS标签上下文，约2429×16/1024=37.95MiB/小时。\nLRU保留量稳定，Timers句柄仍4个且保留量稳定；新增增长由listener闭包引用链解释，排除旧缓存与新增定时器。',
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
      tests: [
        'h-listener',
      ],
      hypotheses: [
        {
          id: 'h-listener',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: 'label-batch.js 关键行',
        text: 'async function labelBatch(req) {\n const context = buildLabelContext(req); // 约16KiB，JS对象\n orderEmitter.on("label:done", evt => pushToWarehouse(context, evt));\n // 没有按requestId过滤，也从未移除\n}\n每请求注册一个长期监听器；闭包捕获在回调外创建的context。原先在回调内await得到的临时Buffer不会仅因监听器存在就永久保留，不能用那段代码解释。',
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
        text: '教学序列：每次注册后全局触发一次label:done，3次请求触发1+2+3=6次回调，正常应3次，放大2倍；N次共N(N+1)/2次回调，相对N次放大(N+1)/2倍。\n不要把总回调次数近似N²/2写成相对需求N²/2倍；未核实的3.7万次仓库推送不作为已发生事实。',
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
      tests: [
        'h-cache',
      ],
      hypotheses: [
        {
          id: 'h-cache',
          status: 'excluded',
        },
      ],
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
      tests: [
        'h-timer',
      ],
      hypotheses: [
        {
          id: 'h-timer',
          status: 'excluded',
        },
      ],
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
      tests: [
        'h-native',
      ],
      hypotheses: [
        {
          id: 'h-native',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '内存构成对比',
        text: 'process.memoryUsage中external和arrayBuffers近似稳定；完整GC后heapUsed增加，快照增长与listener→context引用链同量级。排除与JS引用无关的独立native/Buffer增长，本案上下文不是4MiB Buffer。\n噪声收线：归档队列与保留体积稳定，未出现在新增引用链中；增长是listener捕获的JS context，external/arrayBuffers没有同步增加。',
      },
    },
    {
      id: 'a-fix',
      name: '监听器改请求级并加移除',
      desc: '【状态变更】移除不必要全局监听；确需事件时明确请求关联与清理生命周期',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '最短修复：请求内直接await生成标签与推送，删除不必要的请求级全局监听；若必须异步事件，使用明确requestId关联并在成功、失败、取消时解除对应监听。\n单把on改once不能阻止所有请求监听器被同一个全局事件提前触发，也不能处理事件永不到达。回归同时检查监听器、堆保留量和重复推送。',
      },
    },
    {
      id: 'a-restart',
      name: '滚动重启止血',
      desc: '【状态变更】释放已泄漏内存',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '受控滚动重启临时清除本次约900MiB保留对象；限额2Gi下不能说已释放2.3GiB常驻泄漏。重启不会自动撤销已经发送的重复事件，需按请求标识对账。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-listener',
      text: '既有请求路径每次向全局emitter注册且不移除监听器，闭包持有约16KiB上下文；调用放大后每小时新增2429个，并因无请求关联引发重复回调',
      correct: true,
    },
    {
      id: 'rc-cache',
      text: '上次的缓存修复失效，无界缓存复发',
      correct: false,
    },
    {
      id: 'rc-timer',
      text: '新功能定时器未清理，闭包持有大对象',
      correct: false,
    },
    {
      id: 'rc-native',
      text: 'Buffer/native 模块堆外内存泄漏',
      correct: false,
    },
  ],
  expertCost: 6,
  restartActionId: 'a-restart',
  expertChain: [
    {
      thought: '先核实未发布与旧缓存边界。',
      update: '调用量放大，既有路径被更多使用。',
      actionId: 'a-impact',
      why: '1⚡没有发布不等于没有触发条件变化，不能直接归因新代码。',
      conclusion: '比较保留对象。',
    },
    {
      thought: '读取快照引用链及计数。',
      update: '监听器2429/小时×16KiB≈37.95MiB，缓存和timer稳定。',
      actionId: 'a-snapdiff',
      why: '2⚡保留量与日增长可对账，同时排除旧缓存和新增timer。',
      conclusion: '确认listener持有。',
    },
    {
      thought: '核对context创建与注册代码。',
      update: '回调外上下文被捕获，无off和请求过滤。',
      actionId: 'a-coderead',
      why: '2⚡真实捕获位置解释保留机制，不凭临时Buffer倒推。',
      conclusion: '机制闭合。',
    },
    {
      thought: '核对堆外分类。',
      update: 'external稳定，JS引用链解释增长。',
      actionId: 'a-heaptype',
      why: '1⚡以独立内存分类反证native泄漏。',
      conclusion: '其余候选排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】监听器与上下文保留链及增长算术一致，旧缓存、timer和独立native泄漏均排除；重复回调另有样例，不冒充已对账推送数。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '既有请求路径每次向全局emitter注册且不移除监听器，闭包持有约16KiB上下文；调用放大后每小时新增2429个，并因无请求关联引发重复回调',
    },
  ],
  lessons: [
    {
      text: '监听器闭包保留的是它实际捕获的可达对象；回调内临时变量不一定会在回调结束后继续保留。',
      principle: '用快照retainer核对变量在何处创建、谁引用和生命周期，不能只看到闭包就宣称所有中间Buffer永不回收。',
    },
    {
      text: 'once只在第一次事件触发后移除；全局同名事件没有请求关联时仍可能把其他请求一起唤醒。',
      principle: '优先移除不必要的全局事件间接层；确需事件时明确关联id与成功/失败/取消生命周期，避免把once当通用修复。',
    },
    {
      text: 'N次请求每次都触发所有已有监听器，共有N(N+1)/2次回调，相对N次放大(N+1)/2倍。',
      principle: '区分绝对次数、相对倍数和实际副作用；不能把回调数自动当成已成功落仓的推送数。',
    },
    {
      text: '900MiB/天约37.5MiB/小时，与2429×16KiB约37.95MiB/小时同量级；4MiB×2441不可能解释本题2Gi限额。',
      principle: '内存数量级是因果检验的一部分。process.memoryUsage区分heapUsed、external、arrayBuffers，RSS本身不是引用链证明。',
    },
  ],
}
