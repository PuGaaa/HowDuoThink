import { DiagnosisCase } from '../../types/case'

/**
 * 第 13 章 · 消息与异步（重复消费 L2）
 * 教学点：MQ 的 at-least-once 语义意味着重复是常态；幂等不是 MQ 的责任，是消费者的责任。
 * 专家路径：impact(1) + logcheck(1) + redeliver(2) = 4⚡︎
 */
export const mqDuplicateCase: DiagnosisCase = {
  id: 'mq-duplicate',
  title: '同一条消息被消费了三次',
  intro: '用户一单 99 元的订单，收到三条"扣款成功"短信；财务对账发现同一笔支付被记了三笔流水。',
  domain: 'runtime',
  layer: 'at-least-once 语义下，重复不是异常，是常态',
  part: 'master',
  chapterId: 'messaging',
  order: 2,
  typeTags: ['messaging', 'idempotency'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」票务平台的订单服务后端，负责订单消息的消费链路。',
    architecture: '支付服务 → MQ(订单消息) → 订单消费者(创建订单/发短信/记流水) → 财务系统',
    symptoms: [
      {
        type: 'error',
        title: '财务对账告警',
        text: '同一笔支付单号 P20260929001 在 11:02:11、11:02:19、11:02:47 被记了三笔流水，金额完全相同。',
      },
      {
        type: 'text',
        title: '用户反馈',
        text: '一个订单收到三条一模一样的"扣款成功"短信——用户以为被重复扣款，已经在投诉。',
      },
    ],
    timeline: '今天 11 点起集中出现 ｜ 上午 10:30 消费者实例曾因内存不足重启过一次 ｜ 消费代码三个月未变更',
    impactHint: '重复的是"消息"还是"副作用"？短信和流水都是消息引发的动作——哪个环节在放大？',
  },

  hypotheses: [
    { id: 'h-redeliver', text: '消费者处理成功但 ack 失败/超时，Broker 认为未消费成功而重发', excludeActionId: 'a-redeliver' },
    { id: 'h-publish', text: '生产者发送重复：支付服务因超时重试，同一条消息被发了多次', excludeActionId: 'a-publish' },
    { id: 'h-broadcast', text: '队列配置变更后变成广播/多消费者模式，消息被多个实例各消费一次', excludeActionId: 'a-topology' },
    { id: 'h-userbug', text: '用户重复点击支付按钮，本来就发起了三笔支付', excludeActionId: 'a-paylog' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定重复的范围与模式',
      desc: '影响面：哪些订单重复、重复几次、时间分布',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '重复模式统计',
        text: '受影响订单：10:30（消费者重启）之后的订单，约 4% 出现重复。\n重复次数：绝大多数 2 次，少数 3 次。\n时间分布：11:02:11 / 11:02:19 / 11:02:47——间隔 8s 和 28s，不是毫秒级连发。\n→ 有明显时间间隔的重复 + 与消费者重启时间吻合 → 指向消费侧重发，不是用户连点。',
      },
    },
    {
      id: 'a-paylog',
      name: '查支付服务的发起记录',
      desc: '排除用户重复支付',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-userbug'],
      hypotheses: [{ id: 'h-userbug', status: 'excluded' }],
      result: {
        type: 'text',
        title: '支付发起记录',
        text: '订单 P20260929001 在支付服务只有一次支付请求（11:01:58，带防重令牌）。\n→ 排除用户重复点击：支付只发生了一次。',
      },
    },
    {
      id: 'a-publish',
      name: '查生产者的发送与重试日志',
      desc: '排除生产者发送重复',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-publish'],
      hypotheses: [{ id: 'h-publish', status: 'excluded' }],
      result: {
        type: 'text',
        title: '生产者发送日志',
        text: '支付服务 11:02:09 只 publish 了一次，无重试记录。\n但注意：发送时未开启 confirm，也没有设置 messageId 幂等键——\n生产者"只发一次"不能证明 Broker "只投一次"。',
      },
    },
    {
      id: 'a-topology',
      name: '检查队列拓扑与消费者组',
      desc: '是否变成广播模式或多个消费者组',
      cost: 2,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-broadcast'],
      hypotheses: [{ id: 'h-broadcast', status: 'excluded' }],
      result: {
        type: 'text',
        title: '队列拓扑',
        text: '队列仍是工作队列模式（非广播），消费者组只有一个，实例 2 个。\n→ 排除拓扑问题：同一条消息只会投给其中一个实例。',
      },
    },
    {
      id: 'a-logcheck',
      name: '对比消费者处理日志与 ack 日志',
      desc: '消息是"处理了没 ack"还是"没处理就重复投递"',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-redeliver'],
      hypotheses: [{ id: 'h-redeliver', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '消费日志 vs ack 日志',
        text: '11:02:11  收到 msg#8899 → 创建订单 → 记流水 → 发短信 ✓（耗时 6.2s）\n11:02:17  ack 确认……超时未收到 Broker 应答（网络抖动）\n11:02:19  Broker 重发 msg#8899 → 消费者再次全量执行\n11:02:47  第三次重发（重试退避）→ 再次全量执行\n→ 处理成功但 ack 丢失：Broker 视为未消费，at-least-once 重发。消息体里没有幂等键，三次都被当成"新订单"。',
      },
    },
    {
      id: 'a-redeliver',
      name: '查 Broker 的重发/redeliver 标记',
      desc: '确认 Broker 侧的投递计数',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-redeliver'],
      hypotheses: [{ id: 'h-redeliver', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'Broker 投递记录',
        text: 'msg#8899 投递记录：deliver#1(11:02:11, ack timeout) → redeliver#2(11:02:19) → redeliver#3(11:02:47)。\nredelivered 标记为 true，但消费者代码从不检查它，也无幂等去重表。\n→ Broker 行为符合 at-least-once 契约：它保证了"至少一次"，不保证"恰好一次"。',
      },
    },
    {
      id: 'a-idemsearch',
      name: '搜代码里的幂等处理',
      desc: '消费者是否有任何去重逻辑（幂等键/去重表/唯一约束）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '代码审查',
        text: '消费者代码中搜"幂等/dedupe/unique/messageId"：零命中。\n流水表只有普通索引，无唯一约束；短信发送无去重窗口。\n→ 消费者完全裸奔：把 at-least-once 当成 exactly-once 在写代码。',
      },
    },
    {
      id: 'a-rollback',
      name: '紧急止血：停消费者 + 冲正错误流水',
      desc: '【状态变更】停掉消费者防止继续重复，财务冲正多记的流水',
      cost: 2,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '消费者暂停，积压消息暂存队列；财务按对账名单冲正多记流水，补发安抚短信。\n→ 副作用停止扩大，等待修复上线。',
      },
    },
    {
      id: 'a-fixidem',
      name: '上线幂等消费：唯一键 + 状态检查',
      desc: '【状态变更】流水表加唯一约束 + 消费前查重 + 短信去重窗口',
      cost: 3,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 流水表对 pay_order_no 加唯一约束（数据库层兜底）\n② 消费入口先查"该支付单是否已处理"，已处理则直接 ack 跳过\n③ 生产者为每条消息设置 messageId，消费日志可追溯\n重发测试：手动 kill 消费者模拟 ack 超时 → 重复投递被幂等层拦截，业务零影响。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-redeliver', text: '消费者处理成功但 ack 丢失（重启+网络抖动），Broker 按 at-least-once 契约重发；消费者无幂等设计，重复消息被全量执行', correct: true },
    { id: 'rc-publish', text: '生产者超时重试导致同一条消息被发送多次', correct: false },
    { id: 'rc-broadcast', text: '队列误配为广播模式，消息被多个实例重复消费', correct: false },
    { id: 'rc-userbug', text: '用户重复点击支付，本来就发起了三笔支付', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-fixidem',

  expertChain: [
    {
      thought: '短信重复、流水重复——先分清是"消息重复"还是"消息正常但副作用重复"。看重复的时间间隔和分布。',
      update: '间隔 8s/28s 的重复 + 与消费者重启时间吻合 → 不是用户连点（毫秒级），指向消费链路。',
      actionId: 'a-impact',
      why: '1⚡︎ 圈范围先给出重复的"形状"：时间间隔和触发时间是最便宜的证据，直接排除了最像的用户连点。',
      conclusion: '重复集中在消费者重启后 → 假设升权：ack/重发机制问题。',
    },
    {
      thought: '两条路：生产者发了多次，或 Broker 投了多次。先看生产者日志——它是最上游。',
      update: '生产者只发一次。但要小心：它没开 confirm 也没设 messageId，"发送一次"的上游证据链并不牢。',
      actionId: 'a-publish',
      why: '1⚡︎ 排除最上游，同时发现一个隐藏问题：无 confirm 无幂等键，说明整个链路都没按异步契约设计。',
      conclusion: '生产者排除 → 重复发生在 Broker 投递或消费侧。',
    },
    {
      thought: '对比"处理日志"和"ack 日志"——如果处理成功但 ack 失败，Broker 必然重发，这是 at-least-once 的契约行为。',
      update: '实锤：处理成功 6.2s 后 ack 超时，Broker 重发两次，消费者每次都全量执行。',
      actionId: 'a-logcheck',
      why: '1⚡︎ 一锤定音的对比：同一条消息的处理记录出现三次，而 Broker 重发标记 true——机制完整闭环。',
      conclusion: 'at-least-once 重发 + 消费者无幂等 = 三次流水。问题不是"消息为什么重复"，是"重复了为什么没拦住"。',
    },
    {
      thought: '为什么没拦住？搜代码——幂等键、去重表、唯一约束，一个都没有。',
      update: '消费者把 at-least-once 当 exactly-once 写：无唯一约束、无查重、短信无去重窗口。',
      actionId: 'a-idemsearch',
      why: '根因确认在消费侧设计缺陷。注意因果分两层：ack 丢失是诱因（不可消除），无幂等是缺陷（必须修）——修的是后者，前者是常态。',
      conclusion: '修复方向：不追求"消灭重复"（做不到），而是"重复了也无害"（幂等）。',
    },
    {
      thought: '止血（停消费+冲正）和修复（幂等）并行。证据已闭合，停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】诱因（ack 超时）✓ 放大器（无幂等）✓ 影响面（4% 订单）✓ ——三要素齐了，继续排查不改变行动。',
      conclusion: '沉淀：异步链路设计的第一问不是"会不会重复"，是"重复了会怎样"。at-least-once 是契约，幂等是义务。',
    },
  ],

  lessons: [
    {
      text: 'at-least-once 语义下重复投递是常态不是故障——把"可能重复"写进设计，而不是寄希望于它不发生。',
      principle: 'MQ 的投递语义只有 at-most-once / at-least-once 两种可选，exactly-once 需要端到端自建。选择 at-least-once 就等于承诺了消费者的幂等义务：ack 丢失、重试、重平衡都会触发重发。',
    },
    {
      text: '幂等三层兜底：入口查重（业务）→ 唯一约束（数据库）→ 去重窗口（副作用）。',
      principle: '幂等不能只做一层：入口查重有并发窗口，唯一约束是最终兜底，短信/邮件等外部副作用还要独立去重。检查每一条"不可重复"的路径是否有硬约束兜底。',
    },
    {
      text: '排查重复问题先画"重复的形状"：时间间隔、次数分布、与变更的相关性。',
      principle: '毫秒级连发指向用户/调用方重试；秒级间隔重发指向 Broker 重投；实例数×重复指向广播拓扑。形状本身就是证据，比逐段加日志快得多。',
    },
  ],
}
