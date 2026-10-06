import { DiagnosisCase } from '../../types/case'

/**
 * 第 10 章 · 可观测性迷雾（平均值掩盖 L3）
 * 教学点：平均值是并发请求的"民主投票"，少数派的真实体验会被淹没；分位数（P95/P99）与分组才是长尾的显影液。
 * 专家路径：impact(1) + histogram(2) + nodelist(2) = 5⚡︎
 */
export const avgMetricCase: DiagnosisCase = {
  id: 'avg-metric',
  title: '平均 80ms 的接口，用户却在超时',
  intro: '周会汇报接口"平均响应 80ms，性能优秀"，同一天客服收到 12 个超时投诉。两个事实打架了。',
  domain: 'runtime',
  layer: '平均值是并发请求的民主投票：多数派的声音会淹没少数派的真实体验',
  part: 'master',
  chapterId: 'observability',
  order: 2,
  typeTags: ['observability', 'capacity', 'config'],
  difficulty: 3,

  scene: {
    role: '你是网关负责人，周报的性能数据很漂亮，但超时投诉让你无法自圆其说。',
    architecture: '用户 → 网关(8 实例) → 商品服务',
    symptoms: [
      {
        type: 'error',
        title: '客服反馈（12 例）',
        text: '用户打开商品页 5 秒超时，重试多次偶尔成功。投诉时间分散全天，无集中时段。',
      },
      {
        type: 'text',
        title: '监控大盘',
        text: '商品服务平均响应 80ms（周报同款数据），QPS 平稳，错误率 0.2%。\n按这个数据，不应该有超时。',
      },
    ],
    timeline: '超时投诉持续一周 ｜ 三周前网关扩容过 2 台实例（承接 10% 流量）',
    impactHint: '12 个投诉是少数派体验——先确认：是所有人的体验差，还是少数人极差？',
  },

  hypotheses: [
    { id: 'h-node', text: '部分网关实例异常，只打到坏实例的请求超时', excludeActionId: 'a-nodelist' },
    { id: 'h-avg', text: '平均值掩盖了长尾：整体 OK 但少数请求极慢', excludeActionId: 'a-histogram' },
    { id: 'h-region', text: '特定地域/运营商用户网络问题', excludeActionId: 'a-region' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定超时用户画像',
      desc: '超时用户的地域、账号、时间分布',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-region'],
      hypotheses: [{ id: 'h-region', status: 'down' }],
      result: {
        type: 'text',
        title: '用户画像',
        text: '超时用户地域/运营商/时段完全分散——无共性。\n唯一共性：全天随机出现，占比约 10%。',
      },
    },
    {
      id: 'a-histogram',
      name: '看响应时间分位数与直方图',
      desc: 'P50/P95/P99 与分桶分布',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-avg'],
      hypotheses: [{ id: 'h-avg', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '响应时间分布',
        text: 'P50=60ms  P95=110ms  P99=4800ms  max=5100ms\n直方图：90% 请求 <100ms；10% 请求 >4800ms——双峰分布！\n→ 平均 80ms 是两个峰混合的假象：慢的那 10% 全部 >4.8 秒',
      },
    },
    {
      id: 'a-nodelist',
      name: '按实例分组看慢请求归属',
      desc: '慢请求打到了哪台网关实例',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-node'],
      hypotheses: [{ id: 'h-node', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '实例分组',
        text: '慢请求 100% 落在 gw-07、gw-08 两台实例（三周前新扩容）；\n老实例上无慢请求。\n→ 双峰的两个峰 = 两组实例',
      },
    },
    {
      id: 'a-gwconf',
      name: '对比新旧实例的网关配置',
      desc: '找出 gw-07/08 慢的配置差异',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '配置 diff',
        text: 'gw-07/08 缺少配置项：proxy upstream keepalive（上游长连接复用）\n→ 每个请求都重新建 TCP+TLS 连接到商品服务，多耗 4~5 秒（跨机房握手）',
      },
    },
    {
      id: 'a-region',
      name: '查超时用户地域与运营商分布',
      desc: '排除用户侧网络',
      cost: 2,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-region'],
      hypotheses: [{ id: 'h-region', status: 'excluded' }],
      result: {
        type: 'text',
        title: '地域分布',
        text: '超时用户地域/运营商完全随机——与用户侧无关，纯服务端问题。',
      },
    },
    {
      id: 'a-oldmetric',
      name: '查老实例的分位数',
      desc: '老实例是否也偶发慢（排除整体问题）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-node'],
      hypotheses: [{ id: 'h-node', status: 'up' }],
      result: {
        type: 'text',
        title: '老实例分位',
        text: 'gw-01~06：P99=95ms，零慢请求——老实例干净，慢请求 100% 归属新扩容组。',
      },
    },
    {
      id: 'a-gwfix',
      name: '补齐 keepalive 配置并验证',
      desc: '修复 gw-07/08 配置后恢复流量',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复验证',
        text: '补 keepalive 后 P99 回落到 110ms，重新接入流量，无超时反馈。结案。',
      },
    },
    {
      id: 'a-weight',
      name: '把 gw-07/08 权重临时归零',
      desc: '【状态变更】摘除慢实例流量',
      cost: 4,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '摘流结果',
        text: '权重归零后超时投诉立即停止——确认因果，剩余为实例修复问题。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-keepalive', text: '新扩容的 gw-07/08 缺少上游长连接配置，10% 流量每请求重建跨机房连接导致超时', correct: true },
    { id: 'rc-region', text: '特定地域用户网络质量问题', correct: false },
    { id: 'rc-capacity', text: '网关整体容量不足导致全体变慢', correct: false },
  ],

  expertCost: 5,
  restartActionId: 'a-weight',

  expertChain: [
    {
      thought: '12 个投诉 vs 平均 80ms——两个事实必有一个在骗人。平均数的骗术是"掩盖长尾"，先找超时用户的共性。',
      update: '地域/运营商/时段全随机，共性只剩"约 10%"这个占比——指向按比例分配的服务端资源。',
      actionId: 'a-impact',
      why: '1⚡︎ 买画像：随机分布的少数派超时，最像"按比例分流到坏节点"，而不是地域或容量问题。',
      conclusion: '用户画像无地域共性 → 排除 h-region，怀疑实例级差异。',
    },
    {
      thought: '平均值会骗人，分布不会。看分位数与直方图——如果双峰，一切就解释通了。',
      update: '实锤双峰：90% <100ms、10% >4.8s。平均 80ms 是混合假象。',
      actionId: 'a-histogram',
      why: '2⚡︎ 直方图是拆穿平均值的关键动作——两个峰的存在直接证明"两类请求、两种命运"。',
      conclusion: '双峰实锤 → 找"10% 慢请求"的归属（实例/上游/路由）。',
    },
    {
      thought: '按实例分组：如果慢请求集中在特定实例，就是实例配置/状态差异。',
      update: '实锤：慢请求 100% 在 gw-07/08（新扩容）。',
      actionId: 'a-nodelist',
      why: '2⚡︎ 分组对比直接定位坏实例——网关类故障的"按实例分组"几乎总能命中。',
      conclusion: '慢请求全部落在新扩容实例 → 对比新旧实例配置找差异。',
    },
    {
      thought: '配置 diff 给出机制：新实例缺上游长连接，每请求重建跨机房连接。证据链闭合。',
      update: '停止收集：摘流止血 + 补配置修复。',
      actionId: '',
      why: '根因（缺 keepalive 配置）+ 修复（补配置）+ 止血（摘流）全部明确。',
      conclusion: '摘流止血 → 补 keepalive 配置 → 监控改为 P95/P99 分位数告警。',
    },
  ],

  lessons: [
    {
      text: '平均响应时间会撒谎：双峰分布下平均数不代表任何一组用户的真实体验。',
      principle: '性能数据必须看分布（P50/P95/P99/直方图）而不是平均值——平均 80ms 可以同时意味着"多数 60ms + 少数 5s"。平均值是最容易被长尾污染的指标。',
    },
    {
      text: '按实例/分片分组对比是定位"部分用户故障"的通用解法。',
      principle: '随机命中的少数派问题几乎都来自"按比例分配的资源"：扩容新实例、灰度节点、特定分片。分组对比让坏组自己浮出水面。',
    },
    {
      text: '监控告警要用分位数：平均值达标时，P99 可能已经在燃烧。',
      principle: 'SLA 承诺的是每个请求的体验，不是所有请求的平均体验。告警阈值必须基于 P95/P99（或分桶超时数），平均值告警只配当氛围组。',
    },
  ],
}
