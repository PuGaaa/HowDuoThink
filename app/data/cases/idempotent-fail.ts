import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 并发迷宫（幂等失效 L3）
 * 教学点：支付回调重试机制 + 无幂等键 = 重复发货；重试不是异常而是 MQ/支付系统的设计行为。
 * 专家路径：impact(1) + orderlist(1) + paylog(2) + code(2) = 6⚡︎
 */
export const idempotentFailCase: DiagnosisCase = {
  id: 'idempotent-fail',
  title: '用户付一笔钱，收到了两件货',
  intro: '客服批量反馈：用户只支付了一笔，却收到了两个包裹。涉及 23 个订单。',
  domain: 'concurrency',
  layer: '幂等：同一操作执行一次和执行 N 次，结果必须相同',
  part: 'master',
  chapterId: 'concurrency',
  order: 2,
  typeTags: ['race', 'timing'],
  difficulty: 3,

  scene: {
    role: '你是交易系统后端，仓库同事反馈：23 个订单被重复拣货发货，用户拒收第二件。',
    architecture: '支付网关 → MQ(支付成功事件) → 履约服务 → 仓库 WMS',
    symptoms: [
      {
        type: 'error',
        title: '仓库反馈',
        text: '23 个订单出现两张拣货单，支付流水均只有一笔。\n重复发货时间分散在全天，非同时发生。',
      },
      {
        type: 'text',
        title: '用户侧',
        text: '用户支付金额正确（只扣一次款），拒收第二个包裹后系统产生"拒收回退"工单。',
      },
    ],
    timeline: '今天零星出现 ｜ 上周支付网关升级：回调超时重试策略从 1 次改为 3 次',
    impactHint: '重复发货的时间与支付回调的时间，有没有对应关系？',
  },

  hypotheses: [
    { id: 'h-retry', text: '支付回调超时重试，履约接口无幂等导致重复发货', excludeActionId: 'a-paylog' },
    { id: 'h-mq', text: 'MQ 消息重复投递触发两次履约', excludeActionId: 'a-mqlist' },
    { id: 'h-manual', text: '运营/仓库手工重复创建了拣货单', excludeActionId: 'a-wms' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定重复发货订单',
      desc: '23 单的支付次数、发货次数、时间间隔',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '订单对比',
        text: '23 单均为：支付 1 次、发货 2 次；两次发货间隔 15~90 秒不等。\n重复发货全部发生在支付成功之后——不存在未支付就发货的情况。',
      },
    },
    {
      id: 'a-orderlist',
      name: '读重复发货订单的履约流水',
      desc: '两次履约的触发来源',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'log',
        title: '履约流水（节选）',
        text: '订单 O-8811：\n10:32:11 履约触发 source=pay_callback\n10:32:52 履约触发 source=pay_callback\n→ 两次都由支付回调触发，间隔 41 秒',
      },
    },
    {
      id: 'a-paylog',
      name: '读支付网关回调日志',
      desc: '回调发了几次、为什么重发',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-retry'],
      hypotheses: [{ id: 'h-retry', status: 'confirmed' }],
      result: {
        type: 'log',
        title: '支付网关日志',
        text: '第一次回调：10:32:11，我方返回 200 ✓\n第二次回调：10:32:52，网关标注"重试：上次响应超时"\n→ 网关侧显示第一次我方响应超时（>10s），触发重试策略（上周从 1 次改为 3 次）',
      },
    },
    {
      id: 'a-code',
      name: '读履约接口的幂等实现',
      desc: '回调处理有没有幂等键',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-retry'],
      hypotheses: [{ id: 'h-retry', status: 'up' }],
      result: {
        type: 'code',
        title: '履约代码',
        text: "async def on_pay_callback(event):\n    order = get_order(event.order_id)\n    if order.status == 'PAID':\n        create_delivery(order)   ← 无幂等键检查、无唯一约束\n→ 同一支付事件第二次到达，仍会再发一次货",
      },
    },
    {
      id: 'a-mqlist',
      name: '查 MQ 投递记录',
      desc: '支付事件在 MQ 里投递了几次',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-mq'],
      hypotheses: [{ id: 'h-mq', status: 'down' }],
      result: {
        type: 'text',
        title: 'MQ 记录',
        text: '支付事件 MQ 投递均只有 1 次——重复不在 MQ 层，在回调重试层。',
      },
    },
    {
      id: 'a-wms',
      name: '查 WMS 拣货单创建记录',
      desc: '排除仓库手工重复建单',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-manual'],
      hypotheses: [{ id: 'h-manual', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'WMS 记录',
        text: '两张拣货单均由履约系统 API 自动创建，操作人=系统——排除手工因素。',
      },
    },
    {
      id: 'a-timing',
      name: '统计第一次回调的处理耗时',
      desc: '确认"响应超时"的真实性',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-retry'],
      hypotheses: [],
      result: {
        type: 'text',
        title: '处理耗时',
        text: '第一次回调处理耗时 11.4s（创建拣货单调用 WMS 慢）——超过网关 10s 超时阈值，坐实重试诱因。',
      },
    },
    {
      id: 'a-void',
      name: '作废重复发货单并拦截',
      desc: '【状态变更】WMS 拦截第二件包裹 + 作废工单',
      cost: 5,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止损结果',
        text: '23 单全部拦截成功，未发出的直接作废，已发出的走拒收回款。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-retry', text: '支付网关超时重试 + 履约接口无幂等键：第一次回调处理慢导致网关重试，重试再次发货', correct: true },
    { id: 'rc-mq', text: 'MQ 消息重复投递触发重复履约', correct: false },
    { id: 'rc-manual', text: '仓库侧手工重复创建拣货单', correct: false },
  ],

  expertCost: 6,
  restartActionId: 'a-void',

  expertChain: [
    {
      thought: '先确认"重复"的性质：付一次发两次，且间隔 15~90 秒——不是并发同时发生，是间隔性的二次触发。',
      update: '排除并发写冲突类假设，指向"第二次触发源"。',
      actionId: 'a-impact',
      why: '1⚡︎ 买形状：同时发生是并发写，间隔发生是有第二次触发源——方向完全不同。',
      conclusion: '间隔性重复 → 找第二次触发的来源。',
    },
    {
      thought: '履约流水直接标注了触发来源：两次都是 pay_callback。来源锁定支付回调。',
      update: '回调重复触发实锤，接下来查"为什么回调会来两次"。',
      actionId: 'a-orderlist',
      why: '1⚡︎ 的流水带 source 字段，直接把嫌疑范围从"任意环节"收缩到"支付回调"。',
      conclusion: '两次触发均来自支付回调 → 查网关重试日志。',
    },
    {
      thought: '网关日志给出完整机制：第一次我方响应超时，网关按策略重试。上周重试次数刚改过。',
      update: '重试是网关的设计行为（不是异常）——问题转向我方：为什么慢 + 为什么重试会造成重复。',
      actionId: 'a-paylog',
      why: '2⚡︎ 网关日志同时回答了"来几次"和"为什么"两个问题，是本案最有信息量的动作。',
      conclusion: '实锤：回调超时（>10s）触发网关重试（3 次）。',
    },
    {
      thought: '重试本身无害，有害的是我方接口无幂等：同一事件第二次到达仍会发货。读代码确认。',
      update: '实锤：履约无幂等键、无唯一约束。',
      actionId: 'a-code',
      why: '2⚡︎ 确认修复点：加幂等键（支付事件 ID 唯一约束）就能让重试变成无害操作。',
      conclusion: '实锤：无幂等。修复：幂等键 + 状态机检查，网关重试策略保留（它是可靠性设计）。',
    },
    {
      thought: '证据链闭合：重试（网关日志）+ 无幂等（代码）+ 23 单完美对应。停止收集，先止损再修复。',
      update: '停止收集。止损：拦截重复包裹；修复：幂等键。',
      actionId: '',
      why: '拦截止损与代码修复并行不冲突；继续查 MQ 等环节不改变任何行动。',
      conclusion: 'WMS 拦截 23 单 → 履约接口加幂等键 → 网关重试策略保留。',
    },
  ],

  lessons: [
    {
      text: '凡是处理外部事件的接口（回调/MQ/轮询），必须默认"事件会重复到达"并做幂等。',
      principle: 'At-least-once 是支付回调与 MQ 的标准投递语义：重试不是故障而是可靠性设计。接口无幂等时，对方的可靠性就是你的事故。',
    },
    {
      text: '幂等键 = 事件的唯一 ID + 唯一约束，让"重复到达"变成"重复但无害"。',
      principle: '幂等实现优先用存储层唯一约束（支付事件 ID 唯一索引），配合状态机检查——比应用层去重表更可靠。',
    },
    {
      text: '对方系统的"重试策略变更"是你的上游风险：变更通报必须覆盖重试/超时参数。',
      principle: '依赖方的超时、重试、投递参数变更会改变你接口的流量形态——跨团队变更通知清单里必须包含这类参数。',
    },
  ],
}
