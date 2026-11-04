import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const mqLostCase: DiagnosisCase = {
  id: 'mq-lost',
  title: '消息发出去了，消费者说没收到',
  intro: '一次Broker崩溃窗口中，应用声明成功10000条，业务只收到9700条。按同一批唯一ID分开核对写缓冲、Broker接收、持久化和消费。',
  domain: 'runtime',
  layer: '消息链路三段：生产者→Broker→消费者——丢在哪一段，排查方向完全不同',
  part: 'master',
  chapterId: 'messaging',
  order: 1,
  typeTags: [
    'messaging',
    'async',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」的库存服务后端。物流团队的消费者说有 3% 的消息没收到——你确认生产者发送成功，双方开始互相甩锅。',
    architecture: '库存服务(生产者) → RabbitMQ(exchange→queue) → 物流服务(消费者)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '生产者日志',
        text: 'Node amqplib普通Channel的publish返回true；这只是客户端写缓冲未达回压阈值，不是Broker接收或持久化确认。',
      },
      {
        type: 'text',
        title: '消费者日志',
        text: '本题只分析一次崩溃窗口：10000条唯一业务ID中9700条完成，缺300（3%）；不是单次重启以后每天固定丢3%。',
      },
      {
        type: 'log',
        title: '管理页图标失败',
        text: '[WARN] RabbitMQ console favicon 404。',
      },
    ],
    timeline: 'Broker一次故障重启；同窗关联生产输入、Broker trace与消费结果。当前队列/消息设置须在动作中核对。',
    impactHint: '生产者确认"写入了 socket" ≠ Broker 确认"已持久化到磁盘"——这两步之间有一个丢失窗口。',
  },
  hypotheses: [
    {
      id: 'h-confirm',
      text: '成功契约缺Broker确认且消息不持久，崩溃同时暴露未到达与已接收未保留两处窗口',
      excludeActionId: 'a-confirmcheck',
    },
    {
      id: 'h-durable',
      text: '所有丢失都在Broker已接收后，生产侧没有任何未到达缺口',
      excludeActionId: 'a-msgcount',
    },
    {
      id: 'h-route',
      text: 'routing key/binding不匹配，消息被正常判定不可路由',
      excludeActionId: 'a-routecheck',
    },
    {
      id: 'h-ack',
      text: '消费者先ack后未处理，所有缺口其实已被消费端确认',
      excludeActionId: 'a-ackcheck',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '圈定同一崩溃窗口的唯一消息账本',
      desc: '影响面：同批业务ID、时间窗口和各段计数',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '同批账本',
        text: '固定10000条唯一业务ID，应用都宣称成功；消费结果9700，缺300。按ID而非混合日计数关联，暂不从“没收到”推断到底丢在哪一段。',
      },
    },
    {
      id: 'a-confirmcheck',
      name: '检查生产者的 confirm 模式与消息可靠性配置',
      desc: '影响面：确认消息丢失在哪一段',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-confirm',
      ],
      hypotheses: [
        {
          id: 'h-confirm',
          status: 'up',
        },
      ],
      result: {
        type: 'text',
        title: 'confirm 模式检查',
        text: 'Node amqplib使用createChannel而非createConfirmChannel，无confirm回调或waitForConfirms；publish boolean只表示客户端背压。false也不是投递失败，应等待drain；true更不是持久化成功。\n应用把普通publish返回当成业务成功，未记录未确认状态。',
      },
    },
    {
      id: 'a-durablecheck',
      name: '检查队列与消息的持久化设置',
      desc: 'durable queue + persistent message',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-durable',
      ],
      hypotheses: [
        {
          id: 'h-durable',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'text',
        title: '持久化检查',
        text: '队列durable:false，消息persistent:false；重启会丢该队列及尚未消费的瞬态消息。即使publisher confirm收到，也不使非持久化消息自动跨重启保留。\n本案可靠性缺陷包含成功边界和重启保留两项，不能把持久化这个真实缺口另标为假根因。',
      },
    },
    {
      id: 'a-routecheck',
      name: '检查路由键与绑定关系',
      desc: '排除路由错误',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-route',
      ],
      hypotheses: [
        {
          id: 'h-route',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '路由核对',
        text: '同拓扑恢复副本中逐个业务ID使用相同exchange/key/binding重放均可路由，无mandatory return；故障窗口设置未变。不存在exchange通常关闭channel并报错，不能混同静默无绑定路由。\n噪声收线：图标请求不进入AMQP交换机或队列，业务路由重放与该静态资源失败独立。',
      },
    },
    {
      id: 'a-ackcheck',
      name: '检查消费者的 ack 模式',
      desc: '排除消费者 ack 异常',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-ack',
      ],
      hypotheses: [
        {
          id: 'h-ack',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'ack 模式',
        text: '消费审计只有9700个业务ID的处理提交与ack，缺失300个无deliver/ack记录；并非消费者先ack吞掉。手动ack也不自动保证外部业务已完成，需对照事务记录。',
      },
    },
    {
      id: 'a-rollbackmq',
      name: '回滚消息中间件配置到可靠版本',
      desc: '【状态变更】回滚到上次可靠性配置正确的版本',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果',
        text: '回滚前先核对队列声明兼容性；同名队列从durable:false直接声明为true会发生属性不等价错误，不能仅热改配置承诺恢复。迁移需处理已有队列和待重发意图，并验证新流量确认。',
      },
    },
    {
      id: 'a-brokerlog',
      name: '查 Broker 日志中的异常',
      desc: 'Broker 重启/崩溃/内存告警的日志',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-confirm',
      ],
      hypotheses: [
        {
          id: 'h-confirm',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'text',
        title: 'Broker 日志',
        text: 'Broker崩溃/恢复与该批次关联；瞬态队列被删除，重建后150个已接收未消费ID不在队列，另150个发送端在途ID无Broker接收记录。重启本身不是所有丢失的充分证明，需此ID对账和设置证据。',
      },
    },
    {
      id: 'a-msgcount',
      name: '对账：生产者发送量 vs 消费者消费量',
      desc: '按天比对两端的消息计数，确认丢失规模',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-durable',
      ],
      hypotheses: [
        {
          id: 'h-durable',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '消息对账',
        text: '同10000唯一ID：Broker trace接收9850，消费完成9700；150个未见Broker接收，另150个已接收但重启前未消费且瞬态丢失。两段各150，共300=3%。\n未到达缺口直接反证“全部都在Broker后丢”，也说明不能拿不同日的发送/消费计数证明单一窗口。',
      },
    },
    {
      id: 'a-fixconfirm',
      name: '开启 confirm 模式 + 持久化 + 失败重发',
      desc: '【状态变更】三处修复一次部署',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: 'amqplib使用createConfirmChannel并追踪confirm/失败不确定态，按需mandatory并处理basic.return；持久队列配持久消息，明确复制/磁盘确认保证。\n发送意图先可靠保存再重试；confirm可能丢失导致重复，消费仍需幂等。DLQ只接Broker已经持有且满足死信条件的消息，不能补回从未到达Broker的发送。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-confirm',
      text: '普通publish返回被误当业务成功，且队列/消息瞬态；一次崩溃中150条未到达、150条已接收未消费丢失，共300/10000',
      correct: true,
    },
    {
      id: 'rc-durable',
      text: '全部丢失只发生在Broker接收后，生产侧无缺口',
      correct: false,
    },
    {
      id: 'rc-route',
      text: '路由键与绑定不匹配',
      correct: false,
    },
    {
      id: 'rc-ack',
      text: '消费者先ack后未处理吞掉所有缺口',
      correct: false,
    },
  ],
  expertCost: 7,
  restartActionId: 'a-rollbackmq',
  expertChain: [
    {
      thought: '固定同一批唯一ID。',
      update: '10000成功声明，9700结果。',
      actionId: 'a-impact',
      why: '1⚡先统一分母和窗口，不凭两端口头判断。',
      conclusion: '逐段对账。',
    },
    {
      thought: '核对真实SDK返回语义。',
      update: '普通Channel布尔值只是背压。',
      actionId: 'a-confirmcheck',
      why: '1⚡混用Java confirmSelect和Node API会制造不存在的保证。',
      conclusion: '确认成功边界缺口。',
    },
    {
      thought: '读取队列和消息持久化。',
      update: '二者均瞬态。',
      actionId: 'a-durablecheck',
      why: '1⚡confirm不自动给瞬态消息跨重启保证。',
      conclusion: '第二风险成立。',
    },
    {
      thought: '逐ID核算缺口分段。',
      update: '150未接收、150已接收未保留。',
      actionId: 'a-msgcount',
      why: '1⚡具体ID反证全部只在Broker后丢失。',
      conclusion: '排除单段解释。',
    },
    {
      thought: '关联崩溃和重建后的队列。',
      update: '瞬态队列删除，与150待消费ID吻合。',
      actionId: 'a-brokerlog',
      why: '1⚡事件与配置、对账联合证明实际丢失。',
      conclusion: '确认复合可靠性缺口。',
    },
    {
      thought: '同拓扑重放并核对路由返回。',
      update: '绑定正确，未见不可路由返回。',
      actionId: 'a-routecheck',
      why: '1⚡路由证据独立于publish布尔值。',
      conclusion: '排除路由。',
    },
    {
      thought: '对照deliver、业务提交与ack。',
      update: '缺300没有消费者ack。',
      actionId: 'a-ackcheck',
      why: '1⚡不能仅用ack成功率100%反证未送达缺口。',
      conclusion: '排除消费者先ack。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】同批ID两段缺口与瞬态队列崩溃证据吻合，路由和消费者先ack解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '普通publish返回被误当业务成功，且队列/消息瞬态；一次崩溃中150条未到达、150条已接收未消费丢失，共300/10000',
    },
  ],
  lessons: [
    {
      text: 'amqplib publish的布尔返回是背压信号；Broker确认、可路由与重启保留是不同承诺。',
      principle: 'confirm、mandatory return和持久化/复制各覆盖不同风险；少一项存在风险，但不等于每次消息必丢，三件套也不是无限故障下绝对不丢。',
    },
    {
      text: '固定同一批唯一业务ID逐段对账，区分未接收、已接收未保留与消费后结果。',
      principle: '本案150+150=300。不同日计数和在途消息不能直接相减解释缺口，Broker重启也需关联具体保留证据。',
    },
    {
      text: 'DLQ无法恢复从未进入Broker的消息，发送意图与重试必须由生产侧保留。',
      principle: '确认丢失会让发送方不知道结果；重试可能重复，业务幂等与对账仍需覆盖，不能把收到confirm等同端到端恰好一次。',
    },
  ],
}
