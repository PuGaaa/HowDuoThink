import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const mqDuplicateCase: DiagnosisCase = {
  id: 'mq-duplicate',
  title: '同一条消息被消费了三次',
  intro: '用户一单 99 元的订单，收到三条"扣款成功"短信；财务对账发现同一笔支付被记了三笔流水。',
  domain: 'runtime',
  layer: 'at-least-once 语义下，重复不是异常，是常态',
  part: 'master',
  chapterId: 'messaging',
  order: 2,
  typeTags: [
    'messaging',
    'idempotency',
  ],
  difficulty: 2,
  scene: {
    role: '你是「票到手」票务平台的订单服务后端，负责订单消息的消费链路。',
    architecture: 'RabbitMQ同一工作队列→2个竞争消费者→本地流水和短信投递；单支付业务键P1，副作用各自不幂等。',
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
      {
        type: 'log',
        title: '模板预览失败',
        text: '[WARN] SMS template preview image 404。',
      },
    ],
    timeline: '11:02窗口两次消费者channel/connection关闭；10:30的旧OOM只是背景，不作为本窗口未确认投递重排的证明。',
    impactHint: '重复的是"消息"还是"副作用"？短信和流水都是消息引发的动作——哪个环节在放大？',
  },
  hypotheses: [
    {
      id: 'h-redeliver',
      text: '消费者处理成功但 ack 失败/超时，Broker 认为未消费成功而重发',
      excludeActionId: 'a-redeliver',
    },
    {
      id: 'h-publish',
      text: '生产者发送重复：支付服务因超时重试，同一条消息被发了多次',
      excludeActionId: 'a-publish',
    },
    {
      id: 'h-broadcast',
      text: '队列配置变更后变成广播/多消费者模式，消息被多个实例各消费一次',
      excludeActionId: 'a-topology',
    },
    {
      id: 'h-userbug',
      text: '用户重复点击支付按钮，本来就发起了三笔支付',
      excludeActionId: 'a-paylog',
    },
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
        text: '同一支付业务键出现2~3次流水和短信意图。8秒/28秒间隔只是形状，用户也可能隔秒重试，不能单靠间隔排除付款重复。需要相同键与Broker投递关联。',
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
      tests: [
        'h-userbug',
      ],
      hypotheses: [
        {
          id: 'h-userbug',
          status: 'excluded',
        },
      ],
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
      tests: [
        'h-publish',
      ],
      hypotheses: [
        {
          id: 'h-publish',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '生产者发送日志',
        text: '生产审计和Broker入口关联同一payload hash/支付业务键P1只有一次入队，后续为同一入队事件重投；是否启用confirm与此样本发送次数是两件事。',
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
      tests: [
        'h-broadcast',
      ],
      hypotheses: [
        {
          id: 'h-broadcast',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '队列拓扑',
        text: '单工作队列，两消费者竞争；每次delivery分配给一个消费者，但channel关闭后的重投可以改投另一消费者。没有fanout到三个独立队列，排除广播拷贝解释。',
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
      tests: [
        'h-redeliver',
      ],
      hypotheses: [
        {
          id: 'h-redeliver',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '消费日志 vs ack 日志',
        text: '同一入队事件/P1：11:02:11首次开始，17.2秒业务副作用已提交；17.3秒连接关闭，ack未到Broker。19秒重投；第二次完成后ack帧在中断网络未到Broker，45秒连接失效被关闭，47秒第三投递。\nRabbitMQ消费者basic.ack通常是单向方法，没有“等Broker回ack确认超时”的二次确认。这里是连接关闭仍有unacked导致重投，8/28秒来自具体断线/重连，不是Broker内置指数退避。\n噪声收线：预览图不创建短信投递意图或业务流水；三次同P1提交与连接关闭已独立关联。',
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
      tests: [
        'h-redeliver',
      ],
      hypotheses: [
        {
          id: 'h-redeliver',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: 'Broker 投递记录',
        text: '相同入队事件与P1，后两次redelivered=true，delivery tag属于各自channel、不能当全局消息ID。标志提供重投线索，不表示首次false永不重复，也不能看到true就丢弃未处理业务。',
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
        text: '流水表无支付业务唯一约束，相同P1三次执行都可插入；短信无唯一投递意图。此处业务键P1已在体中，不是因为没有messageId属性就必然不能幂等。',
      },
    },
    {
      id: 'a-rollback',
      name: '紧急止血：停消费者 + 冲正错误流水',
      desc: '【状态变更】停掉消费者防止继续重复，财务冲正多记的流水',
      cost: 9,
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
        text: '同事务创建唯一业务流水和唯一短信投递意图，随后可靠派发；短信若供应商支持同业务键幂等则复用，否则结果不确定时仍需对账，不能保证外部恰好一次。\n入口先查再做有竞态，应靠业务约束。messageId便于追踪但不会自动让Broker或消费者去重；ack在承诺的持久业务状态完成后发送。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-redeliver',
      text: '副作用提交后连接关闭导致未确认消息重投，消费者又按同一P1重复插流水和投短信；本地及外部副作用均缺稳定业务唯一边界',
      correct: true,
    },
    {
      id: 'rc-publish',
      text: '生产者超时重试导致同一条消息被发送多次',
      correct: false,
    },
    {
      id: 'rc-broadcast',
      text: '队列误配为广播模式，消息被多个实例重复消费',
      correct: false,
    },
    {
      id: 'rc-userbug',
      text: '用户重复点击支付，本来就发起了三笔支付',
      correct: false,
    },
  ],
  expertCost: 7,
  restartActionId: 'a-fixidem',
  expertChain: [
    {
      thought: '按稳定支付键观察重复。',
      update: '一键多流水，间隔只作线索。',
      actionId: 'a-impact',
      why: '1⚡先区分重复付款和重复副作用。',
      conclusion: '核对源交易。',
    },
    {
      thought: '核对支付记录。',
      update: '仅一次付款。',
      actionId: 'a-paylog',
      why: '1⚡真实付款账本才能排除重复下单/支付。',
      conclusion: '排除用户重复付款。',
    },
    {
      thought: '关联生产与Broker入队。',
      update: '同一入队事件，非多次生产。',
      actionId: 'a-publish',
      why: '1⚡体hash和业务键比messageId缺失推理可靠。',
      conclusion: '排除重复生产。',
    },
    {
      thought: '核对工作队列拓扑。',
      update: '竞争消费，非广播拷贝。',
      actionId: 'a-topology',
      why: '2⚡重投换消费者不等于广播语义。',
      conclusion: '排除广播。',
    },
    {
      thought: '关联提交、断线与unacked。',
      update: '提交后连接关闭，消息重投两次。',
      actionId: 'a-logcheck',
      why: '1⚡不能编造等待消费ack的二次确认。',
      conclusion: '确认触发机制。',
    },
    {
      thought: '核对唯一约束及外部投递。',
      update: '同P1可重复写和发。',
      actionId: 'a-idemsearch',
      why: '1⚡幂等要覆盖各副作用，不是看到redelivered就丢。',
      conclusion: '缺陷闭合。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】入队、连接、投递与业务提交关联，重复生产/广播/付款均排除，副作用无幂等已确认。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '副作用提交后连接关闭导致未确认消息重投，消费者又按同一P1重复插流水和投短信；本地及外部副作用均缺稳定业务唯一边界',
    },
  ],
  lessons: [
    {
      text: '消费者basic.ack与publisher confirm不同，RabbitMQ消费ack没有再等Broker返回“ack的ack”。',
      principle: '连接关闭且delivery仍unacked会重投；通过channel归属、连接事件和业务ID关联，不能用全局delivery tag或单侧日志推导。',
    },
    {
      text: 'redelivered是线索，不是业务去重键；messageId属性也不自动提供去重。',
      principle: '用稳定业务键与事务唯一约束保护本地效果，对短信等外部副作用另定义可靠投递与结果不确定处理。',
    },
    {
      text: '一次入队可多次投递到同队列不同竞争消费者；这不等于广播到多队列。',
      principle: '分别核对生产次数、路由拷贝、delivery次数和业务提交次数。间隔和实例数只能提示方向，不能单独裁决原因。',
    },
  ],
}
