import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const hotReloadGapCase: DiagnosisCase = {
  id: 'hot-reload-gap',
  title: '配置中心显示已推送，功能用的还是旧值',
  intro: '配置推送全部ACK，风控决策仍使用旧阈值。送达之后还要核对哪些环节？',
  domain: 'deploy',
  layer: '推送解决"送达"，不解决"生效"——热更新需要刷新语义',
  part: 'engineer',
  chapterId: 'config-boot',
  order: 3,
  typeTags: [
    'config',
    'race',
    'verification',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」风控链路的负责人，大促放宽阈值的操作在大促当天"静默失败"了。',
    architecture: '配置中心(推送+ACK 回执) → 风控服务(@Value 注入 risk.threshold) → 风控决策',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '诡异的三处对质',
        text: '配置中心：risk.threshold = 80（放宽后）✓\n推送回执：12/12 实例 ACK ✓（上次 config-drift 事故装的回执机制在岗）\n运行时：实例日志决策记录里阈值仍是 50 ✗',
      },
      {
        type: 'text',
        title: '影响',
        text: '大促高峰按 50 的旧阈值拦截新用户下单 25 分钟——运营在配置中心"明明改成功了"。',
      },
      {
        type: 'log',
        title: '指标投递重试',
        text: '[WARN] metrics remote_write retry=1；阈值推送窗口也出现监控投递告警。',
      },
    ],
    timeline: '阈值推送 10:00（ACK 全绿）｜ 拦截异常 10:25 被运营发现 ｜ 注入代码一年未动 ｜ 上次 config-drift 整改后"送达"已有保障',
    impactHint: '上次修的是"送达"，这次断在"生效"——收到消息的字段，为什么没有换心？',
  },
  hypotheses: [
    {
      id: 'h-frozen',
      text: '@Value 启动期注入：字段随 Bean 创建固化，推送只更新 Environment 不回写字段——热更新缺刷新语义',
      excludeActionId: 'a-injectmode',
    },
    {
      id: 'h-usagesite',
      text: '使用点在启动期缓存了阈值（Bean 内已读死）',
      excludeActionId: 'a-usageaudit2',
    },
    {
      id: 'h-bizcache',
      text: '业务自建缓存缓存了阈值（TTL 长）',
      excludeActionId: 'a-bizcache',
    },
    {
      id: 'h-wrongkey',
      text: '又是键不匹配（config-typo 同款）',
      excludeActionId: 'a-keycheck',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '三处对质：中心、回执、运行时',
      desc: '影响面：送达已保障，断点后移',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '三处对质',
        text: '中心值 80 ✓、ACK 12/12 ✓、运行值 50 ✗\n与上次 config-drift 的差别：这次"送达链"是通的（回执在岗）——\n断点后移到"送达之后"：值到了应用手里，但没进那个字段。\n→ 排查从"传输层"转向"注入与读取层"。',
      },
    },
    {
      id: 'a-injectmode',
      name: '审计注入模式：@Value 的生效时机',
      desc: '字段是怎么拿到 50 的、推送后它还会不会变',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-frozen',
        'h-wrongkey',
      ],
      hypotheses: [
        {
          id: 'h-frozen',
          status: 'confirmed',
        },
        {
          id: 'h-wrongkey',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '注入模式解剖',
        text: '本案自定义Nacos监听器只替换MapPropertySource；不发布刷新事件，也未调用ContextRefresher。\n中心与代码精确键均为risk.threshold；Environment.getProperty=80，普通单例Bean中@Value字段仍50。\n同构对照：把Bean类标注@RefreshScope，并显式触发受控ContextRefresher.refresh()后，重新取Bean读取80。@RefreshScope不标在字段上。不是所有Nacos集成都有本案行为。\n噪声收线：该WARN来自指标上报器，配置监听ACK与Environment新值均已到达，不参与Bean字段回注。',
      },
    },
    {
      id: 'a-usageaudit',
      name: '全仓审计热调参数的注入方式',
      desc: '还有多少个"本该热更却固化"的字段',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '注入审计',
        text: '全仓 @Value 注入的可调参数：9 处（阈值×2/开关×3/限速×2/文案×2）。\n其中 5 处是大促运营要热调的（阈值/开关/限速）——全部固化，\n意味着另外 4 处也是"以为能热调其实要重启"的隐形雷。\n→ 审计把单点问题升级为"注入语义无约定"的体系问题。',
      },
    },
    {
      id: 'a-usageaudit2',
      name: '核对阈值的使用点',
      desc: '排除"使用点缓存了值"',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-usagesite',
        'h-bizcache',
      ],
      hypotheses: [
        {
          id: 'h-usagesite',
          status: 'excluded',
        },
        {
          id: 'h-bizcache',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '使用点核对',
        text: '决策调用链每次直接读取该Bean的threshold字段；无第二个启动快照字段，也无业务缓存包装。字段仍50已经足以解释决策结果；排除使用点二次缓存和业务TTL。',
      },
    },
    {
      id: 'a-bizcache',
      name: '核对业务层缓存',
      desc: '排除业务缓存',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-bizcache',
      ],
      hypotheses: [
        {
          id: 'h-bizcache',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '缓存核对',
        text: '无业务缓存包装该阈值。\n→ 排除业务缓存。',
      },
    },
    {
      id: 'a-keycheck',
      name: '核对键名一致性',
      desc: '排除 config-typo 同款',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-wrongkey',
      ],
      hypotheses: [
        {
          id: 'h-wrongkey',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '键名核对',
        text: '中心与代码键均为risk.threshold，Environment中可直接读到80。键名不匹配已排除；不能仅凭声称绑定校验在岗替代这个证据。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急滚动重启 12 实例让配置生效',
      desc: '【状态变更】逐实例重启读取新配置',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重启结果',
        text: '8 分钟完成，阈值生效。\n代价：滚动期间新旧阈值并存（一半实例 50、一半 80——风控口径漂移）；\n且大促当天重启本身就是风险动作。\n→ 止血有效但代价高：热调参数的存在意义就是"不重启"。',
      },
    },
    {
      id: 'a-fixscope',
      name: '修复：热调参数迁移刷新语义',
      desc: '【状态变更】5 处热调参数迁 @ConfigurationProperties + @RefreshScope；或统一 DynamicConfig 直读',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '对需要热调的Bean类/工厂方法配置@RefreshScope，并让监听器在成功更新Environment后触发受控刷新。启动期参数明确标注重启生效。\n同构回归记录中心值、Environment值、实际决策字段及收敛时延。若使用Actuator刷新端点，必须保持鉴权；标注作用域不等于自动收到刷新事件。',
      },
    },
    {
      id: 'a-fixdivide',
      name: '沉淀：配置两类登记表',
      desc: '【状态变更】每个配置项声明更新语义：启动期（改了要重启）/ 热更期（改了即时生效）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '两类登记',
        text: '登记表两列：启动期参数（重启生效，写明）｜ 热更期参数（RefreshScope，写明）。\n运营界面同步标注："此配置改动需重启"或"即时生效"——预期管理做在改之前。',
      },
    },
    {
      id: 'a-fixdrill',
      name: '沉淀：热更演练进发布检查',
      desc: '【状态变更】每个热更键的变更后断言：运行值 5s 内更新（抽样 3 实例）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '演练断言',
        text: '热更键变更 SOP：改后抽样断言运行值 5s 内变化，不变化即告警回滚配置。\n——热更新的"生效"与发布的"上线"一样，都要被断言，不能被假设。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-frozen',
      text: '本案监听器只更新Environment，无刷新事件；普通单例Bean的@Value字段仍为启动值50，决策未读取到新阈值80',
      correct: true,
    },
    {
      id: 'rc-usagesite',
      text: '使用点缓存了启动期值（使用点直读字段，非根因）',
      correct: false,
    },
    {
      id: 'rc-bizcache',
      text: '业务层缓存了阈值',
      correct: false,
    },
    {
      id: 'rc-wrongkey',
      text: '配置键不匹配（config-typo 同款，已被绑定校验防住）',
      correct: false,
    },
  ],
  expertCost: 4,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '先核对送达和决策差异。',
      update: '中心80、ACK全绿、决策50。',
      actionId: 'a-impact',
      why: '1⚡ACK只证明收件，不能据此证明字段刷新。',
      conclusion: '核对注入及实际读取。',
    },
    {
      thought: '同一实例核对Environment、字段及监听器。',
      update: 'Environment80而字段50；显式刷新Bean后读80。',
      actionId: 'a-injectmode',
      why: '2⚡限定本案集成方式并做同构对照，避免把框架行为说成无条件规律。',
      conclusion: '确认刷新缺失，排除键错。',
    },
    {
      thought: '跟踪一次真实读取调用链。',
      update: '无第二份启动快照，无业务缓存。',
      actionId: 'a-usageaudit2',
      why: '1⚡直接读取链路排除两个缓存候选，避免全仓审计代替本局证据。',
      conclusion: '其余候选排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】Environment与字段差异及刷新对照已确认，键错、二次缓存和业务缓存均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '本案监听器只更新Environment，无刷新事件；普通单例Bean的@Value字段仍为启动值50，决策未读取到新阈值80',
    },
  ],
  lessons: [
    {
      text: '推送解决"送达"，不解决"生效"：@Value 启动期固化，Environment 更新不回写字段——热更新需要刷新语义（@RefreshScope/直读）。',
      principle: '程序设计：配置体系三层语义——送达（传输+回执）、绑定（键匹配）、刷新（运行值跟随）。三者缺一都表现为"改了没生效"：config-drift 修第一层，config-typo 修第二层，本关修第三层——学费分层交，体系分层建。',
    },
    {
      text: '配置分两类登记：启动期参数（改了要重启）与热更期参数（改了即时生效）——每项显式声明更新语义。',
      principle: '流程设计：运营界面对每个配置项标注生效方式——预期管理做在修改之前。个案审计（9 处参数 5 处隐形雷）升级为登记表制度：凡是"运营以为能热调"的参数，必须在代码里真的支持热调。',
    },
    {
      text: '热更新与发布同权：热更键变更后断言"运行值 5s 内更新"——生效要被验证，不能被 ACK 假设。',
      principle: '验证思维：ACK 证明"应用收到了"，不证明"字段变了"——后者只有运行值断言能证明。热更演练（抽样 3 实例）让"静默失败"的窗口从 25 分钟压到 5 秒。',
    },
  ],
}
