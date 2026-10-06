import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 读懂报错 结业（错误风暴找首因 L3）
 * 教学点：假设思维——错误风暴中找"第一块骨牌"：时间排序 + 依赖拓扑 + 传播路径验证；
 * 多数派异常不是首因，修一检全才是真修好；同源告警聚合不让 5000 条刷屏。
 * 专家路径：impact(1) + firsterror(2) + independence(1) = 4⚡︎
 */
export const firstDominoCase: DiagnosisCase = {
  id: 'first-domino',
  title: '五千条异常里，凶手只有一个',
  intro: '凌晨 10 分钟 5000 条异常刷屏：SQL 超时、NPE、下游 5xx——真正的凶手只有 1 个，其余 4999 条是涟漪。',
  domain: 'runtime',
  layer: '错误风暴找首因：时间排序 + 拓扑验证 + 修一检全',
  part: 'apprentice',
  chapterId: 'error-reading',
  order: 6,
  typeTags: ['observability', 'dependency', 'capacity'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」订单域的值班负责人，凌晨的告警群已经刷了 5000 条——这是你读报错课的期末考。',
    architecture: '订单域依赖拓扑：网关 → 订单服务 → DB + 库存服务 + 优惠券服务 ｜ 每个服务都向 ELK 吐异常',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '异常风暴（10 分钟）',
        text: 'SQL timeout（HikariPool）：3,000 条\n订单服务 NPE（优惠券字段）：1,200 条\n下游 5xx（库存/优惠券重试）：800 条\n值班按"最新异常"处理了两轮，都没止血。',
      },
      {
        type: 'text',
        title: '值班群乱局',
        text: 'DBA 说"我这边 SQL 慢查询爆发"，订单 owner 说"NPE 是优惠券返回空"，优惠券说"我收到的是 5xx 重试风暴"——三人各查各的，互相甩锅。',
      },
    ],
    timeline: '01:14 起异常风暴 ｜ 01:20 第一轮处置（重启订单服务）无效 ｜ 01:24 第二轮（重启优惠券）无效 ｜ 你 01:26 接手',
    impactHint: '5000 条异常有 3 种类型、3 个服务——按量处理？按最新处理？还是找第一块倒下的骨牌？',
  },

  hypotheses: [
    { id: 'h-firstdomino', text: '首因定位：时间排序第一条是 DB 连接获取超时（01:14:03）——其余异常全是它在依赖拓扑上的涟漪', excludeActionId: 'a-firsterror' },
    { id: 'h-majority', text: '多数派优先：SQL timeout 3000 条量最大，先修它', excludeActionId: 'a-countcheck' },
    { id: 'h-independent', text: '多根因同时爆发：不止一块骨牌，需分头处理', excludeActionId: 'a-independence' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '给 5000 条异常建"档案"：类型×时刻×服务三维分布',
      desc: '影响面：先看全景再下手',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '风暴全景',
        text: '类型分布：SQL timeout 3000 / NPE 1200 / 5xx 800\n时刻分布：全部始于 01:14:03 之后的 10 分钟\n服务分布：订单(3000+NPE1200) 库存(500) 优惠券(300)\n已知处置：重启订单/优惠券均无效（01:20/01:24）\n→ 两次无效处置是免费情报：不是"单服务状态坏了"——全网同起，指向公共层。',
      },
    },
    {
      id: 'a-firsterror',
      name: '时间倒序找第一块骨牌 + 拓扑验证传播',
      desc: '第一条异常是什么、它如何沿依赖拓扑变成 5000 条',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-firstdomino'],
      hypotheses: [{ id: 'h-firstdomino', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '首因定位 + 传播验证',
        text: '时间排序第一条：01:14:03.120 订单服务 "HikariPool-1 Connection is not available"\n（此刻其余服务零异常——涟漪尚未扩散）\n传播回放：DB 连接耗尽（慢查询占满）→ 订单查询失败 → 优惠券字段未赋值 NPE ×1200\n→ 订单 5xx → 库存/优惠券收到重试风暴 5xx\n依赖拓扑逐边核对：全部 5000 条可沿"订单→DB"这条边解释 ✓\n实锤：骨牌一 = DB 连接耗尽（慢查询占满连接池）。',
      },
    },
    {
      id: 'a-countcheck',
      name: '验证"多数派优先"的陷阱',
      desc: '量最大的 SQL timeout 也是涟漪——按量处理会先修表现',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-majority'],
      hypotheses: [{ id: 'h-majority', status: 'excluded' }],
      result: {
        type: 'text',
        title: '多数派陷阱',
        text: 'SQL timeout 3000 条量最大——但它们与首因同池（同一连接池耗尽）：\n按量处理 = 给同一块骨牌的回响加固——骨牌还在，回响换个姿势再来。\n→ 排除多数派优先：数量是"传播广度"的度量，不是"根因深度"的度量。',
      },
    },
    {
      id: 'a-independence',
      name: '验证"单根因"的完备性',
      desc: '有没有第二块骨牌——逐服务检查是否有不可归因的异常',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-independent'],
      hypotheses: [{ id: 'h-independent', status: 'excluded' }],
      result: {
        type: 'text',
        title: '完备性检查',
        text: '逐服务抽查 100 条异常回放传播路径：100% 可沿"订单→DB"解释，零例外。\n→ 排除多根因：单一骨牌成立——修复可以聚焦，资源不分散。',
      },
    },
    {
      id: 'a-danger',
      name: '按多数派优先：紧急扩容订单服务实例',
      desc: '【状态变更】订单服务扩容 10 实例稀释 NPE',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '扩容结果（陷阱动作）',
        text: 'NPE 被摊薄（单实例异常密度下降），但 10 个新实例带来 200 个新连接请求——\nDB 连接竞争雪上加霜，SQL timeout 反而恶化。\n→ 复盘点评：按多数派修 = 给回响加音箱，骨牌的声浪更大了。',
      },
    },
    {
      id: 'a-fixroot',
      name: '修复：治骨牌一——慢查询 + 池治理',
      desc: '【状态变更】kill 慢查询 + 索引修正 + 池等待上限（耗尽快速失败）',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① kill 占满连接的慢查询 + 补索引（元凶 SQL 从 11s → 80ms）\n② 池等待上限 30s→5s：耗尽时快速失败（不挂 30s 让涟漪堆积）\n涟漪消失率验证：首因修复后 3 分钟——NPE 归零、5xx 归零、SQL timeout 归零。骨牌一倒，全链安静。',
      },
    },
    {
      id: 'a-fixverify',
      name: '验证：涟漪归零确认',
      desc: '修一检全：骨牌修复后全链异常归零才算真修好',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修一检全',
        text: '修复后观察窗 15 分钟：5000 条/10min → 3 条/10min（基线波动）。\n"修一检全"是首因修复的验收标准——只看"主要异常降了"不算，要看"全部涟漪归零"。',
      },
    },
    {
      id: 'a-fixsop',
      name: '沉淀：错误风暴 SOP',
      desc: '【状态变更】值班 SOP：风暴三步——时间排序找首因 / 依赖拓扑验证传播 / 修一检全',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'SOP 三步',
        text: '① 时间排序：第一条异常 = 第一嫌疑人（多数派只是传播广度）\n② 拓扑验证：异常能否沿依赖边全部解释（完备性检查）\n③ 修一检全：修首因后验证全部涟漪归零。\n两轮无效处置（按最新/重启）在 SOP 面前不会发生。',
      },
    },
    {
      id: 'a-fixalert',
      name: '沉淀：同源告警聚合',
      desc: '【状态变更】告警平台按传播拓扑聚合成"一个事件"：首因 + 涟漪计数，拒绝 5000 条刷屏',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '告警聚合',
        text: '告警平台升级：同源异常聚合成事件卡（首因 1 条 + 涟漪 4999 条折叠计数）。\n刷屏的价值是零——聚合后的首因卡片才是值班员需要的。风暴不可怕，不可读才可怕。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-firstdomino', text: '首因 = DB 连接耗尽（慢查询占满连接池，01:14:03 第一条异常）：涟漪沿依赖拓扑传播——订单 NPE 1200、下游重试 5xx 800、SQL timeout 3000 同池回响；两次按最新/重启处置无效', correct: true },
    { id: 'rc-majority', text: '多数派（SQL timeout）优先处理（它是涟漪非首因）', correct: false },
    { id: 'rc-independent', text: '多根因同时爆发需分头处理（完备性检查排除）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '5000 条异常三种类型三个服务——先建三维档案（类型×时刻×服务），两次无效处置是免费情报。',
      update: '全网同起 + 两次单服务处置无效——排除"单服务状态坏了"，指向公共层。',
      actionId: 'a-impact',
      why: '1⚡︎ 风暴的第一课是"先看全景再下手"：三维分布与无效处置史，把假设空间从"哪个服务坏了"压缩到"哪个公共层坏了"。',
      conclusion: '排查框架确立：找首因（h-firstdomino 升权）。',
    },
    {
      thought: '时间倒序找第一条异常——它是风暴的第一张多米诺；再沿依赖拓扑验证它如何变成 5000 条。',
      update: '实锤：01:14:03 连接耗尽为骨牌一；5000 条全部沿"订单→DB"边可解释——传播路径完备。',
      actionId: 'a-firsterror',
      why: '2⚡︎ 首因定位 = 时间排序 × 拓扑验证双保险：时间给出"谁先倒"，拓扑给出"怎么传导"——两者吻合才能确认"一块骨牌"而不是"多块同时倒"。',
      conclusion: '首因实锤：DB 连接耗尽。',
    },
    {
      thought: '多数派陷阱单独验证：量最大的 SQL timeout 是涟漪不是首因——数量是广度不是深度。',
      update: '同池回响确认——按量处理 = 给回响加音箱（扩容陷阱即将演示这一点）。',
      actionId: 'a-countcheck',
      why: '1⚡︎ "按量优先"是错误风暴最直觉的陷阱：3000 条的 SQL timeout 看起来最痛——但它是同一池的回响。数量度量传播广度，不度量根因深度。',
      conclusion: '多数派排除 → 完备性检查。',
    },
    {
      thought: '单根因完备性检查 + 扩容陷阱演示 + 治骨牌 + 修一检全 + SOP + 告警聚合。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】首因（连接耗尽）✓ 传播（拓扑完备）✓ 防线（SOP+聚合）✓——首因、涟漪、防线三层闭合。',
      conclusion: '沉淀：错误风暴找首因——时间排序、拓扑验证、修一检全；5000 条里凶手只有一个，数骨牌不如找骨牌一。',
    },
  ],

  lessons: [
    {
      text: '错误风暴找首因：时间排序的第一条异常是第一嫌疑人——多数派只是传播广度，不是根因深度。',
      principle: '假设思维：风暴三步——时间排序（谁先倒）、依赖拓扑验证（怎么传导）、修一检全（修首因后全部涟漪归零）。按量优先是最直觉的陷阱：给回响加音箱，骨牌的声浪更大。',
    },
    {
      text: '单根因的完备性检查：全部异常能沿一条传播路径解释时，修复可以聚焦——零例外的拓扑回放是聚焦的许可证。',
      principle: '验证思维：确认"单骨牌"与"找骨牌"同样重要——完备性检查（逐服务抽查回放）排除多根因，让资源聚焦。若发现不可归因的异常，才升级为多骨牌分头处理。',
    },
    {
      text: '5000 条刷屏的告警没有价值：同源异常聚合成"首因 + 涟漪计数"的事件卡——风暴不可怕，不可读才可怕。',
      principle: '可观测性设计：告警的价值密度 = 事件数 / 消息数。按传播拓扑聚合（首因卡 + 折叠涟漪）让值班员看到结构而非噪声——读报错的最高境界，是平台替你把 5000 条读成 1 条。',
    },
  ],
}
