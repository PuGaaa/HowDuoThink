import { DiagnosisCase } from '../../types/case'

/**
 * B1-6 · observability L2
 * 主训思维：验证思维（指标是工具计算的——工具参数错了，结论就是错的）
 * 次训思维：程序设计（直方图桶边界要覆盖真实尾部）
 * 真实原型：Prometheus histogram 桶边界配置错误（最大桶 100ms），P99 严重低估
 * 情绪兽设计：惊讶獭（惊讶）——"P99 显示 45ms，用户却等了 2 秒"
 * 检查单：思维型 3 + 知识型 1
 */
export const histogramCase: DiagnosisCase = {
  id: 'histogram-bucket',
  title: 'P99 显示 45ms，用户却等了 2 秒',
  intro: '监控大盘上结算接口 P99 = 45ms，漂亮得不像话。但用户投诉持续、全链路 trace 显示服务端耗时 2 秒+。指标和现实，总有一个在撒谎。',
  domain: 'runtime',
  layer: '指标是测量工具算出来的：工具的参数错了，结论就是错的——先验证测量，再相信测量',
  part: 'master',
  chapterId: 'observability',
  order: 4,
  typeTags: ['observability', 'metrics'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」支付结算服务的负责人。用户投诉超时一个月，你的监控大盘却始终"健康"——老板怀疑你在粉饰太平。',
    architecture: 'App → 支付结算服务 → Prometheus(直方图指标) → Grafana 大盘',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '指标与 trace 打架',
        text: 'Grafana 大盘：结算接口 P99 = 45ms，30 天稳定。\n全链路 trace（同期抽样）：同一接口服务端耗时 P99 ≈ 2.4s。\n→ 同一个接口，两个"真相"。用户投诉与 trace 一致。',
      },
      {
        type: 'text',
        title: '投诉分布',
        text: '投诉用户占比约 2%，但金额占比 30%（大客户下单链路）。\n投诉时间随机——与发布、流量高峰均无关联。',
      },
    ],
    timeline: '结算服务一个月前重构（重构时顺手动过指标埋点）｜ 投诉持续一个月 ｜ trace 系统上月才全量接入',
    impactHint: '指标和 trace 打架时，先别站队——去检查"指标是怎么算出来的"。',
  },

  hypotheses: [
    { id: 'h-bucket', text: '直方图桶边界配置错误：最大桶 100ms，超时请求全部落最后一桶，P99 被结构性低估', excludeActionId: 'a-bucket' },
    { id: 'h-sample', text: '采样偏差：慢请求没被记录（采样率/丢弃）', excludeActionId: 'a-sample' },
    { id: 'h-client', text: '用户端网络问题：服务端其实快', excludeActionId: 'a-client' },
    { id: 'h-calc', text: 'P99 计算逻辑错误：查询/聚合方式有 bug', excludeActionId: 'a-calc' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '用全链路 trace 对比指标',
      desc: '同一个接口，两个"真相"——先确认矛盾真实存在',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'trace 与指标对照',
        text: 'trace 抽样 1000 笔结算请求：服务端耗时 P50 300ms / P99 2.4s。\n同期指标：P99 45ms。\n→ 矛盾真实且巨大：不是用户错觉，是测量在撒谎。指标与 trace 谁在撒谎，待查。',
      },
    },
    {
      id: 'a-bucket',
      name: '检查直方图的桶边界配置',
      desc: '指标的"尺子"刻度是怎么刻的',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-bucket'],
      hypotheses: [{ id: 'h-bucket', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'histogram 桶配置（重构时埋点）',
        text: 'buckets: [10, 25, 50, 75, 100]   ← 最大桶 100ms！\n→ 所有 >100ms 的请求全部落进 +Inf 桶，\n100ms 以上不再有任何刻度——P99 计算时"最后一个桶的左边界"= 75ms，\n无论真实耗时 200ms 还是 5s，读数永远不会超过 100ms。\n→ 指标不是在撒谎，是尺子只有 100mm 就封顶了。',
      },
    },
    {
      id: 'a-sample',
      name: '核查采样与上报完整性',
      desc: '排除慢请求没被记录',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-sample'],
      hypotheses: [{ id: 'h-sample', status: 'excluded' }],
      result: {
        type: 'text',
        title: '采样核对',
        text: '埋点为全量上报（无采样）；请求计数与网关访问数一致。\n→ 慢请求都被记录了——只是被塞进了最后一个桶。',
      },
    },
    {
      id: 'a-calc',
      name: '核查 P99 计算查询逻辑',
      desc: '排除查询/聚合 bug',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-calc'],
      hypotheses: [{ id: 'h-calc', status: 'excluded' }],
      result: {
        type: 'text',
        title: '查询逻辑核对',
        text: 'Grafana 查询 histogram_quantile(0.99, ...)，标准写法。\n→ 计算无辜：给它正确的桶，它就能给出正确的分位数。',
      },
    },
    {
      id: 'a-client',
      name: '核对投诉用户的端侧数据',
      desc: '排除用户端网络问题',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-client'],
      hypotheses: [{ id: 'h-client', status: 'excluded' }],
      result: {
        type: 'text',
        title: '端侧核对',
        text: 'trace 显示服务端处理耗时 2.4s（不含端侧网络）。\n→ 服务端真的慢，与端侧无关。',
      },
    },
    {
      id: 'a-history',
      name: '追溯埋点变更历史',
      desc: '尺子是什么时候刻错的',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '埋点变更考古',
        text: '一个月前结算服务重构：埋点从旧 SDK 迁移到新 SDK。\n旧 SDK 桶：[10, 50, 100, 500, 1000, 5000]（覆盖到 5s）\n新 SDK 桶：[10, 25, 50, 75, 100]（100ms 封顶）\n→ 重构时"顺手动过指标埋点"，桶边界从覆盖 5s 变成 100ms 封顶——从此 P99 永远 ≤100ms。',
      },
    },
    {
      id: 'a-report',
      name: '按大盘结论对外通报"服务健康"',
      desc: '【状态变更】用 45ms 的数据回应投诉与老板',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '通报结果',
        text: '向业务方通报"结算服务 P99 45ms，服务健康，建议用户检查网络"。\n→ 用错误的尺子为错误背书：投诉用户收到"服务一切正常"的回复，信任二次受损。\n此选项仅作为反面教学：测量没修好之前，任何"结论"都是幻觉。',
      },
    },
    {
      id: 'a-fixbucket',
      name: '重设计桶边界并回填告警',
      desc: '【状态变更】对数分布覆盖到 10s，加超长尾告警',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '新桶：[10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]\n新增告警："+Inf 桶占比 > 1%"（超尺请求过多时提醒尺子不够长）。\n→ 真实 P99 = 2.4s 首次如实呈现，结算优化立项。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-bucket', text: '结算服务重构时直方图桶边界被改为 100ms 封顶——所有超时请求落最后一桶，P99 结构性低估为 45ms，慢请求一个月不可见', correct: true },
    { id: 'rc-sample', text: '慢请求未被采样上报（采样偏差）', correct: false },
    { id: 'rc-client', text: '投诉用户端侧网络问题，服务端实际正常', correct: false },
    { id: 'rc-calc', text: 'P99 查询/聚合计算逻辑 bug', correct: false },
  ],

  expertCost: 5,
  restartActionId: 'a-fixbucket',

  expertChain: [
    {
      thought: '指标和 trace 打架——先别站队，把矛盾钉死：同一接口、同口径、同时间的对照。',
      update: 'trace P99 2.4s vs 指标 P99 45ms，矛盾真实且巨大——两者必有一个在撒谎。',
      actionId: 'a-impact',
      why: '2⚡ 矛盾真实化是第一步：先证明"测量在撒谎"这个前提成立，才值得投入排查测量工具本身。',
      conclusion: '矛盾实锤 → 检查指标是怎么算出来的。',
    },
    {
      thought: '指标是直方图算的——去看"尺子"的刻度：桶边界配置。',
      update: '桶边界最大 100ms：所有 >100ms 的请求全落最后一桶，P99 读数永远 ≤100ms——结构性低估实锤。',
      actionId: 'a-bucket',
      why: '2⚡ 直捣机制：分位数读数 ≤ 最大桶边界，这是直方图的数学性质——尺子短了，多长的东西都量成一样长。',
      conclusion: '桶边界缺陷实锤（重构埋点引入）→ 排除其余假设，修尺子。',
    },
    {
      thought: '采样/计算/端侧三个假设快速排除：全量上报 ✓、查询标准写法 ✓、服务端 trace 真慢 ✓。',
      update: '尺子缺陷实锤 → 修复桶边界，并追溯尺子是谁刻错的。',
      actionId: 'a-history',
      why: '1⚡ 追溯埋点变更历史：一个月前重构时新 SDK 迁移，桶从覆盖 5s 变成 100ms 封顶——顺手的迁移成了最贵的疏忽。',
      conclusion: '尺子刻错的时间点锁定：重构上线当日起，P99 读数永远 ≤100ms。',
    },
    {
      thought: '采样/计算/端侧/历史全部闭合：修尺子 + 追溯通报 + 结算优化立项——停止收集。',
      update: '停止收集。桶边界修复、超尺告警、结算优化三线并行。',
      actionId: '',
      why: '【停止规则】机制闭环：尺子 100ms 封顶 → P99 永远 ≤100ms → 慢请求不可见；三个排除项闭合、时间线锁定，无剩余假设。',
      conclusion: '新桶对数分布覆盖 10s + 超尺告警；真实 P99 2.4s 首次如实呈现，结算优化立项。',
    },
  ],

  lessons: [
    {
      text: '指标是测量工具算出来的：工具的参数（桶边界/采样率/聚合窗口）错了，指标就是错的。',
      principle: '验证思维：相信任何指标之前，先看它的测量定义。指标与 trace/用户投诉打架时，优先怀疑"尺子"而不是现实。',
    },
    {
      text: '直方图桶边界必须覆盖真实尾部：最大桶 100ms 的尺子，量不出 2 秒的灾难。',
      principle: '程序设计纪律：延迟直方图用对数分布（10ms→10s），并在 +Inf 占比超阈值时告警——"超出尺子的请求变多了"本身就是故障信号。',
    },
    {
      text: 'P99 正常不代表没问题：P999、+Inf 桶占比、全链路 trace，是指标的交叉验证。',
      principle: '验证思维：单一指标会撒谎，交叉验证让谎言现形——用户投诉与指标打架时，永远相信 trace 和用户的体感。',
    },
    {
      text: '重构时"顺手动过埋点"是最隐蔽的变更：埋点的变更评审，应该和代码变更同等严格。',
      principle: '沉淀思维：埋点/告警/监控配置纳入代码评审范围——它们是工程师的眼睛，眼睛的度数变了，看到的世界就变了。',
    },
  ],
}
