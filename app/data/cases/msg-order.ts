import { DiagnosisCase } from '../../types/case'

/**
 * 第 5 章 · 并发迷宫（消息错序 L2）
 * 教学点：至少一次投递必然带来重复与乱序；覆盖写没有版本校验 = 旧数据可以覆盖新数据；
 * 扩容消费者时最容易丢掉"顺序键"。
 * 专家路径：impact(1) + apiread(1) + msgtrace(2) + codepush(2) = 6⚡︎
 */
export const msgOrderCase: DiagnosisCase = {
  id: 'msg-order',
  title: '已送达的订单跳回"配送中"',
  intro: '客服反馈：订单明明已经送达，App 上的状态却跳回"配送中"，几分钟后又自己变回"已送达"。全天零星出现十几单。',
  domain: 'concurrency',
  layer: '顺序是隐藏的维度：至少一次投递 + 覆盖写 = 旧数据随时可以覆盖新数据',
  part: 'master',
  chapterId: 'concurrency',
  order: 3,
  typeTags: ['race', 'timing'],
  difficulty: 2,

  scene: {
    role: '你是交易平台推送服务的负责人，客服把一批"状态回退"的工单转给了你。',
    architecture: '订单服务 → MQ(状态变更事件, 至少一次投递) → 推送服务 → Redis(最新状态) → App 轮询展示',
    symptoms: [
      {
        type: 'error',
        title: '用户工单（摘录）',
        text: '12:01 显示"已送达"，12:03 跳回"配送中"，12:06 又变回"已送达"。\n没有操作，自己变的。今日同类工单 14 单。',
      },
      {
        type: 'text',
        title: '服务侧监控',
        text: '推送服务无报错；Redis 写入全部成功；\n订单库里的状态机流转记录正确且从未回退。',
      },
    ],
    timeline: '回退集中在状态快速流转的订单 ｜ 上周推送服务从单消费者扩到 8 个并发消费者（提升吞吐）',
    impactHint: '"几分钟后又自己变回来"——说明新数据一直都在，是有谁在某个时刻用旧数据覆盖了它。',
  },

  hypotheses: [
    { id: 'h-order', text: 'MQ 消息乱序：旧状态事件晚到，覆盖了新状态', excludeActionId: 'a-msgtrace' },
    { id: 'h-app', text: 'App 端缓存了旧状态，是展示层的问题', excludeActionId: 'a-apiread' },
    { id: 'h-redis', text: 'Redis 写入丢失或被其他服务覆盖', excludeActionId: 'a-redislog' },
    { id: 'h-statebug', text: '订单服务状态机流转错误，状态真的回退了', excludeActionId: 'a-orderstate' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定回退订单的共性',
      desc: '什么样的订单会回退；杀掉 App 重进后状态对不对',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [{ id: 'h-statebug', status: 'down' }],
      result: {
        type: 'text',
        title: '共性分析',
        text: '14 单全部是"1 分钟内经历 ≥2 次状态变更"的快单（拣货→配送→送达只隔几十秒）。\n用户杀掉 App 重进后状态全部正确。\n→ 最终数据是好的，问题出在"某个时刻展示成了旧值"。',
      },
    },
    {
      id: 'a-apiread',
      name: '抓 App 轮询接口的返回值',
      desc: '跳回"配送中"的时刻，服务端返回的到底是什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-app'],
      hypotheses: [{ id: 'h-app', status: 'excluded' }],
      result: {
        type: 'log',
        title: '网关访问日志（问题时刻）',
        text: 'GET /order/8899/status → 200 {"status": "shipping"}  12:03:11\n→ 服务端那一刻返回的就是"配送中"：不是 App 缓存，是源头（Redis）里就是旧值。',
      },
    },
    {
      id: 'a-msgtrace',
      name: '按订单号查 MQ 消息轨迹',
      desc: '同一订单的状态事件，发出与消费的先后顺序',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-order'],
      hypotheses: [{ id: 'h-order', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '消息轨迹（订单 8899）',
        text: '12:00:58  produce shipped   → queue-3  消费成功 12:00:59\n12:00:59  produce delivered → queue-7  消费成功 12:01:00\n12:00:57  produce shipping  → queue-3  首次消费超时失败\n          ↳ 重试 2 次后 12:03:05 消费成功 ← 旧状态晚到 2 分钟\n→ 同一订单的消息落在不同队列，失败重试进一步打乱顺序。',
      },
    },
    {
      id: 'a-orderstate',
      name: '查订单库状态机流转记录',
      desc: '确认源头状态是否真的回退过',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-statebug'],
      hypotheses: [{ id: 'h-statebug', status: 'excluded' }],
      result: {
        type: 'text',
        title: '状态机流水',
        text: '订单 8899：pending → shipping(12:00:57) → shipped(12:00:58) → delivered(12:00:59)。\n单调前进，从未回退——源头没有问题。',
      },
    },
    {
      id: 'a-redislog',
      name: '查 Redis 状态写入历史',
      desc: '是写丢了，还是按错误的顺序写成功了',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-redis'],
      hypotheses: [{ id: 'h-redis', status: 'excluded' }],
      result: {
        type: 'log',
        title: 'Redis 写入审计',
        text: '12:00:59 SET o:8899 shipping   (消费重试)\n12:01:00 SET o:8899 delivered\n12:03:05 SET o:8899 shipping   ← 又写了一次"配送中"\n→ 没有丢写，写入全部成功——问题是最后一次写入是旧状态。',
      },
    },
    {
      id: 'a-consumerlog',
      name: '查消费者失败与重试日志',
      desc: '消费为什么会失败重试、重试间隔多久',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-order'],
      hypotheses: [{ id: 'h-order', status: 'up' }],
      result: {
        type: 'text',
        title: '消费失败日志',
        text: '12:00:58 推送服务处理 shipping 消息超时（下游通知接口限流），MQ 按重试策略延迟重投。\n→ 至少一次投递下，"失败重试"是设计行为不是异常——乱序因此必然存在。',
      },
    },
    {
      id: 'a-partition',
      name: '查 MQ 队列路由规则',
      desc: '同一订单的消息是否落在同一队列',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-order'],
      hypotheses: [{ id: 'h-order', status: 'up' }],
      result: {
        type: 'text',
        title: '路由配置',
        text: '扩容时新增的 8 个队列采用轮询路由——同一订单的消息被分散到不同队列，队列间无顺序保障。\n→ 扩容改了吞吐，也悄悄丢掉了"按订单哈希保序"的顺序键。',
      },
    },
    {
      id: 'a-codepush',
      name: '读推送服务的消费代码',
      desc: '收到消息后是怎么写状态的',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-order'],
      hypotheses: [{ id: 'h-order', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'push-worker.js（消费逻辑）',
        text: 'async function consume(msg) {\n  await redis.set(`o:${msg.orderId}`, msg.status)   // ← 覆盖写\n  await notify(msg)\n}\n// 没有 compare-and-set，没有状态版本号：\n// 任何晚到的旧消息都会把新状态打回去',
      },
    },
    {
      id: 'a-repush',
      name: '让客服触发"重新推送"',
      desc: '用最新状态重发一次消息，看能否恢复',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重推结果',
        text: '重推后状态立即恢复"已送达"——最新事件还在 MQ 轨迹里，重放即可修复。\n→ 这验证了数据可自愈，但也说明下一次快速流转还会复发。',
      },
    },
    {
      id: 'a-fixseq',
      name: '上保序与版本校验修复',
      desc: '【状态变更】按订单号哈希路由 + 状态版本号只前进不后退，灰度发布',
      cost: 6,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '三件套：① 路由键改回 orderId 哈希，同一订单固定进同一队列；\n② Redis 写入带版本号（状态机序），旧版本写入直接丢弃；\n③ 消费失败进独立重试队列，不阻塞主队列。\n灰度 7 天：零回退工单，吞吐保持扩容后水平。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-order', text: '扩容改轮询路由丢了顺序键 + 失败重试打乱时序 + 覆盖写无版本校验——旧状态消息晚到后把新状态打了回去', correct: true },
    { id: 'rc-app', text: 'App 端缓存了旧状态未刷新', correct: false },
    { id: 'rc-redis', text: 'Redis 写入丢失，导致读到旧值', correct: false },
    { id: 'rc-statebug', text: '订单服务状态机错误，状态真的回退了', correct: false },
  ],

  expertCost: 6,
  restartActionId: 'a-fixseq',

  expertChain: [
    {
      thought: '"自己变回来"说明新数据没丢，只是某个时刻被旧值顶替了。先找出回退订单的共性。',
      update: '全部是状态快速流转的订单，且重进 App 后正确 → 指向推送链路的时序问题。',
      actionId: 'a-impact',
      why: '1⚡︎ 共性分析把 14 个个案收束成一个模式："快速流转 + 最终自愈"直接指向乱序覆盖，而不是数据错误。',
      conclusion: '问题在推送链路时序 → 验证服务端那一刻返回了什么。',
    },
    {
      thought: '先切割展示层：抓问题时刻的接口返回，判断是 App 缓存还是服务端旧值。',
      update: '服务端返回的就是"配送中" → App 假设排除，旧值在 Redis 里。',
      actionId: 'a-apiread',
      why: '1⚡︎ 一条访问日志就能把"展示层"从排查面上切掉——分层排除比到处翻代码便宜得多。',
      conclusion: '旧值来自 Redis → 查它是怎么被写旧的。',
    },
    {
      thought: '消息轨迹能看到同一订单每条事件的发出、落队、消费时间——乱序判断的决定性证据。',
      update: '实锤：shipping 消息消费失败重试，晚到 2 分钟覆盖了已写入的 delivered。',
      actionId: 'a-msgtrace',
      why: '2⚡︎ 轨迹把"乱序"从猜测变成时间线实锤：同订单消息分散在不同队列 + 重试晚到，两个机制一次看清。',
      conclusion: '乱序覆盖实锤 → 确认源头状态没问题、Redis 写入审计补充完整链条。',
    },
    {
      thought: '看消费代码：为什么晚到的旧消息能写进去？写入逻辑有没有顺序防御。',
      update: '裸覆盖写，无版本号无比较——任何旧消息都能把状态打回去。机制完全闭环。',
      actionId: 'a-codepush',
      why: '2⚡︎ 消息乱序是常态（至少一次投递的设计行为），真正决定故障是否发生的是消费端有没有顺序防御——代码是修复方案的直接依据。',
      conclusion: '机制闭环：无序投递 × 无防御覆盖写 = 状态回退。修复两端一起做。',
    },
    {
      thought: '证据闭合：轨迹实锤乱序 + 审计确认写入顺序 + 代码确认无防御。停止收集。',
      update: '停止。修复三件套：orderId 哈希保序 + 版本号只进不退 + 失败进重试队列。',
      actionId: '',
      why: '根因与两端修复方案都已明确；App/Redis/状态机均已排除，继续收集不改变行动。',
      conclusion: '修复上线 7 天零回退。检查单：覆盖写必须有版本或状态机校验；MQ 扩容必须重审顺序键。',
    },
  ],

  lessons: [
    {
      text: '至少一次投递必然带来重复与乱序——重试是 MQ 的设计行为，不是异常。',
      principle: '分布式消息的投递语义里，"至少一次"是默认选择，代价就是重复和乱序必然发生。消费端的问题不是"怎么避免乱序"，而是"乱序到达时我能不能扛住"。',
    },
    {
      text: '覆盖写没有版本校验 = 旧数据随时可以覆盖新数据，MQ 只是押送者，代码才是判决书。',
      principle: '任何"后到优先"的写入逻辑，在乱序投递下都会被旧消息打回。状态类数据写入必须带版本号/状态机校验（只前进不后退），或用 compare-and-set。',
    },
    {
      text: 'MQ 扩容时最容易丢的不是消息，是顺序键：轮询路由让同一实体的消息散落各队列。',
      principle: '"按实体哈希到同一队列/分区"是保序的前提。改路由策略、加消费者、换队列模型之前，必须先问：这个主题上有没有消费顺序依赖？',
    },
    {
      text: '"杀掉重进就好了"是重要线索：最终状态正确说明数据没坏，是时序出了问题。',
      principle: '最终一致性问题（重进/重放后自愈）与数据损坏问题的排查方向完全不同。用户侧的"自愈"观察，往往一步就能把排查面砍掉一半。',
    },
  ],
}
