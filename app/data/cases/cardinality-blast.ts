import { DiagnosisCase } from '../../types/case'

/**
 * 第 10 章 · 可观测性迷雾 第二批（指标基数爆炸 L2）
 * 教学点：架构设计——每个 label 组合都是一条独立时间序列：高基数信息进指标 = 监控自杀；
 * 度量设计权衡：指标答"多少"，日志/trace 答"谁"。
 * 专家路径：impact(1) + seriescount(2) + queryload(1) = 4⚡︎
 */
export const cardinalityBlastCase: DiagnosisCase = {
  id: 'cardinality-blast',
  title: '监控自己先挂了：一个标签打爆时序库',
  intro: '监控自己先挂了：一个 user_id 标签让时序数据库两周 OOM 三次——出事时谁也查不了问题。',
  domain: 'runtime',
  layer: '指标答"多少"，日志答"谁"——高基数信息进指标就是监控自杀',
  part: 'master',
  chapterId: 'observability',
  order: 7,
  typeTags: ['resource', 'architecture', 'capacity'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」平台的 SRE，最尴尬的一幕发生了：正在查线上问题，监控系统先崩了。',
    architecture: '业务服务(暴露 metrics) → Prometheus(抓取+存储, 8GB 内存) → Grafana 大盘 / 告警',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: 'Prometheus 状态',
        text: 'OOM 重启 3 次/周，内存 8GB → 打满 → 崩溃循环。\n活跃时间序列：200 万 → 4.2 亿（三周内翻 210 倍）。',
      },
      {
        type: 'text',
        title: '起因追溯',
        text: '三周前"接口耗时指标"新增 user_id 标签（新同事想查"单用户慢请求"）。\n平台日均活跃用户：120 万。\n改动合入时 CI 全绿、接口正常——没人意识到标签的代价。',
      },
    ],
    timeline: '三周前指标改动合入 ｜ 两周前监控开始 OOM ｜ 大促前 20 天——监控必须立刻恢复',
    impactHint: '每个用户 × 每个接口 = 一条独立时间序列——先算清"一个标签"值多少内存，再谈怎么救。',
  },

  hypotheses: [
    { id: 'h-cardinality', text: '基数爆炸：user_id（120 万）× 接口 × 实例的组合让时间序列数失控', excludeActionId: 'a-seriescount' },
    { id: 'h-scrape', text: '抓取间隔被调密，存储写入量翻倍', excludeActionId: 'a-scrapeintv' },
    { id: 'h-retention', text: '数据保留期配置过长，磁盘/内存积压', excludeActionId: 'a-retentioncfg' },
    { id: 'h-query', text: '大盘慢查询/全量扫描导致内存泄漏拖垮实例', excludeActionId: 'a-queryload' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '对齐序列数增长曲线与指标变更',
      desc: '影响面：爆炸是从哪个指标开始的时间对齐',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '增长曲线归因',
        text: '序列数：三周前 200 万 → 4.2 亿，跳变日 = user_id 标签合入日 ✓\n旧指标总量：稳定在 200 万（无异常）\n新指标单条贡献：120 万用户 × 8 接口 × 40 实例分片 → 理论 384 亿，活跃 4.2 亿\n→ 爆炸源唯一且明确：不是"监控变重了"，是"一个标签在创造宇宙"。',
      },
    },
    {
      id: 'a-seriescount',
      name: '基数审计：算清新指标的真实代价',
      desc: 'label 组合数 × 每序列内存 = 总账单',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cardinality'],
      hypotheses: [{ id: 'h-cardinality', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '基数账单',
        text: 'label 基数：user_id 120 万 × api 8 × instance 40 = 384 亿理论组合\n活跃序列（实际被写过的）：4.2 亿\n每序列内存开销（索引+头）：约 1KB → 仅序列头就要 400GB 级\nPrometheus 只有 8GB——这不是"配置不够"，是设计上不可能装下。\n实锤：user_id 是无界基数标签，metrics 体系的天敌。',
      },
    },
    {
      id: 'a-costmodel',
      name: '度量设计权衡：这个需求该用什么答',
      desc: '"查单用户慢请求"的正确载体是什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '度量分层权衡',
        text: '需求本质：偶尔排查"某个用户为什么慢"——是"按个体查询"，不是"统计全体"。\n指标（metrics）擅长：预聚合的统计（QPS/P99/错误率）——答"多少、多快"。\n日志/trace 擅长：个体明细与检索——答"谁、哪一次、为什么"。\n→ 用指标做个体检索 = 用错了工具：一次性排查诉求付了 400GB 常驻代价。',
      },
    },
    {
      id: 'a-scrapeintv',
      name: '核对抓取间隔配置',
      desc: '排除抓取加密',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-scrape'],
      hypotheses: [{ id: 'h-scrape', status: 'excluded' }],
      result: {
        type: 'text',
        title: '抓取配置',
        text: '全局 scrape_interval 30s，三周未变。\n→ 排除抓取频率。',
      },
    },
    {
      id: 'a-retentioncfg',
      name: '核对数据保留期',
      desc: '排除保留期积压',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-retention'],
      hypotheses: [{ id: 'h-retention', status: 'excluded' }],
      result: {
        type: 'text',
        title: '保留配置',
        text: '保留期 30d 未变；OOM 的压力来自"活跃序列头"（内存索引），不是磁盘历史数据。\n→ 排除保留期。',
      },
    },
    {
      id: 'a-queryload',
      name: '核对大盘查询负载',
      desc: '排除查询侧拖垮',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-query'],
      hypotheses: [{ id: 'h-query', status: 'excluded' }],
      result: {
        type: 'text',
        title: '查询负载',
        text: 'OOM 发生时段与查询高峰无相关（半夜也崩）；查询延迟在崩溃前正常。\n→ 排除查询侧：压力来自写入侧的序列爆炸。',
      },
    },
    {
      id: 'a-danger',
      name: '强制 drop 新指标序列并重启',
      desc: '【状态变更】metric_relabel_configs 丢弃 user_id 指标 + 重启',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '新指标全量 drop，序列回落 200 万，监控恢复——大盘与告警重新可用。\n代价：进行中的"单用户慢请求"排查中断（本来也快查不动了）。\n→ 监控的可用性 > 单个排查诉求。',
      },
    },
    {
      id: 'a-fixlabel',
      name: '修复：label 白名单规范',
      desc: '【状态变更】指标 label 基数上限评估（< 1 万）+ 高基数信息禁入',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '规范 v2',
        text: '① label 白名单：userId/orderId/token 等无界值禁止作为 label\n② 新增 label 必须评估基数：估计值 > 1 万需架构评审\n③ "单用户慢请求"改道：慢请求日志采样（带 userId）+ trace 检索，按需查询零常驻成本。',
      },
    },
    {
      id: 'a-fixguard',
      name: '沉淀：基数守门告警',
      desc: '【状态变更】新增序列速率告警 + 单指标序列数上限 + CI 指标审查清单',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '守门体系',
        text: '① Prometheus 告警：单指标新增序列速率 > 1000/min\n② 单指标活跃序列 > 10 万告警（这次改动两周前就会亮灯）\n③ CI 指标审查：新增指标代码必须填"基数评估表"。',
      },
    },
    {
      id: 'a-fixedu',
      name: '沉淀：度量设计课进新人培训',
      desc: '【状态变更】"指标答多少、日志答谁"分层原则写进研发手册与新人必修',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '培训落地',
        text: '研发手册新增"可观测性三件套分工"：metrics（统计）/ logging（明细）/ tracing（因果链）。\n新人必修课含"基数灾难"案例——用这次 400GB 的学费，换下一个人的常识。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-cardinality', text: 'user_id（120 万无界基数）作为指标 label：120 万×8 接口×40 实例的组合让活跃序列三周膨胀 210 倍（4.2 亿），序列头内存需求 400GB 级 vs Prometheus 8GB——监控体系被一个标签击穿', correct: true },
    { id: 'rc-scrape', text: '抓取间隔调密导致写入量翻倍', correct: false },
    { id: 'rc-retention', text: '数据保留期过长导致存储积压', correct: false },
    { id: 'rc-query', text: '大盘慢查询内存泄漏拖垮实例', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '监控崩了要先当一次"被监控对象"的事故指挥：序列数曲线与什么变更对齐？',
      update: '跳变日 = user_id 标签合入日，旧指标稳定——爆炸源唯一：一个标签在创造宇宙。',
      actionId: 'a-impact',
      why: '1⚡︎ 变更对齐是监控类故障的第一动作：序列数是"组合数"型增长，必然有明确的起点变更——曲线会指认它。',
      conclusion: '嫌疑锁定：label 基数（h-cardinality 升权）。',
    },
    {
      thought: '把账算出来：label 基数的组合数 × 每序列内存——让数字说明"为什么 8GB 不可能装下"。',
      update: '实锤：384 亿理论组合 / 4.2 亿活跃 / 400GB 级内存需求 vs 8GB——设计上不可能，不是配置问题。',
      actionId: 'a-seriescount',
      why: '2⚡︎ 基数账单是这次排查的核心一击：它把"监控崩了"翻译成"一个设计决策的代价清单"——组合数爆炸是乘法，不是加法，直觉会严重低估。',
      conclusion: '根因实锤 → 排除配置侧嫌疑。',
    },
    {
      thought: '度量设计的根本权衡要讲清楚：这个"查单用户"的需求本该用什么工具答。',
      update: '分层确认：指标答统计，日志/trace 答个体——用错工具的代价是 400GB 常驻。',
      actionId: 'a-costmodel',
      why: '1⚡︎ 架构设计思维的落点：可观测性三件套不是随便选的——"统计 vs 个体"的语义分工决定载体。工具选错，再强的监控也装不下错误的需求。',
      conclusion: '修复双线：止血 drop + 需求改道（日志采样+trace）。',
    },
    {
      thought: '抓取间隔、保留期、查询负载三个配置侧嫌疑各 1⚡︎ 排除——把"不是配置能救的"钉死。',
      update: '三项配置均未变且与爆炸无因果——配置调优救不了设计缺陷。',
      actionId: 'a-queryload',
      why: '1⚡︎ 排除配置侧是为了防止"加内存/调参数"式的错误修复：基数爆炸加内存只是推迟爆炸——证据把修复逼到设计层。',
      conclusion: '嫌疑收敛 → 规范 + 守门 + 培训三层落地。',
    },
    {
      thought: '止血（drop+重启）、修复（label 白名单）、守门（基数告警+CI 审查）、沉淀（分层原则进培训）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（组合数爆炸）✓ 设计（载体选错）✓ 防线（守门告警）✓——技术、制度、认知三层闭合。',
      conclusion: '沉淀：可观测性本身也需要被观测。基数守门告警是"监控的监控"——这次 400GB 的学费要变成下个人的常识。',
    },
  ],

  lessons: [
    {
      text: '每个 label 组合是一条独立时间序列：无界值（userId/orderId/token）进 label，就是让时序库按乘法爆炸。',
      principle: '架构设计：加 label 前先算基数账（各 label 基数相乘 × 采样频率）。经验红线：单指标活跃序列 < 10 万，任意 label 基数 < 1 万且必须是有界枚举。基数守门告警（新增序列速率/单指标上限）是监控的监控。',
    },
    {
      text: '可观测性三件套有分工：指标答"多少"（预聚合统计），日志答"谁与哪次"（明细检索），trace 答"因果链"——用指标做个体检索是用错工具。',
      principle: '度量设计：需求的语义决定载体。"偶尔查某个用户"是检索需求（日志/trace）不是统计需求（metrics）。载体选错的最危险之处：改动当时一切正常，代价在三周后以更难排查的方式爆发。',
    },
    {
      text: '监控系统的变更也要过变更管理：一个标签的合入能击穿整个监控体系，而它的 CI 检查是全绿的。',
      principle: '流程设计：CI 绿只保证代码正确，不保证资源代价可接受。指标/日志这类"隐性资源消耗"的变更需要专门的审查维度（基数评估表）——没有守门的体系，每个新人的合理小需求都是潜在的下一颗雷。',
    },
  ],
}
