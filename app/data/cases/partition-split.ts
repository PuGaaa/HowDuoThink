import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const partitionSplitCase: DiagnosisCase = {
  id: 'partition-split',
  title: '消费者扩容后，同一订单的状态乱了序',
  intro: 'Kafka扩分区后，扩容前尚未处理的旧事件与扩容后新事件并行完成。按同一业务key核对分区、offset和处理版本。',
  domain: 'runtime',
  layer: '保序承诺的边界 = 分区拓扑——改分区数就是重排所有 key 的家',
  part: 'master',
  chapterId: 'messaging',
  order: 5,
  typeTags: [
    'messaging',
    'capacity',
    'race',
  ],
  difficulty: 3,
  scene: {
    role: '你是「鲜到家」订单事件总线的负责人，一次例行的消费者扩容撕碎了保序承诺。',
    architecture: '订单服务 → 订单事件 topic(原 12 分区, key=orderId, 分区内 FIFO) → 状态服务(按事件顺序维护订单状态机) ｜ 大促扩容: 分区 12→24, 消费者 6→12',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '状态机错乱告警',
        text: '状态服务告警：4.1% 订单出现非法状态跃迁——"已发货"订单收到"支付成功"事件（应忽略）被重新置为已支付；\n部分订单"创建"事件晚于"取消"到达， resurrect 已取消订单。',
      },
      {
        type: 'text',
        title: '时间线',
        text: '14:00扩分区12→24；旧p7仍有14:00前支付事件积压，14:02新发货事件入p19并先处理，14:06旧支付才到。跨切换序列出错，不是所有扩容后新事件之间都无序。',
      },
      {
        type: 'log',
        title: '控制台预览失败',
        text: '[WARN] topic console diagram preview unavailable。',
      },
      {
        type: 'log',
        title: '旧审计格式告警',
        text: '[WARN] producer audit formatter deprecated。',
      },
      {
        type: 'log',
        title: '指标外送重试',
        text: '[WARN] consumer metrics push retry。',
      },
    ],
    timeline: '12分区本就可分给最多12个该组消费者，6→12消费者不要求先扩到24；扩分区是另一次拓扑变更，需独立评审。',
    impactHint: '扩容前正常、扩容后乱序——"同一 key 同一分区"的承诺，在分区数变化的那一刻还成立吗？',
  },
  hypotheses: [
    {
      id: 'h-resplit',
      text: '分区数变化导致 key 重排：同一 orderId 的新事件按新 hash 落到新分区，与旧分区内的事件并行——跨分区无序',
      excludeActionId: 'a-rebalanceaudit',
    },
    {
      id: 'h-consumer',
      text: '即使同一分区由一个串行worker处理，单纯增加同组消费者也把该分区offset倒序',
      excludeActionId: 'a-consumerspeed',
    },
    {
      id: 'h-producer',
      text: '扩容期间相同新事件被生产者双发到新旧两个位置，重复发送才是原因',
      excludeActionId: 'a-producercheck',
    },
    {
      id: 'h-bug',
      text: '生产事件本来就在同一分区offset倒序，与扩容跨分区无关',
      excludeActionId: 'a-ordercheck',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '解剖乱序订单的事件落位',
      desc: '影响面：乱序事件在哪个分区、与旧事件的分区关系',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '乱序样本解剖（order#88102）',
        text: '同keyK的支付事件14:00前写p7/offset801，仍积压；14:02发货按新分区数写p19/offset5且先完成，14:06才处理p7旧事件。同事件ID无双发。跨分区offset不能直接比较大小，应关联实体业务序列。\n噪声收线：分区/offset来自实际记录元数据，不依赖控制台示意图渲染。',
      },
    },
    {
      id: 'a-rebalanceaudit',
      name: '审计分区扩容的语义',
      desc: 'hash 域变化审计：12→24 对每个 key 意味着什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-resplit',
      ],
      hypotheses: [
        {
          id: 'h-resplit',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: 'hash 域审计',
        text: '本案显式key分区算法positiveHash(key)%N；一个样本hash余24为19，则余12为7。均匀hash下12→24约一半落点不变、一半变为旧p+12，不是所有key都换家。\n旧记录不会自动搬迁，新记录按新N定位，两分区各自有序仍无跨分区先后保证；该实体跨切换序列可乱序，不代表一定每次都会乱。',
      },
    },
    {
      id: 'a-ordercheck',
      name: '核对状态服务的乱序防御',
      desc: '状态机有没有版本号/时间戳防御',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-bug',
      ],
      hypotheses: [
        {
          id: 'h-bug',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '防御审计',
        text: '权威业务序列先支付后发货；旧p7与新p19各自offset内顺序正确。状态投影按到达覆盖、无版本判断是已有放大缺陷，不能说它完全无bug；本假设“源序列同分区本已倒序”被审计排除。',
      },
    },
    {
      id: 'a-consumerspeed',
      name: '核对消费者处理速度差',
      desc: '排除消费速度差导致的常态乱序',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-consumer',
      ],
      hypotheses: [
        {
          id: 'h-consumer',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '速度核对',
        text: '实际每分区单串行worker，p7内部按offset800→801→802，p19按4→5→6处理；增加同组消费者改变分配，不会自动将单分区offset逆序。独立分区速度差会暴露跨分区先后缺口，是传播条件而不是“同分区倒序”。\n噪声收线：分区内offset顺序取自处理提交审计；指标外送不修改消费顺序。',
      },
    },
    {
      id: 'a-producercheck',
      name: '核对生产端路由实例',
      desc: '排除新旧分区数并存',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-producer',
      ],
      hypotheses: [
        {
          id: 'h-producer',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '生产端核对',
        text: '新事件ID发货F4在Broker仅一条p19记录，所有实例路由元数据已为24；支付P3只在切换前p7。排除相同新事件双发，不把旧事件未搬迁叫生产者双写。\n噪声收线：审计字段虽标记旧格式，事件ID和单一Broker落点仍完整；格式告警不等于业务事件双发。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急回退分区数到 12',
      desc: '【状态变更】topic 分区 24→12 回退',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回退结果（陷阱动作）',
        text: 'Kafka标准分区管理不能把已增加分区直接减回12；该调用会被拒绝，不是自动第二次重排。若删除/新建主题或改自定义路由则是另一次迁移，存在数据和顺序风险，不能把它冒充简单回滚。',
      },
    },
    {
      id: 'a-fixguard',
      name: '修复：状态服务事件防御 + 存量修复',
      desc: '【状态变更】事件携带版本号+状态机单调校验；受影响订单按事件时间重放修复',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '若消息为完整状态快照，按权威单调版本原子更新投影可拒绝旧快照。若为必须依次执行的增量事件，不能遇到v4就丢v2/v3；需要缺口检测、有序补齐和各副作用幂等。\n修复从源事件序列重放，不能单靠跨机器时间戳排序；取消/重开也由业务版本而非状态枚举大小判断。',
      },
    },
    {
      id: 'a-fixtopo',
      name: '沉淀：分区拓扑变更纪律',
      desc: '【状态变更】分区数冻结制度：保序 topic 扩容 = 新 topic 双写迁移，禁止原地改分区数',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '拓扑纪律',
        text: '6→12消费者可先在既有12分区完成；确需更多分区时设计切换边界、旧积压处理与版本/缺口策略。新topic迁移或按实体路由epoch都是选择，但双写本身不保证保序，需明确同事件去重与切换屏障。',
      },
    },
    {
      id: 'a-fixdoc',
      name: '沉淀：保序承诺文档化',
      desc: '【状态变更】事件总线文档明确承诺边界：同 key 同分区内 FIFO；跨分区/跨拓扑变更不保序，消费端必须自带防御',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '承诺边界',
        text: '事件总线契约文档新增"保序的边界"：\n✔ 同 key 同分区内严格 FIFO\n✘ 跨分区不保序　✘ 拓扑变更窗口不保序　✘ 重放/迁移不保序\n消费端义务：带版本号防御乱序——承诺写清楚，防御才有人做。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-resplit',
      text: '按hash%N的Kafka分区数12→24，使部分key新事件改落p+12，而旧积压仍在旧分区；跨分区并行完成改变实体顺序，按到达覆盖投影放大错误',
      correct: true,
    },
    {
      id: 'rc-consumer',
      text: '消费者处理速度差导致跨分区常态乱序',
      correct: false,
    },
    {
      id: 'rc-producer',
      text: '扩容期间生产端新旧分区数并存双写',
      correct: false,
    },
    {
      id: 'rc-bug',
      text: '状态服务自身状态机逻辑 bug',
      correct: false,
    },
  ],
  expertCost: 6,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '追踪同key跨切换的两条记录。',
      update: '旧p7积压支付，新p19发货先完成。',
      actionId: 'a-impact',
      why: '1⚡跨分区offset不比较大小，关联业务序列。',
      conclusion: '核对路由函数。',
    },
    {
      thought: '复算hash取模与记录位置。',
      update: '部分key从p7换p19，旧记录未搬。',
      actionId: 'a-rebalanceaudit',
      why: '2⚡半数重映射是条件结论，不是所有key必乱序。',
      conclusion: '确认跨分区边界。',
    },
    {
      thought: '核对分区内部串行处理。',
      update: '各自offset正序。',
      actionId: 'a-consumerspeed',
      why: '1⚡增加消费者不自动倒置同分区offset。',
      conclusion: '排除同分区倒序。',
    },
    {
      thought: '核对新事件唯一入队位置。',
      update: '无双发，新路由一致。',
      actionId: 'a-producercheck',
      why: '1⚡旧积压不等于新事件重复生产。',
      conclusion: '排除双写原因。',
    },
    {
      thought: '核对权威实体序列和投影。',
      update: '源顺序正确，投影无版本是放大器。',
      actionId: 'a-ordercheck',
      why: '1⚡排除独立源序列错，不把真实投影缺陷抹掉。',
      conclusion: '机制闭合。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】取模、旧积压与跨分区完成顺序一致，单分区倒序、新事件双发和源业务序列错误均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '按hash%N的Kafka分区数12→24，使部分key新事件改落p+12，而旧积压仍在旧分区；跨分区并行完成改变实体顺序，按到达覆盖投影放大错误',
    },
  ],
  lessons: [
    {
      text: '12→24约半数均匀hash换分区，不是所有key；旧记录不搬，新记录按新N定位。',
      principle: '保序条件包括实体路由、生产与处理顺序。增加同组消费者与增加分区数是两种操作，12分区本就容纳12个活跃消费者。',
    },
    {
      text: 'Kafka通常不能直接缩减已有主题分区；删建主题或改路由是新迁移，不能包装成安全回退。',
      principle: '迁移要明确切换边界、旧积压、去重和顺序缺口。新topic双写本身并不保证同一实体在两路间有序。',
    },
    {
      text: '完整快照可按版本拒绝旧值，增量事件可能必须补齐每一步；不能一律丢seq≤last就承诺业务正确。',
      principle: '重放以权威实体序列/版本核对，墙钟不代替因果。副作用幂等与状态投影更新是不同边界。',
    },
  ],
}
