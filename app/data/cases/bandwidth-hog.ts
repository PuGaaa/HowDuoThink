import { DiagnosisCase } from '../../types/case'

/**
 * 第 15 章 · 网络深处 第五批（链路饱和无 QoS L2）
 * 教学点：全栈视野——链路是共享资源：大流量任务无 QoS 划分时，API 的小包在队列里陪葬；
 * 带宽准入表让跨机房大流量任务先登记后执行。
 * 专家路径：impact(1) + linkutil(2) + connshare(1) = 4⚡︎
 */
export const bandwidthHogCase: DiagnosisCase = {
  id: 'bandwidth-hog',
  title: '每晚两点的 API 抖动：日志同步把路吃光了',
  intro: '每晚 2 点 API 延迟毛刺 15 分钟：数仓同步任务把 1Gbps 专线吃满——API 的小包在队列里排队。',
  domain: 'network',
  layer: '链路是共享资源——没有 QoS 的带宽就是先到先得的丛林',
  part: 'master',
  chapterId: 'network',
  order: 8,
  typeTags: ['network', 'capacity', 'resource'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」的平台 SRE，一条"每晚准时出现又准时消失"的延迟毛刺挂了三天。',
    architecture: '应用机房 ↔ 数据机房（1Gbps 专线, 承载 API 调用 + 数仓同步 + 备份）｜ 跨机房 API：订单服务 → 数据服务',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '毛刺画像',
        text: '跨机房 API RTT：0.8ms → 15ms（排队时延），窗口 2:00~2:15 每晚准时。\n毛刺期内零丢包告警、零错误率上升——只是"所有请求一起变慢"。',
      },
      {
        type: 'text',
        title: '时间相关性',
        text: '数仓同步任务窗口：2:00~2:15（全量模式）——与毛刺逐秒重合。\n白天同步任务跑增量时（带宽占用低），API 一切正常。',
      },
    ],
    timeline: '数仓同步上月从增量改为全量（数据一致性整改）｜ 毛刺自改造后出现 ｜ 专线 QoS 从未配置过',
    impactHint: '毛刺与同步任务逐秒重合——但"重合"不等于"因果"：同步的什么行为，能拖慢不相关的小包？',
  },

  hypotheses: [
    { id: 'h-saturation', text: '链路饱和：同步占满 1Gbps，API 小包在无差别队列里排队（无 QoS）', excludeActionId: 'a-linkutil' },
    { id: 'h-conn', text: '同步任务的连接数占满网关连接表，API 无连接可用', excludeActionId: 'a-connshare' },
    { id: 'h-qos', text: '交换机 QoS 配置变更，API 流量失去优先级（曾有优先级被改没）', excludeActionId: 'a-qosdiff' },
    { id: 'h-gc', text: '凌晨定时任务引发应用 GC，与同步只是时间巧合', excludeActionId: 'a-timeline' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '对齐三条时间线',
      desc: '影响面：毛刺、同步任务、链路利用率三条曲线的逐秒关系',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '三线对齐',
        text: '毛刺窗口：   2:00:00 ~ 2:14:40\n同步窗口：   2:00:05 ~ 2:14:35（全量模式）\n链路利用率： 20% → 98% → 20%（与同步完全同步）\nRTT 形态：   阶梯式抬升（0.8→15ms）非长尾——排队特征\n→ 三线逐秒咬合 + 排队形态：链路层饱和的形状，不是应用层抖动。',
      },
    },
    {
      id: 'a-linkutil',
      name: '解剖链路利用率与队列行为',
      desc: '同步占了多少、API 排在哪、谁在丢',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-saturation'],
      hypotheses: [{ id: 'h-saturation', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '链路解剖',
        text: '同步任务瞬时速率：940Mbps（全量模式单流打满）\n交换机出方向：利用率 98%，drop 0.3%（API 小包在队列尾部被丢→重传→更慢）\n队列行为：FIFO 无差别排队——940Mbps 的批量流与 0.8KB 的 API 包一视同仁\n实锤：饱和 × 无 QoS = 小包陪葬。同步"没做错什么"，是链路没有规则。',
      },
    },
    {
      id: 'a-connshare',
      name: '核对连接表与网关资源',
      desc: '排除连接耗尽',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-conn'],
      hypotheses: [{ id: 'h-conn', status: 'excluded' }],
      result: {
        type: 'text',
        title: '连接核对',
        text: '网关连接表 6%/4 万；同步任务连接数 32——资源充裕。\n→ 排除连接层：瓶颈在带宽不在连接。',
      },
    },
    {
      id: 'a-qosdiff',
      name: '核对交换机 QoS 配置历史',
      desc: '排除"优先级被改没"',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-qos'],
      hypotheses: [{ id: 'h-qos', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'QoS 核对',
        text: '交换机配置 14 个月未变：从未配置过 QoS——不是"丢了优先级"，是"从来没有优先级"。\n→ 排除变更问题，确认设计空白。',
      },
    },
    {
      id: 'a-timeline',
      name: '核对同窗口的应用层事件',
      desc: '排除 GC/定时任务巧合',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-gc'],
      hypotheses: [{ id: 'h-gc', status: 'down' }],
      result: {
        type: 'text',
        title: '应用层核对',
        text: '2 点确有日志切割定时任务，GC 毛刺 40ms 级——解释不了 15ms 的持续 RTT 抬升；\n且 RTT 抬升与"同步开始"而非"GC 时刻"逐秒对齐。\n→ 降权：巧合存在但不是主因。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急 kill 同步任务保 API',
      desc: '【状态变更】中止当夜数仓同步',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '中止结果',
        text: '毛刺消失，API 恢复。\n代价：数仓当日指标缺失，BI 报表延后一天——业务权衡。\n→ 每晚 kill 一次不是方案：带宽的分配规则要建立，而不是天天人肉裁决。',
      },
    },
    {
      id: 'a-fixqos',
      name: '修复：QoS 分级 + 同步限速错峰',
      desc: '【状态变更】API 流量 DSCP EF 优先；同步任务限速 400Mbps + 改增量分片',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① QoS：API/交易流量标记 EF（高优先），同步/备份批量流 BF（低优先）\n② 同步任务：全量改增量分片 + 令牌桶限速 400Mbps（双保险）\n回归：同步窗口内 API RTT 0.9ms（毛刺消失）；同步总耗时仅 +18%（限速代价可接受）。',
      },
    },
    {
      id: 'a-fixregistry',
      name: '沉淀：跨机房带宽准入表',
      desc: '【状态变更】大流量任务登记：窗口/速率/优先级/回退方案；新任务冲突检测',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '准入表',
        text: '带宽准入登记：同步 400Mbps/BF/02:00 ｜ 备份 200Mbps/BF/03:00 ｜ API 预留 EF ……\n新任务上线先登记冲突检测（窗口重叠 × 速率合计 vs 容量）——链路从丛林变成有规则的道路。',
      },
    },
    {
      id: 'a-fixmon',
      name: '沉淀：利用率分级告警 + 关联看板',
      desc: '【状态变更】链路利用率 70/90% 两级告警；API RTT × 链路利用率关联看板',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控 v2',
        text: '利用率告警（70% 预警 / 90% 告警）让"98% 的深夜"不再无人知晓；\n关联看板让"毛刺与谁重合"一眼可见——下次直接看图定位，不用三天抓包。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-saturation', text: '数仓全量同步（940Mbps 单流）将 1Gbps 专线打到 98% 饱和：FIFO 无差别队列下 API 小包排队+尾丢重传，RTT 0.8→15ms——链路无任何 QoS 分级，大流量与关键流量先到先得', correct: true },
    { id: 'rc-conn', text: '同步任务连接占满网关连接表', correct: false },
    { id: 'rc-qos', text: '交换机 QoS 配置变更丢失优先级', correct: false },
    { id: 'rc-gc', text: '凌晨定时任务 GC 与同步时间巧合（次因降权）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '毛刺与同步逐秒重合——但重合不等于因果：三条时间线（毛刺/同步/利用率）对齐看形状。',
      update: '三线逐秒咬合 + RTT 阶梯式排队形态——链路饱和的形状，排除应用层巧合的主因地位。',
      actionId: 'a-impact',
      why: '1⚡︎ RTT 的形态是排队理论的指纹：阶梯抬升 = 队列排队，随机长尾 = 应用抖动——形态把嫌疑从应用层拉到链路层。',
      conclusion: '嫌疑锁定：链路饱和 × 无 QoS（h-saturation 升权）。',
    },
    {
      thought: '解剖链路：同步占多少、API 排在哪、谁在丢——把"饱和"拆成队列行为。',
      update: '实锤：940Mbps 单流 + FIFO 无差别 + API 小包尾丢 0.3%——"同步没错，链路无规则"的完整定性。',
      actionId: 'a-linkutil',
      why: '2⚡︎ 队列行为解剖区分了"谁错"与"什么缺失"：同步任务没有错，错的是链路没有给关键流量留规则——修复对象从"管住任务"扩展到"建立规则"。',
      conclusion: '根因实锤：饱和 × QoS 空白。',
    },
    {
      thought: '连接表 1⚡︎ 排除——连接类解释（端口耗尽/连接表满）与带宽类解释容易混淆。',
      update: '连接余量充足——瓶颈是比特不是会话。',
      actionId: 'a-connshare',
      why: '1⚡︎ 网络资源的"多种瓶颈"要先分型：带宽（比特/秒）与连接（会话数）是两种资源，症状都是"慢"——排除连接型，修复才能对准带宽型。',
      conclusion: '嫌疑收敛单点。',
    },
    {
      thought: 'QoS 历史与应用层巧合各留一笔：前者确认设计空白，后者降权避免归因污染。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（饱和×FIFO）✓ 设计（QoS 从未存在）✓ 防线（准入表+分级告警）✓——机制、设计、防线三层闭合。',
      conclusion: '沉淀：没有 QoS 的带宽是先到先得的丛林——大流量任务要准入登记，关键流量要标记优先，两者合起来才是"共享链路的秩序"。',
    },
  ],

  lessons: [
    {
      text: '没有 QoS 的链路是先到先得的丛林：940Mbps 的批量流与 0.8KB 的 API 包在 FIFO 里一视同仁——小包陪葬。',
      principle: '全栈视野：共享链路必须分级——关键流量（API/交易）标记高优先（DSCP EF），批量任务（同步/备份）标记低优先 + 限速。QoS 的缺失平时不可见（带宽够用），饱和时才显形——它是"设计空白"而非"配置错误"。',
    },
    {
      text: 'RTT 形态是指纹：阶梯式抬升 = 队列排队（链路层），随机长尾 = 应用抖动（GC/锁）——形态定层再解剖。',
      principle: '验证思维：延迟毛刺先读形态定层——排队形态查链路利用率，锯齿查 GC，脉冲查定时任务。三线对齐（毛刺/任务/利用率逐秒咬合）+ 形态指纹，双证据下"巧合论"自动退场。',
    },
    {
      text: '大流量任务要准入登记：窗口、速率、优先级、回退方案——新任务冲突检测，链路才不会每晚上演丛林法则。',
      principle: '架构治理：跨机房/共享链路的带宽准入表让"资源预约"制度化——数仓的"全量改增量+限速"与 API 的"EF 优先"并行不悖。业务权衡（同步 +18% 耗时 vs API 稳定）要有数据支撑地做，而不是每晚人肉 kill。',
    },
  ],
}
