import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 接口与契约 第三批（超时预算链 L2）
 * 教学点：架构设计——超时是三方契约：client/gateway/server/下游 需要递减预算链；
 * 上游先放弃时下游要收到取消；重试是放大器要配退避。
 * 专家路径：impact(1) + timeouttable(2) + gatewaytimeout(1) = 4⚡︎
 */
export const timeoutContractCase: DiagnosisCase = {
  id: 'timeout-contract',
  title: '客户端 3 秒超时，服务端要跑 5 秒',
  intro: '库存查询客户端 3s 超时、服务端 P99 5s：每一次"超时重试"都注定失败——超时是三方契约，不是单方配置。',
  domain: 'build',
  layer: '超时是递减的预算链——每层预算要覆盖下一层的最坏情况',
  part: 'engineer',
  chapterId: 'contract',
  order: 3,
  typeTags: ['contract', 'capacity', 'architecture'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」库存服务的负责人，大促压测发现：服务端被自己的客户端"逼"出了雪崩。',
    architecture: '客户端 SDK(timeout 3s) → 网关(timeout 10s) → 库存聚合服务(P99 5s: 串行聚合 12 个下游) → 下游×12',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '大促压测现象',
        text: '聚合查询 P99 5s：客户端 3s 就放弃并立即重试——服务端还在为"已放弃"的请求继续算。\n重试请求占服务端负载 40%：同样的计算做 2.4 遍，雪上加霜。',
      },
      {
        type: 'text',
        title: '三层超时盘点',
        text: '客户端 SDK：3s（写死在封装里，"感觉 3 秒够"）\n网关：10s（默认模板）\n服务端：无内部预算（聚合要等多久算多久）',
      },
    ],
    timeline: '库存聚合上月新增 5 个下游（8→12 个），P99 从 2s 涨到 5s ｜ 客户端超时从未调整 ｜ 大促 12 天后',
    impactHint: '三个层各自"配置合理"，拼起来却互相拆台——超时的预算表，谁先放弃、放弃后下游知不知道？',
  },

  hypotheses: [
    { id: 'h-mismatch', text: '超时契约失配：client 3s < server P99 5s——慢于 3s 的服务端工作注定白做，重试放大 2.4×', excludeActionId: 'a-timeouttable' },
    { id: 'h-gateway', text: '网关 10s 超时比客户端还长：客户端断开后网关继续悬挂等下游', excludeActionId: 'a-gatewaytimeout' },
    { id: 'h-server', text: '服务端 5s 本身不合理：串行聚合可并行化', excludeActionId: 'a-p99check' },
    { id: 'h-retry', text: '重试无退避放大脉冲（retry-storm 同构）', excludeActionId: 'a-retryaudit' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '画三层超时预算表',
      desc: '影响面：client/gw/server 三个数字与失败/重试的分布',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '超时预算表（现状）',
        text: '客户端 SDK：  3s（写死）\n网关：        10s（默认模板）\n服务端聚合：  无预算（P99 5s，串行 12 下游）\n失败分布：>3s 的请求 22%——全部被客户端放弃；\n重试占服务端负载 40%，其中 92% 的重试也会失败（服务端依然 >3s）。\n→ 重试不是恢复手段，是负载放大器。',
      },
    },
    {
      id: 'a-timeouttable',
      name: '对账超时契约：谁先放弃、下游知不知道',
      desc: '预算链断裂点定位 + 取消传播检查',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-mismatch'],
      hypotheses: [{ id: 'h-mismatch', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '契约对账',
        text: '① client 3s < server P99 5s：>3s 的聚合注定白做（客户端已走）\n② 取消传播：无——客户端断开后，服务端不知情继续算 5s\n③ 重试：立即重试（无退避），同一秒内第二个请求加入队列\n实锤：超时是"三方契约"，三方各配各的 = 预算链断裂。\n正确形态：预算递减（client ≥ gw ≥ server ≥ 下游）+ 取消传播 + 重试退避。',
      },
    },
    {
      id: 'a-gatewaytimeout',
      name: '核对网关超时与悬挂连接',
      desc: '网关 10s 比客户端 3s 还长——它在等谁',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-gateway'],
      hypotheses: [{ id: 'h-gateway', status: 'down' }],
      result: {
        type: 'text',
        title: '网关核对',
        text: '客户端 3s 断开后，网关继续等下游最长 10s——悬挂连接占满网关连接池（高峰等待）。\n→ 确认为次因：网关超时应短于客户端（先放弃的是它），10s 的默认值让它在客户端之后才放弃。',
      },
    },
    {
      id: 'a-p99check',
      name: '审计服务端聚合的并行化空间',
      desc: '5s 里有多少是"串行白等"',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-server'],
      hypotheses: [{ id: 'h-server', status: 'down' }],
      result: {
        type: 'text',
        title: '聚合解剖',
        text: '12 个下游串行调用：5s；其中 8 个互不依赖可并行 → 理论 P99 2.5s。\n→ 降权为优化项：并行化把 P99 压回 3s 预算内——它是"让契约成立"的手段之一，与预算重排配合。',
      },
    },
    {
      id: 'a-retryaudit',
      name: '审计重试策略',
      desc: '退避与上限',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-retry'],
      hypotheses: [{ id: 'h-retry', status: 'down' }],
      result: {
        type: 'text',
        title: '重试审计',
        text: '立即重试、无退避、无上限次数——retry-storm 的同构缺陷（第 12 章教训）。\n→ 列入整改：指数退避 + 抖动 + 最多 1 次。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急把客户端超时调到 10s 对齐',
      desc: '【状态变更】客户端 3s → 10s',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '对齐结果（陷阱动作）',
        text: '重试消失（不再超时）——但用户前端要等 10s 才有响应：\n"修复了服务端指标，炸了用户体验"——超时预算从体验端爆掉。\n→ 复盘点评：对齐的方向错了——预算应该从用户体验倒推（8s），逐层向内收紧。',
      },
    },
    {
      id: 'a-fixbudget',
      name: '修复：超时预算链重排',
      desc: '【状态变更】client 8s / gw 6s / server 预算 5s 内并行化压到 2.5s / 下游各 1s——递减链成立',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '预算链 v2',
        text: '从用户体验倒推：用户可接受 8s →\nclient 8s ≥ gw 6s ≥ server 5s ≥ 单下游 1s（每层预算 ≥ 内层最坏情况）。\n聚合并行化：8 个独立下游并行 → P99 5s → 2.5s（预算内）。\n压测回归：重试占比 40% → 3%，服务端负载减半，P99 2.4s 稳定。',
      },
    },
    {
      id: 'a-fixcancel',
      name: '沉淀：取消传播',
      desc: '【状态变更】客户端断开 → 网关感知 → 向服务端发 cancel → 聚合中断（省 40% 白做）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '取消传播',
        text: '网关对客户端断开事件传播 cancel（HTTP abort 信号），服务端聚合监听取消立即中断。\n→ "上游放弃"这件事本身要成为契约的一部分——不知道被放弃的计算，是纯浪费。',
      },
    },
    {
      id: 'a-fixregistry',
      name: '沉淀：超时登记表 + 递减断言',
      desc: '【状态变更】每条链路 client/gw/server/下游 四值登记；递减断言进 CI',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '登记表',
        text: '库存链路：8s/6s/5s/1s ✓ 递减断言通过。\n新链路接入必填四值——超时从"各配各的"变成"一张表上的预算链"。',
      },
    },
    {
      id: 'a-fixbackoff',
      name: '沉淀：重试退避规范',
      desc: '【状态变更】指数退避 + 抖动 + 上限 1 次——复用第 12 章 retry-storm 教训',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '退避规范',
        text: '重试三原则：指数退避（200ms→400ms→…）+ 抖动（防齐步走）+ 次数上限。\n重试的定位回归本职：兜底瞬态故障，而不是放大持续过载。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-mismatch', text: '超时契约失配：client 3s < server P99 5s（聚合 12 下游串行）——慢于 3s 的工作注定白做，立即重试无取消传播，负载放大 2.4×；网关 10s 悬挂连接为次因', correct: true },
    { id: 'rc-gateway', text: '网关 10s 超时比客户端长，悬挂连接占池（次因）', correct: false },
    { id: 'rc-server', text: '服务端串行聚合可并行化（优化项非根因）', correct: false },
    { id: 'rc-retry', text: '重试无退避放大脉冲（次因）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '三个层各自"配置合理"却互相拆台——先画超时预算表：三个数字放一张桌子上。',
      update: 'client 3s < server P99 5s + 重试占负载 40% + 重试再失败 92%——放大器机制可见。',
      actionId: 'a-impact',
      why: '1⚡︎ 预算表把三个"单看合理"的数字放在一起——契约问题只有对表才能看见：单点审查永远发现不了"组合错误"。',
      conclusion: '嫌疑锁定：契约失配（h-mismatch 升权）。',
    },
    {
      thought: '契约对账三问：谁先放弃？放弃后下游知道吗？重试怎么发？',
      update: '实锤：client 先放弃、无取消传播、立即重试——预算链断裂 + 浪费机制完整。',
      actionId: 'a-timeouttable',
      why: '2⚡︎ 契约对账的三问是本关核心：超时的正确形态是"递减预算 + 取消传播 + 退避重试"三位一体——缺任何一位，其他两位都会变成放大器。',
      conclusion: '根因实锤：预算链断裂。',
    },
    {
      thought: '网关 10s 与聚合并行化空间单独定权——它们是次因与优化项，防止修复方案发散。',
      update: '网关悬挂确认（次因）、聚合可并行化（优化项 P99 5→2.5s）——定权后修复清单各就各位。',
      actionId: 'a-gatewaytimeout',
      why: '1⚡︎ 定权的价值：并行化很诱人但不解决契约问题——只有配合预算重排才成立。区分"根因/次因/优化项"让修复不贪多。',
      conclusion: '定权完成 → 预算重排。',
    },
    {
      thought: '重试审计收尾——退避规范的缺失是放大器的燃料。止血陷阱（对齐到 10s）点评后进入预算重排。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】断裂（client<server）✓ 放大（无取消+无退避）✓ 防线（登记表+递减断言）✓——机制、放大、防线三层闭合。',
      conclusion: '沉淀：超时是递减的预算链——从用户体验倒推逐层收紧，取消传播让放弃被知晓，退避让重试只兜底不放大。',
    },
  ],

  lessons: [
    {
      text: '超时是三方契约：client/gateway/server/下游 的预算必须递减——每层预算要覆盖内层最坏情况，否则"各配各的"就是互相拆台。',
      principle: '架构设计：超时预算表（每条链路四值）+ 递减断言进 CI。预算从用户体验倒推（8s → 6s → 5s → 1s），而不是从"单点感觉"出发——单点合理的数字组合起来可以是灾难。',
    },
    {
      text: '上游放弃时下游要被告知：没有取消传播的架构里，每个被放弃的请求都在白算——重试把它变成双倍白算。',
      principle: '程序设计：取消传播（abort 信号沿调用链传递）与超时同权——"上游已放弃"本身是契约的一部分。聚合类服务必须响应取消中断计算，否则重试的每一秒都在加倍浪费。',
    },
    {
      text: '对齐超时的方向从用户体验倒推：把 client 调到 10s "对齐服务端"，是修好指标炸掉体验——预算链的锚点在用户。',
      principle: '产品思维：超时预算的第一约束是"用户可接受多久"，不是"服务端需要多久"。服务端 P99 超预算时的正解是向内优化（并行化），而不是向外要时间——向外要的每一秒都是用户的耐心。',
    },
  ],
}
