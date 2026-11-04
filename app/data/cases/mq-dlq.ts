import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const mqDlqCase: DiagnosisCase = {
  id: 'mq-dlq',
  title: '死信队列堆了八万条——没人看',
  intro: 'DLQ快照80412条，最老21天。核对入队原因、消息契约和告警归属，再决定哪些记录仍有补发意义。',
  domain: 'runtime',
  layer: '死信队列是隔离区不是垃圾桶——只进不出的兜底等于没有兜底',
  part: 'master',
  chapterId: 'messaging',
  order: 3,
  typeTags: [
    'messaging',
    'sre',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」电商的通知服务后端，订单通知（短信/Push）由你的消费链路发出。',
    architecture: '订单服务 → MQ(订单通知) → 通知消费者(发短信/Push) —失败重试3次→ 死信队列 DLQ（无消费者、无监控）',
    symptoms: [
      {
        type: 'error',
        title: 'DLQ 积压盘点',
        text: 'DLQ 深度 80,412 条，最早消息入队于 21 天前；期间无任何告警、无人工处理记录。',
      },
      {
        type: 'text',
        title: '业务侧感知',
        text: '三周内陆续有用户投诉"下单了但没收到任何通知"，客服以"系统繁忙"话术打发——投诉量小而分散，未触发升级。',
      },
      {
        type: 'log',
        title: '通道账单归档延期',
        text: '[WARN] SMS billing archive upload retry。',
      },
    ],
    timeline: '前21~18天沿用低基线，17天前消费者升级后跳变；DLQ半年未配监控/owner。',
    impactHint: '条数不自动等于独立用户或失约次数，要按业务ID、重试副本和时效分组。',
  },
  hypotheses: [
    {
      id: 'h-format',
      text: '新版本改了消息格式，旧格式消息反序列化失败被反复拒绝进死信',
      excludeActionId: 'a-sample',
    },
    {
      id: 'h-quota',
      text: '短信通道配额用尽/欠费，发送全部失败进死信',
      excludeActionId: 'a-smslog',
    },
    {
      id: 'h-poison',
      text: '个别"毒消息"（特殊内容触发代码异常）混入，正常消息其实正常',
      excludeActionId: 'a-ratio',
    },
    {
      id: 'h-typo',
      text: 'DLQ 本身配置错误，正常消息被误判失败转入死信',
      excludeActionId: 'a-retry',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '按天统计死信入队速率',
      desc: '影响面：80,000 条是匀速堆积还是某天突增',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '死信入队速率（按天）',
        text: '快照累计80412：前4天历史基线共480；D-17跳变9800；随后16天共70132（约4383/天），合计80412。时间单位与总量一致。\n新增加记录集中新消费者上线后；曲线提示变更，不单凭同日发生断因果。',
      },
    },
    {
      id: 'a-sample',
      name: '抽样死信消息看死因',
      desc: '取不同日期的死信样本，看重试失败的具体异常',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-format',
      ],
      hypotheses: [
        {
          id: 'h-format',
          status: 'up',
        },
      ],
      result: {
        type: 'code',
        title: '死信样本（17天前 vs 现在）',
        text: '不同日期样例为ValidationError: pushTemplateId Field required；旧基线样例是手机号格式无效。JSON文本可正常解析，缺业务必填字段不是JSONDecodeError。样例说明字段校验方向，不代表全部80412条同死因。',
      },
    },
    {
      id: 'a-smslog',
      name: '查短信通道状态与配额',
      desc: '排除通道配额/欠费',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-quota',
      ],
      hypotheses: [
        {
          id: 'h-quota',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '短信通道',
        text: '字段校验失败的494样例未调用短信SDK；同时独立通道配额充足。99.2%发送成功率不等于全部成功，且只覆盖到达发送阶段的消息，不能拿幸存者比例证明字段消息已发。\n噪声收线：账单归档是离线文件，字段校验失败消息尚未调用SDK；配额与请求阶段核验不依赖归档成功。',
      },
    },
    {
      id: 'a-version',
      name: '核对 17 天前发版的 diff',
      desc: '通知消费者与生产者的消息契约变更',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-format',
      ],
      hypotheses: [
        {
          id: 'h-format',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '17天前的 diff',
        text: 'Python消费schema新增pushTemplateId必填，上游旧合法消息无此字段。受控旧消息在旧消费者可处理、新版在字段校验拒绝；仅提供兼容映射或撤销新增必填后同输入通过。\n这支持契约破坏，不以第一个错误日志或单次版本相关性判根因。',
      },
    },
    {
      id: 'a-ratio',
      name: '统计毒消息占比',
      desc: '验证"个别毒消息"假设',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-poison',
      ],
      hypotheses: [
        {
          id: 'h-poison',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '死因占比',
        text: '固定500条按时间/主题分层抽样：494条字段不兼容（98.8%），6条其他历史脏数据（1.2%）。样本不等于全量比例，但足以反证只有孤立内容毒消息；全量清洗仍需逐ID分类。',
      },
    },
    {
      id: 'a-retry',
      name: '核对重试与死信转入配置',
      desc: '重试 3 次的策略是否正常、有无误转',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-typo',
      ],
      hypotheses: [
        {
          id: 'h-typo',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '重试链路',
        text: '本案应用重试计数和x-death/路由审计关联：校验失败后经历配置的3次尝试，最后nack(requeue=false)进入绑定DLX；无TTL/长度上限误触发。RabbitMQ不会无配置自动把重试3次变DLQ。',
      },
    },
    {
      id: 'a-monitor',
      name: '检查 DLQ 的监控与告警',
      desc: '为什么 80,000 条堆了 17 天没人发现',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控盘点',
        text: '主队列有告警，DLQ没有深度/年龄/增长告警、owner或处理SLA。缺少DLQ业务ID对账使该契约失败长期不可见；条数仍需去重和过期语义解释。',
      },
    },
    {
      id: 'a-rollback',
      name: '回滚消费者到兼容版本并恢复消费',
      desc: '【状态变更】先让链路转起来：兼容版本消化增量消息',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '回滚到旧版消费者（无新字段校验），增量通知恢复发送，DLQ 停止增长。\n→ 止血完成。存量 80,000 条死信待清洗后重放。',
      },
    },
    {
      id: 'a-replay',
      name: '清洗存量死信并重放 + 补发通知',
      desc: '【状态变更】按新契约补全字段后重放，用户通知补发',
      cost: 3,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重放结果',
        text: '先只读分类、确认时效与业务幂等，再有界重放。本题全量分组示例：78900条可做字段兼容，其中70000仍需通知、8900已过期不补发；1512条其他脏数据处置，共80412。\n“转出DLQ”不等于80412次短信已成功，也不能不看时效批量轰炸用户。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-format',
      text: '消费者新增必填pushTemplateId破坏旧消息兼容，样例控制对照在字段校验前失败并按配置进入DLQ；DLQ缺监控/归属延长发现时间',
      correct: true,
    },
    {
      id: 'rc-quota',
      text: '短信通道配额耗尽导致发送全部失败',
      correct: false,
    },
    {
      id: 'rc-poison',
      text: '个别毒消息触发代码异常混入队列',
      correct: false,
    },
    {
      id: 'rc-typo',
      text: '重试/死信配置错误，正常消息被误转死信',
      correct: false,
    },
  ],
  expertCost: 8,
  restartActionId: 'a-rollback',
  expertChain: [
    {
      thought: '统一快照和日增口径。',
      update: '480+9800+70132=80412。',
      actionId: 'a-impact',
      why: '1⚡先对账总量，再看变化窗口。',
      conclusion: '排查失败类型。',
    },
    {
      thought: '抽取跨时间样例。',
      update: 'JSON可解析，失败为业务必填校验。',
      actionId: 'a-sample',
      why: '1⚡错误层级须真实，不把缺字段叫JSON语法错。',
      conclusion: '兼容候选升权。',
    },
    {
      thought: '同输入旧新版对照。',
      update: '新版必填拒绝旧合法消息。',
      actionId: 'a-version',
      why: '2⚡对照证明变更机制，不凭日志先后归因。',
      conclusion: '确认字段兼容缺口。',
    },
    {
      thought: '分层抽样核对分布。',
      update: '494/500非孤立毒内容。',
      actionId: 'a-ratio',
      why: '1⚡样本整数与分母要可复算。',
      conclusion: '排除个别毒消息解释。',
    },
    {
      thought: '关联实际SDK调用前后。',
      update: '字段失败未到短信。',
      actionId: 'a-smslog',
      why: '1⚡阶段证据反证配额耗尽，避免幸存者成功率误导。',
      conclusion: '排除配额。',
    },
    {
      thought: '核对每次重试与DLX原因。',
      update: '应用配置3次后拒绝并死信。',
      actionId: 'a-retry',
      why: '1⚡不存在无配置自动3次DLQ保证。',
      conclusion: '排除错误转移。',
    },
    {
      thought: '核对发现与处理归属。',
      update: 'DLQ无告警或owner。',
      actionId: 'a-monitor',
      why: '1⚡解释长期静默需要独立治理证据。',
      conclusion: '影响延长原因闭合。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】同输入版本对照及DLX原因吻合，孤立毒消息、配额和误转移解释均排除，长期静默有监控证据。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '消费者新增必填pushTemplateId破坏旧消息兼容，样例控制对照在字段校验前失败并按配置进入DLQ；DLQ缺监控/归属延长发现时间',
    },
  ],
  lessons: [
    {
      text: 'DLQ是隔离记录，不是自动恢复；深度也不直接等于独立用户、短信数量或承诺失约。',
      principle: '按业务ID、进入原因、去重及有效期分组，配深度/年龄/增长监控、owner和处理时限；重放前验证幂等与时效。',
    },
    {
      text: '跨版本消息要验证实际老消息、新schema和迁移顺序；新增字段是否可选由业务兼容策略决定。',
      principle: '并非所有未知字段都可忽略，严格schema可能拒绝。旧消息可能长期驻留或重放，因此兼容测试不只覆盖新生产者。',
    },
    {
      text: '样本比例和全量条数要分开；500条的98.7%不是整数样本，本题494/500=98.8%。',
      principle: '曲线仅提示变更窗口，控制同输入旧/新消费者才支持因果。通道成功率只覆盖已经调用通道者，不能掩盖更早校验失败。',
    },
  ],
}
