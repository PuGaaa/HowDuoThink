import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const contractReviewCase: DiagnosisCase = {
  id: 'contract-review',
  title: '开放平台接口契约规范终审',
  intro: '开放平台规范即将生效。用给定教学事故和消费方约束检查条款，判断当前草案缺失的共同发布门禁。',
  domain: 'build',
  layer: '把兼容、废弃、限流与语义承诺转成可执行门禁，而非仅给条款命名',
  part: 'engineer',
  chapterId: 'contract',
  order: 6,
  typeTags: [
    'contract',
    'architecture',
    'process',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」开放平台的架构委员会成员，评审会上被指派"挑刺"——用一年的接口事故学费拷问规范。',
    architecture: '开放平台(300 注册应用) → 契约规范 v1(五板块：版本/废弃/错误码/限流/兼容) → 全部对外接口',
    tag: '评审现场',
    symptoms: [
      {
        type: 'error',
        title: '规范文档 · 关键句',
        text: '① 版本策略：URL 版本号 /v{n}\n② 废弃流程：邮件通知 + 30 天缓冲\n③ 错误码：三段式（模块-类型-序号）\n④ 限流：统一 1000 QPS\n⑤ 兼容性："尽量兼容旧调用方"',
      },
      {
        type: 'text',
        title: '教学事故档案',
        text: 'api-sunset：v2 下线邮件通知，2,987 单投诉（全口径盲区）\nrequired-field：请求加必填字段，老 App 全体 400（兼容铁律）\nenum-drift：重构对调枚举语义，1,204 单错误路由（语义级样例验证缺失）\ndoc-drift：文档漂移三个月，对接失败（文档与实现无对账）',
      },
      {
        type: 'log',
        title: '评审附件告警',
        text: '[WARN] appendix diagram preview unavailable；评审页附件预览失败。',
      },
    ],
    timeline: '规范评审明天终审 ｜ 通过后立即生效于全部对外接口 ｜ 五板块：版本/废弃/错误码/限流/兼容',
    impactHint: '四份教学档案用来检验条款能否执行，并不声称它们是真实原始事故。',
  },
  hypotheses: [
    {
      id: 'h-compat',
      text: '共同缺陷是承诺无执行门禁：兼容、废弃、容量及语义均缺验证者和通过标准',
      excludeActionId: 'a-compatcheck',
    },
    {
      id: 'h-sunset',
      text: '唯一问题是30天太短，只延长到90天即可解决全部发布风险',
      excludeActionId: 'a-sunsetcheck',
    },
    {
      id: 'h-rate',
      text: '统一1000QPS本身足够，只需提高到2000即可安全发布全部接口',
      excludeActionId: 'a-ratecheck',
    },
    {
      id: 'h-errorcode',
      text: '三段式码的外观能自动保证含义兼容，无需消费方样例',
      excludeActionId: 'a-errorcheck',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '确立评审的判据：每条条款过"事故关"',
      desc: '影响面：规范的五板块逐一对照四批事故学费',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '判据确立',
        text: '规范的价值不是"写得全"，是"拦得住"——判据：每条条款能否拦截一次已发生的事故？\n对照表：①版本策略 ↔ 契约破坏类　②废弃流程 ↔ api-sunset　③错误码 ↔ enum-drift/doc-drift\n④限流 ↔ rate-limit-passthrough　⑤兼容 ↔ required-field/mixversion\n→ 五板块五道关，逐一拷问。\n噪声收线：正文五项条款的原始文本均已取得并确认，缺失的只是布局示意图，不改变本题条款内容或执行门槛。',
      },
    },
    {
      id: 'a-compatcheck',
      name: '拷问兼容条款："尽量兼容"是什么',
      desc: '最核心的阻断缺陷：兼容必须可执行',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-compat',
      ],
      hypotheses: [
        {
          id: 'h-compat',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '兼容条款只写“尽量”，没有验证者、旧消费者矩阵和破坏判据。required-field教学档案中新增必填不会被此条款拦截。\n其他板块同样缺执行门槛：废弃无消费确认、限流无容量依据、错误码无语义样例。共同缺陷是可执行验证缺失，不是某一个常量选错。',
      },
    },
    {
      id: 'a-sunsetcheck',
      name: '拷问废弃流程条款',
      desc: '邮件通知 + 30 天 = api-sunset 的原样复刻',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-sunset',
      ],
      hypotheses: [
        {
          id: 'h-sunset',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '即使把30改90天，未通知到的活跃调用方、缺失的全口径用量审计、没有分批停用/回退仍不改变。延长日历不能代替确认和迁移，排除“只改天数解决全部风险”。',
      },
    },
    {
      id: 'a-ratecheck',
      name: '拷问限流条款',
      desc: '统一 1000 QPS = 容量契约一刀切',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-rate',
      ],
      hypotheses: [
        {
          id: 'h-rate',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '两个教学接口实测可持续容量分别600与3000QPS，草案没有并发/延迟目标和每应用份额。统一2000仍会压垮前者，排除“调高同一阈值即可”。需在容量以下保留预算并定义429与重试约束。',
      },
    },
    {
      id: 'a-errorcheck',
      name: '拷问错误码条款',
      desc: '三段式设计好——但码对含义错怎么办',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-errorcode',
      ],
      hypotheses: [
        {
          id: 'h-errorcode',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '三段式只定义码的外观；enum-drift样例即使结构不变，PAID/SHIPPED含义仍可交换。排除“格式自动保证语义”，需旧消费方的场景样例与兼容检查。',
      },
    },
    {
      id: 'a-benefit',
      name: '评估规范框架的价值',
      desc: '方向对不对——别把 baby 和洗澡水一起倒掉',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '收益评估',
        text: '五板块框架完整（版本/废弃/错误码/限流/兼容），URL 版本号策略合理，\n三段式错误码设计优秀——框架值得保留，条款需要补强。',
      },
    },
    {
      id: 'a-minfix',
      name: '开出最小修正清单',
      desc: '让规范达到可生效状态的必改项',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '评审结论 · 修正清单',
        text: '建议补四项门禁：兼容矩阵与变更分级、全口径用量与消费确认后分批废弃、按API容量预算限流、错误码语义样例。每项写执行者和通过标准，补齐并验收后再批准；本动作不替代前面的独立审查证据。',
      },
    },
    {
      id: 'a-approve',
      name: '按原稿批准规范生效',
      desc: '【状态变更】不做修改直接发布生效',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '批准结果',
        text: '按原稿批准会留下当前已证实的门禁缺口；后续事故类型和数量取决于实际变更，不能承诺三个月必然重演四起事故。',
      },
    },
    {
      id: 'a-veto',
      name: '整体否决，规范退回重写',
      desc: '【状态变更】规范作废，团队从零重写',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '否决结果（陷阱动作）',
        text: '整体重写可能延长治理空窗并丢失现有可用结构；没有数据承诺一定耗时三个月。优先按已确认缺口开出可验收修正清单。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-compat',
      text: '规范仅陈述承诺，没有验证者、通过标准和发布门禁；兼容、废弃、容量及错误语义的承诺均无法被证明兑现',
      correct: true,
    },
    {
      id: 'rc-sunset',
      text: '只延长废弃等待天数即可解决全部风险',
      correct: false,
    },
    {
      id: 'rc-rate',
      text: '统一提高QPS阈值即可确保全部API安全',
      correct: false,
    },
    {
      id: 'rc-errorcode',
      text: '错误码外观格式自动保证业务语义兼容',
      correct: false,
    },
  ],
  expertCost: 6,
  restartActionId: 'a-approve',
  expertChain: [
    {
      thought: '先确定规范审查范围。',
      update: '五板块各自要回答承诺如何兑现。',
      actionId: 'a-impact',
      why: '1⚡先建审查框架，避免逐句润色却不检查执行。',
      conclusion: '核对共同门禁缺口。',
    },
    {
      thought: '审查兼容条款与四板块执行条件。',
      update: '没有验证者和通过标准，共同缺陷成立。',
      actionId: 'a-compatcheck',
      why: '2⚡把规范措辞映射到可执行发布条件，确认主缺陷。',
      conclusion: '确认门禁缺失。',
    },
    {
      thought: '反验只延长期限的方案。',
      update: '等待更久不补审计和消费确认。',
      actionId: 'a-sunsetcheck',
      why: '1⚡用保持其他条件不变的反例排除单常量方案。',
      conclusion: '排除只改天数。',
    },
    {
      thought: '以两接口容量反验统一阈值。',
      update: '2000大于600，提升阈值仍不安全。',
      actionId: 'a-ratecheck',
      why: '1⚡容量给定值使一刀切方案可被直接反驳。',
      conclusion: '排除只加QPS。',
    },
    {
      thought: '用语义交换样例反验格式保证。',
      update: '格式未变仍可改变含义。',
      actionId: 'a-errorcheck',
      why: '1⚡结构正确与语义兼容需要独立验证。',
      conclusion: '三个替代解释全部排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】共同门禁缺失成立，延长期限、统一加阈值和格式保证三个替代方案均被具体反例排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '规范仅陈述承诺，没有验证者、通过标准和发布门禁；兼容、废弃、容量及错误语义的承诺均无法被证明兑现',
    },
  ],
  lessons: [
    {
      text: '规范的价值不是"写得全"，是"拦得住"：每条条款都要过"它能不能拦截那次已发生的事故"这一关。',
      principle: '把谁执行、验证样例、通过标准和失败时禁止发布写进条款。样例和容量数字是本题教学给定条件，不能包装成未经验证的生产证据。',
    },
    {
      text: '教学事故可用来反验规范是否有拦截能力；它们是已知反例，不能替代当前API的负载与消费者验证。',
      principle: '沉淀思维："学费回填"机制让规范成为活文档：每次对外事故，规范必须新增或修订对应条款。规范与事故档案的对照表（条款 ↔ 学费）是团队最贵的资产——它证明每一条都不是拍脑袋。',
    },
    {
      text: '评审的产出是修正清单，不是否决票：五板块四个方向正确——把好的框架连同缺陷一起否掉，是评审的另一种失职。',
      principle: '框架可保留与缺陷需修正可以同时成立。评审结果给出必改项、验证者和通过标准；是否重写由缺口范围决定，不以未经核实的重写三个月作为论据。',
    },
  ],
}
