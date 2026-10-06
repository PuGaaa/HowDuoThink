import { DiagnosisCase } from '../../types/case'

/**
 * 第 12 章 · 架构演进 第二批（分布式单体 L3）
 * 教学点：架构设计——拆分的收益是独立部署/伸缩/故障域，代价是每一次远程调用；
 * 按团队边界而非领域边界拆分 = 分布式单体；非关键服务混进同步链路 = 故障传染面 = 全链路。
 * 专家路径：impact(1) + tracewalk(2) + rttstat(1) = 4⚡︎
 */
export const distributedMonolithCase: DiagnosisCase = {
  id: 'distributed-monolith',
  title: '微服务化一年，下单慢了九倍',
  intro: '微服务化一年，下单 P99 从 200ms 涨到 1.9s：一次下单串行穿过 9 个服务——"分布式单体"成型了。',
  domain: 'runtime',
  layer: '拆分的收益是独立故障域，代价是每一次远程调用——按团队拆不按领域拆，两头都拿不到',
  part: 'master',
  chapterId: 'evolution',
  order: 5,
  typeTags: ['architecture', 'capacity', 'process'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」的架构委员会成员，微服务化一周年的成果复盘会开成了事故分析会。',
    architecture: '下单 → 网关 → 用户 → 商品 → 库存 → 优惠 → 风控 → 支付 → 订单 → 通知/积分/推荐/归集…（14 跳，9 跳串行）',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '全链路 trace 解剖',
        text: '一次下单 14 次远程调用，其中 9 次串行；链路总耗时 1.72s（微服务化前 190ms）。\n任一环节 +100ms，全链路 +100ms——纯粹的串行叠加。',
      },
      {
        type: 'text',
        title: '上月故障回放',
        text: '积分服务（业内公认的"非关键路径"）抖动 12 分钟 → 下单整体超时 12 分钟。\n"非关键"的服务，在同步链路上事实上成了"关键"。',
      },
    ],
    timeline: '微服务化一年：6 个服务拆到 38 个 ｜ RT 翻 9 倍发生在两次"继续拆分"之后 ｜ 大促前 25 天',
    impactHint: '拆分带来了独立部署，也把"一次调用"拆成"十四次排队"——哪些跳是必要的，哪些只是"顺手拆的"？',
  },

  hypotheses: [
    { id: 'h-serial', text: '拆分过细 + 串行编排：非必要服务被串进同步链路，RT 叠加且故障传染', excludeActionId: 'a-tracewalk' },
    { id: 'h-network', text: '内网网络劣化，跨服务 RTT 上涨', excludeActionId: 'a-rttstat' },
    { id: 'h-chatty', text: '服务接口粒度过细：每跳只给一小块数据，单跳内部要多次往返', excludeActionId: 'a-callcount' },
    { id: 'h-data', text: '拆分后跨库 join 变 RPC，各服务 DB 查询变慢', excludeActionId: 'a-dbtrace' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '解剖一次下单的完整 trace',
      desc: '影响面：14 跳各占多少耗时、哪些串行哪些并行',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: 'trace 解剖（下单 P99 样本）',
        text: '串行链：网关→用户(45ms)→商品(120ms)→库存(230ms)→优惠(180ms)→风控(260ms)\n        →支付(310ms)→订单(190ms)→积分(140ms)→推荐预热(210ms)→归集回执(180ms)…\n串行合计 1.72s；并行分支仅 2 段。\n耗时前三：支付(310)/风控(260)/推荐预热(210)——推荐预热？下单要等推荐？！',
      },
    },
    {
      id: 'a-tracewalk',
      name: '逐跳审计"存在理由"',
      desc: '每一跳：领域必要，还是拆分惯性',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-serial'],
      hypotheses: [{ id: 'h-serial', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '逐跳审计',
        text: '9 跳领域必要（下单语义必需）：用户/商品/库存/优惠/风控/支付/订单等。\n5 跳拆分惯性：推荐预热（该异步）、积分实时查询（可事后入账）、归集回执（纯通知）、\n营销缓存刷新（下单根本不需要等它）、日志归集 ACK（监控需要但无需阻塞业务）。\n拆分依据考古：当年按"团队组织"拆——每个小组要一个服务，而非按领域边界。\n实锤：分布式单体——服务边界是团队图，调用关系还是"一个程序"。',
      },
    },
    {
      id: 'a-faildrill',
      name: '故障传染演练：注入非关键服务延迟',
      desc: '验证"非关键"服务事实上多关键',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '混沌演练结果',
        text: '注入积分服务 +500ms → 下单 P99 +520ms（1:1 传导）\n注入积分服务不可用 → 下单失败率 31%（积分查询在同步链路上抛错未被降级）\n→ "非关键"服务的关键性 = 它在同步链路上的位置。拆分给了独立部署，没给独立故障域。',
      },
    },
    {
      id: 'a-rttstat',
      name: '核对内网 RTT 趋势',
      desc: '排除网络劣化',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-network'],
      hypotheses: [{ id: 'h-network', status: 'excluded' }],
      result: {
        type: 'text',
        title: '网络核对',
        text: '内网 RTT 稳定 0.8ms，一年无劣化。\n→ 排除网络：1.72s 是 14 次调用的叠加，不是每次调用变慢。',
      },
    },
    {
      id: 'a-callcount',
      name: '统计单跳内部的往返次数',
      desc: '评估接口粒度',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-chatty'],
      hypotheses: [{ id: 'h-chatty', status: 'down' }],
      result: {
        type: 'text',
        title: '粒度评估',
        text: '单跳内部平均 1.2 次 RPC——单跳不算 chatty。\n但"每跳只给一小块数据"的接口设计让"跳数"本身膨胀（本来 2 次聚合调用的活拆成 5 跳）。\n→ 降权并入主因：粒度问题的本质还是"跳数"，归入拆分过细一并治理。',
      },
    },
    {
      id: 'a-dbtrace',
      name: '核对各服务 DB 耗时',
      desc: '排除数据库层劣化',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-data'],
      hypotheses: [{ id: 'h-data', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'DB 核对',
        text: '各服务 SQL P99 稳定（10~30ms）；跨库 join 确实改成了 RPC，但慢在"跳数多"不在"单跳慢"。\n→ 排除 DB 层。',
      },
    },
    {
      id: 'a-danger',
      name: '大促前紧急合并 5 个惯性拆分服务',
      desc: '【状态变更】代码级合并部署回订单域（跳数 14→9）',
      cost: 3,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '紧急合并结果',
        text: '链路缩到 9 跳，RT 回落至 1.1s——赶在大促前稳住。\n代价：两个团队的代码仓与发布节奏被强行合并，CI 权限与 oncall 归属一片混乱。\n→ 复盘点评：架构合并也是变更——组织成本没算清就动刀，是另一种"拆分惯性"。',
      },
    },
    {
      id: 'a-fixasync',
      name: '修复：非关键 3 跳改异步事件',
      desc: '【状态变更】积分/通知/归集移出同步链路，事件化投递',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '异步化结果',
        text: '积分入账、通知发送、日志归集改事件投递（下单后异步执行，失败走重试+对账）。\n同步链路 9 跳 → 6 跳，P99 回落到 640ms。\n关键验证：积分服务故障注入 → 下单成功率 100% 不受影响——独立故障域第一次真正成立。',
      },
    },
    {
      id: 'a-fixrt',
      name: '沉淀：链路预算制度',
      desc: '【状态变更】每跳 RT 预算 + 同步跳数上限（下单 ≤ 8）+ 新增同步依赖过架构评审',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '预算制度',
        text: '下单链路预算表：同步跳数 ≤ 8，单跳 P99 ≤ 120ms，链路总预算 ≤ 800ms。\n新增同步依赖必须声明"跳预算从哪扣"——预算花完了就要异步化或合并，不许透支下一跳。',
      },
    },
    {
      id: 'a-fixorg',
      name: '沉淀：拆分三问进架构评审',
      desc: '【状态变更】拆分三问：独立部署？独立伸缩？独立故障域？——三问不过不拆',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '拆分三问',
        text: '新服务立项必答：① 发布节奏与谁不同？② 容量伸缩曲线与谁不同？③ 故障域是否必须隔离？\n三问全"否"= 拆分惯性，不批。\n写在评审单第一页：服务边界跟领域走，不跟组织架构图走——组织图一个月一变，领域十年不变。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-serial', text: '按团队边界而非领域边界拆分（38 服务）：非关键服务串进同步链路（9 跳串行 1.72s）且无降级——独立部署没换来独立故障域，分布式单体成型：RT 翻 9 倍 + 故障传染全链路', correct: true },
    { id: 'rc-network', text: '内网网络劣化导致跨服务调用变慢', correct: false },
    { id: 'rc-chatty', text: '接口粒度过细导致单跳多次往返（并入跳数问题）', correct: false },
    { id: 'rc-data', text: '拆分后跨库 join 变 RPC 使 DB 查询变慢', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: 'RT 翻 9 倍——先解剖一条完整 trace：14 跳各占多少，串行几跳。',
      update: '9 跳串行 1.72s，纯叠加；耗时前三里赫然有"推荐预热"——下单在等推荐？',
      actionId: 'a-impact',
      why: '1⚡︎ trace 解剖把"慢"分解到跳：总耗时翻倍可以是一跳变慢（查那一跳），也可以是跳数翻倍（查拆分）——分解结果直接指向后者。',
      conclusion: '嫌疑锁定：串行跳数过多（h-serial 升权）。',
    },
    {
      thought: '逐跳审"存在理由"：每一跳是领域必要，还是拆分惯性——这决定了砍哪些跳。',
      update: '实锤：5 跳惯性（推荐预热/积分实时/归集回执/缓存刷新/日志 ACK）；拆分依据是团队组织图。',
      actionId: 'a-tracewalk',
      why: '2⚡︎ 逐跳审计是架构思维的核心动作：把每一跳放回"领域必要性"的秤上——按团队拆的服务，调用关系天然长成分布式单体，这个结构性判断比任何单点优化都值钱。',
      conclusion: '根因实锤：拆分哲学错了，跳数是它的账单。',
    },
    {
      thought: '用混沌演练量化"非关键"的真实关键性——架构判断要用数据盖章。',
      update: '积分 +500ms → P99 +520ms（1:1 传导）；积分挂 → 下单失败 31%——"非关键"是伪称谓。',
      actionId: 'a-faildrill',
      why: '1⚡︎ 演练把架构论断变成可复现的数据：故障域独立是拆分的核心承诺——1:1 传导证明承诺落空，修复的验收标准（积分挂下单不影响）也随之产出。',
      conclusion: '传染面量化完毕 → 修复以"独立故障域"为纲。',
    },
    {
      thought: '网络/DB 用 1⚡︎ 快排；粒度问题单独评估后降权并入主因——分层归因但不重复记账。',
      update: 'RTT 稳定、DB 正常；chatty 的本质是跳数——并入拆分过细治理。',
      actionId: 'a-rttstat',
      why: '1⚡︎ 归因要避免"多重原因平摊"的混沌叙事：粒度、跳数、编排都是"拆分哲学"的不同账单——合并成一个根因，修复才有一致的纲。',
      conclusion: '嫌疑收敛：拆分哲学 → 三层修复。',
    },
    {
      thought: '止血（紧急合并）、修复（异步化砍同步跳）、制度（链路预算+拆分三问）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】结构（分布式单体）✓ 量化（1:1 传染）✓ 制度（预算+三问）✓——现状、修复、防复发三层闭合，且兼顾大促窗口。',
      conclusion: '沉淀：微服务的收益是独立故障域，不是服务数量。拆分三问不过不拆——组织图一个月一变，领域十年不变，边界要跟后者。',
    },
  ],

  lessons: [
    {
      text: '微服务的收益是独立故障域，不是服务数量：按团队边界拆分得到的往往是"分布式单体"——部署独立了，调用关系还是一整块。',
      principle: '架构设计：拆分三问（独立部署？独立伸缩？独立故障域？）不过不拆。服务边界跟领域走不跟组织走；接口粒度过细本质是跳数膨胀，与拆分过细是同一张账单。',
    },
    {
      text: '"非关键服务"的关键性由它在同步链路上的位置决定：只要串在主链路上，积分慢下单就慢，积分挂下单就挂。',
      principle: '链路设计：同步链路是故障传染的导管——非关键依赖一律异步化（事件投递+重试对账），或做明确的降级（查不到就跳过）。链路预算制度（跳数上限+单跳 RT 上限）让新增同步依赖从"顺手"变成"显式扣预算"。',
    },
    {
      text: '架构判断要用演练盖章："非关键"是伪称谓直到混沌注入证明 1:1 传导不存在——独立故障域是承诺，演练是验收。',
      principle: '验证思维：架构属性（隔离性/降级有效性）无法靠 code review 确认，只能靠故障注入演练确认。演练同时产出修复的验收标准——"积分挂，下单成功率不受影响"就是可执行的验收线。',
    },
  ],
}
