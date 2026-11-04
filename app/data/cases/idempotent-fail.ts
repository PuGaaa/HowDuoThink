import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const idempotentFailCase: DiagnosisCase = {
  id: 'idempotent-fail',
  title: '用户付一笔钱，收到了两件货',
  intro: '客服批量反馈：用户只支付了一笔，却收到了两个包裹。涉及 23 个订单。',
  domain: 'concurrency',
  layer: '幂等：同一操作执行一次和执行 N 次，结果必须相同',
  part: 'master',
  chapterId: 'concurrency',
  order: 2,
  typeTags: [
    'race',
    'timing',
  ],
  difficulty: 2,
  scene: {
    role: '你是交易系统后端，仓库同事反馈：23 个订单被重复拣货发货，用户拒收第二件。',
    architecture: '支付网关→我方回调处理器→履约WMS；MQ仅发送已支付审计事件，WMS创建本案不由MQ消费触发。',
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
      {
        type: 'log',
        title: '发票归档重试',
        text: '[WARN] invoice archive retry=1；订单同期日志有此条。',
      },
    ],
    timeline: '今天零星出现 ｜ 上周支付网关升级：回调超时重试策略从 1 次改为 3 次',
    impactHint: '重复发货的时间与支付回调的时间，有没有对应关系？',
  },
  hypotheses: [
    {
      id: 'h-retry',
      text: '支付回调超时重试，履约接口无幂等导致重复发货',
      excludeActionId: 'a-paylog',
    },
    {
      id: 'h-mq',
      text: 'MQ 消息重复投递触发两次履约',
      excludeActionId: 'a-mqlist',
    },
    {
      id: 'h-manual',
      text: '运营/仓库手工重复创建了拣货单',
      excludeActionId: 'a-wms',
    },
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
        text: '23笔业务订单各支付一次、WMS各有两张拣货单，两次触发间隔15~90秒。这提示重复输入，但不能凭“有间隔”排除跨请求并发或处理重叠。',
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
      tests: [
        'h-mq',
        'h-manual',
      ],
      hypotheses: [
        {
          id: 'h-mq',
          status: 'excluded',
        },
        {
          id: 'h-manual',
          status: 'excluded',
        },
      ],
      result: {
        type: 'log',
        title: '履约流水（节选）',
        text: 'O-8811两张WMS单的调用父trace均为pay_callback请求C1/C2，actor=system；同一支付业务键P1，没有人工操作或MQ消费父trace。MQ审计消息另有ID A1，不参与这两次WMS API。\n噪声收线：归档是另一trace的离线附件任务，不创建WMS拣货单；两单父trace均为明确支付回调。',
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
      tests: [
        'h-retry',
      ],
      hypotheses: [
        {
          id: 'h-retry',
          status: 'up',
        },
      ],
      result: {
        type: 'log',
        title: '支付网关日志',
        text: 'C1在10:32:11开始，WMS慢使处理11.4秒，应用10:32:22.4才尝试回200；网关等待10秒在10:32:21已超时，未确认该响应。C2在10:32:52以同一支付业务键P1重试。\n应用打印200与对方超时并不矛盾，但必须写清200生成时点与是否被对方收到。',
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
      tests: [
        'h-retry',
      ],
      hypotheses: [
        {
          id: 'h-retry',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '履约代码',
        text: 'on_callback按order.status==PAID就调用create_delivery，无唯一履约业务键。对同一P1回放两次，产生两次WMS创建；付款状态PAID不能表示已完成履约。\n修复应使用稳定业务键（订单+履约阶段/版本）创建唯一履约意图，再可靠投递，并让WMS以同键幂等。仅先插已处理再外呼会在崩溃时丢任务，外呼后才标记又可能重复。',
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
      tests: [
        'h-mq',
      ],
      hypotheses: [
        {
          id: 'h-mq',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'MQ 记录',
        text: 'MQ审计事件A1只投递一次；更关键的是两次WMS调用父trace都不属于MQ消费者。投递次数与调用来源一起排除MQ重复触发。',
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
      tests: [
        'h-manual',
      ],
      hypotheses: [
        {
          id: 'h-manual',
          status: 'excluded',
        },
      ],
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
      tests: [
        'h-retry',
      ],
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
      cost: 9,
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
    {
      id: 'rc-retry',
      text: '支付网关超时重试 + 履约接口无幂等键：第一次回调处理慢导致网关重试，重试再次发货',
      correct: true,
    },
    {
      id: 'rc-mq',
      text: 'MQ 消息重复投递触发重复履约',
      correct: false,
    },
    {
      id: 'rc-manual',
      text: '仓库侧手工重复创建拣货单',
      correct: false,
    },
  ],
  expertCost: 6,
  restartActionId: 'a-void',
  expertChain: [
    {
      thought: '确认付款与履约基数。',
      update: '付1发2，间隔提示重复输入。',
      actionId: 'a-impact',
      why: '1⚡间隔不能单独排除并发，继续追踪触发源。',
      conclusion: '查两单来源。',
    },
    {
      thought: '关联两张WMS单的父trace。',
      update: '均来自C1/C2回调，无人工或MQ父调用。',
      actionId: 'a-orderlist',
      why: '1⚡调用归属比仅看消息投递次数更有决定性。',
      conclusion: '排除MQ与人工。',
    },
    {
      thought: '对齐两侧超时和响应时间。',
      update: 'C1业务11.4s，网关10s超时后C2重试。',
      actionId: 'a-paylog',
      why: '2⚡应用200与对方未收到可以同时成立。',
      conclusion: '重试输入成立。',
    },
    {
      thought: '回放相同业务键并审查唯一边界。',
      update: '相同P1两次创建，PAID不代表已履约。',
      actionId: 'a-code',
      why: '2⚡代码和同键回放确认外部副作用未幂等。',
      conclusion: '确认重复履约原因。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】重试输入与两次外部创建因果吻合，人工和MQ来源均排除；修复设计不冒充已经跨系统原子。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '支付网关超时重试 + 履约接口无幂等键：第一次回调处理慢导致网关重试，重试再次发货',
    },
  ],
  lessons: [
    {
      text: '支付通知重试是可能发生的可靠性行为；应用写200日志不证明网关及时收到该响应。',
      principle: '以同一业务键和关联trace对齐开始、业务完成、响应生成及网关超时，跨系统墙钟只作线索，不能只看某一侧最先日志。',
    },
    {
      text: '幂等要覆盖外部副作用：唯一创建履约意图，可靠执行，WMS按稳定业务键拒绝重复。',
      principle: 'DB唯一约束与WMS不在同一普通事务。先标已处理后外呼可能丢任务，外呼后标记可能重做；需明确待处理、重试与对账边界。',
    },
    {
      text: 'PAID是付款状态，不等于已履约；通知的eventId也未必跨重试稳定。',
      principle: '采用业务认可的稳定键，并保留必要事件审计；状态检查不应替代并发下的唯一性约束。',
    },
  ],
}
