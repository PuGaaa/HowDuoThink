import { DiagnosisCase } from '../../types/case'

/**
 * 第 16 章 · 测试与质量 结业评审（评审现场 L3）
 * 教学点：验证思维——测试策略要经得起本仓库事故史的拷问：重跑文化、覆盖率假象、
 * 隔离缺陷都交过学费；产品思维——质量度量是激励系统，度量什么就得到什么。
 * 专家路径：retrypolicy(2) + quarantinestate(1) + coveragemetric(1) + flakyroot(1) + benefit(1) + minfix(2) = 8⚡︎
 */
export const testingReviewCase: DiagnosisCase = {
  id: 'testing-review',
  title: '测试基建升级方案终审',
  intro: '测试基建升级方案明天终审：自动重试、隔离机制、覆盖率 95%——你的工作是拿一年的事故学费拷问它。',
  domain: 'build',
  layer: '质量度量是激励系统——度量什么就得到什么，包括垃圾',
  part: 'master',
  chapterId: 'testing',
  order: 6,
  typeTags: ['testing', 'process', 'architecture'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」的质量委员会成员，评审会上被指派"挑刺"——用这一年的事故教训拷问方案。',
    architecture: 'CI 流水线(单测 800+ / 集成测试) → 测试基建(重试/隔离/覆盖率/数据工厂) → 发布门禁',
    tag: '评审现场',
    symptoms: [
      {
        type: 'error',
        title: '方案文档 · 关键句',
        text: '① CI 失败自动重试 3 次，全量用例适用\n② flaky 测试进"隔离清单"，跳过阻塞\n③ 行覆盖率门禁从 80% 提到 95%\n④ 数据工厂统一随机造数（提速）',
      },
      {
        type: 'text',
        title: '本团队事故档案（过去一年）',
        text: '舍入 bug 因重跑文化在主干潜伏 3 周 → 线上 87 笔金额差异；\n14 个零断言测试把覆盖率刷到 85% → 线上叠加优惠算错 341 单；\nmock 泄漏导致"单跑绿合跑挂"持续两个月；\n隔离清单现状：23 个用例平均冻结 200 天，无人认领。',
      },
    ],
    timeline: '方案评审明天终审 ｜ 团队季度目标：CI 红灯率降 50% ｜ 四大板块：重试/隔离/覆盖率/数据工厂',
    impactHint: '方案要解决的问题真实存在——但每一条举措，都要先过"上一次同类学费"这一关。',
  },

  hypotheses: [
    { id: 'h-retry', text: '全量自动重试会掩盖确定性失败：不区分"环境抖动"与"真 bug"，重跑文化的教训重演', excludeActionId: 'a-retrypolicy' },
    { id: 'h-quarantine', text: '隔离清单无 owner 无修复期限：隔离沦为"永久删除"的体面说法', excludeActionId: 'a-quarantinestate' },
    { id: 'h-coverage', text: '95% 覆盖率门禁诱导无断言测试：单一指标强化坏激励（覆盖率假象重演）', excludeActionId: 'a-coveragemetric' },
    { id: 'h-flakyroot', text: '只治 flaky 症状不断根因：无种子归因/数据注入基建，flaky 源源不断地生产', excludeActionId: 'a-flakyroot' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '问清方案要解决的真实问题',
      desc: '评审第一问：约束是什么，"红灯少"等于"质量好"吗',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '业务约束盘点',
        text: '真实痛点：CI 红灯 7% 失败率 + "重跑就绿"文化 → 红灯失去可信度。\n团队季度目标：红灯率降 50%。\n关键辨析：目标应是"红灯可信"（红 = 真问题），不是"红灯变少"（藏起来也算变少）。\n→ 约束的确立决定后面每条举措的评判标准——方案的四个板块都要过"可信度"这一关。',
      },
    },
    {
      id: 'a-retrypolicy',
      name: '拷问重试机制的适用边界',
      desc: '全量重试 × 本团队的重跑文化学费——这一条最危险',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-retry'],
      hypotheses: [{ id: 'h-retry', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '"自动重试 3 次，全量适用？"——确认。\n档案对照：舍入 bug（确定性失败）被重跑换数据掩盖 3 周，线上 87 笔差异。\n推演：全量重试 = 把"重跑文化"写进基建——确定性失败会被自动洗白，哨兵集体哑火。\n→ 阻断级缺陷：重试只对"已归因为环境抖动"的失败开放，归因流程必须前置。',
      },
    },
    {
      id: 'a-quarantinestate',
      name: '拷问隔离清单的生命周期',
      desc: '隔离之后谁管、管多久',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-quarantine'],
      hypotheses: [{ id: 'h-quarantine', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '"隔离后谁来修？多久必须修？"——方案未提及。\n现状对照：现有隔离清单 23 例，平均冻结 200 天，3 例对应的功能已下线仍挂着。\n→ 确认缺陷：无 owner 无期限的隔离 = 体面的删除。隔离必须带 owner + 14 天修复期限 + 逾期自动删除并告警。',
      },
    },
    {
      id: 'a-coveragemetric',
      name: '拷问 95% 覆盖率门禁的激励效应',
      desc: '单一指标会诱导什么行为',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-coverage'],
      hypotheses: [{ id: 'h-coverage', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '"95% 怎么达成？"——"大家补测试。"\n档案对照：14 个零断言测试曾把覆盖率刷到 85%（线上叠加优惠炸了 341 单）。\n推演：95% 的硬指标 + 三个月期限 = 断言密度崩塌的完美诱导——团队会生产"能跑但什么都不验证"的测试。\n→ 确认缺陷：覆盖率必须与断言密度、变异分数组成复合指标——度量什么就得到什么。',
      },
    },
    {
      id: 'a-flakyroot',
      name: '拷问 flaky 的根因治理',
      desc: '隔离与重试都在"接住" flaky——生产 flaky 的源头呢',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-flakyroot'],
      hypotheses: [{ id: 'h-flakyroot', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '方案的四个板块都在"下游接住 flaky"（重试/隔离），上游生产呢？\n档案对照：舍入案例的根因基建 = 种子可注入 + 失败自动附随机种子——方案只字未提。\n推演：不修源头，flaky 产量不变，隔离清单与重试预算只会越滚越大。\n→ 确认缺陷：数据工厂必须 seedable，失败自动附归因信息（种子/入参快照）。',
      },
    },
    {
      id: 'a-benefit',
      name: '评估方案框架的价值',
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
        text: '关注测试基建本身是对的；重试/隔离/数据工厂三个机制的"存在"都对，\n缺的是边界（归因）、生命周期（期限）、度量设计（复合指标）。\n→ 评审结论是补边界，不是否决方向。',
      },
    },
    {
      id: 'a-minfix',
      name: '开出最小修正清单',
      desc: '让方案达到可上线的必改项',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-retry', 'h-quarantine', 'h-coverage', 'h-flakyroot'],
      hypotheses: [
        { id: 'h-retry', status: 'confirmed' },
        { id: 'h-quarantine', status: 'confirmed' },
        { id: 'h-coverage', status: 'confirmed' },
        { id: 'h-flakyroot', status: 'confirmed' },
      ],
      result: {
        type: 'text',
        title: '评审结论 · 修正清单',
        text: '① 重试：仅对"归因为环境"的失败开放（归因流程前置，阻断项）\n② 隔离：owner + 14 天修复期限，逾期自动删除并告警\n③ 覆盖率门禁改为复合指标：覆盖率 + 断言密度 + 变异分数\n④ 数据工厂 seedable，CI 失败自动附种子与入参快照\n⑤ "红灯冻结合并"保留——这是可信度制度，不能被重试稀释。\n→ 五项补齐后有条件通过；重试边界为阻断项。',
      },
    },
    {
      id: 'a-approve',
      name: '按原方案批准',
      desc: '【状态变更】不做修改直接过审',
      cost: 3,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '批准结果',
        text: '方案原样过审。三个月后：覆盖率 96%（新增 200 个零断言测试）、隔离清单 47 例、\n一个金额计算的确定性失败被自动重试洗白合入——上一年的学费，白交了。',
      },
    },
    {
      id: 'a-veto',
      name: '整体否决基建升级',
      desc: '【状态变更】方案退回，维持现状',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '否决结果（陷阱动作）',
        text: '基建升级整体退回——重试/隔离/数据工厂的方向价值一并被否。\nCI 红灯文化依旧，团队改进动力受挫。\n→ 复盘点评：四个板块三个方向正确，否决整包是评审的另一种失职。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-retry', text: '核心阻断缺陷：全量自动重试不区分"环境抖动"与"确定性失败"——本团队重跑文化曾放走真 bug（87 笔金额差异），重试必须以归因流程前置', correct: true },
    { id: 'rc-quarantine', text: '真实风险：隔离清单无 owner 无期限，沦为体面的永久删除', correct: false },
    { id: 'rc-coverage', text: '真实风险：95% 单一指标诱导无断言测试，强化坏激励', correct: false },
    { id: 'rc-flakyroot', text: '真实风险：无种子归因基建，flaky 上游持续生产，下游机制越滚越大', correct: false },
  ],

  expertCost: 8,
  restartActionId: 'a-approve',

  expertChain: [
    {
      thought: '评审第一问照例是约束：方案要的是"红灯少"还是"红灯可信"——这两个目标的方案完全不同。',
      update: '约束确立为"红灯可信"：红 = 真问题。四个板块全部过这一关——任何"让红灯消失"而非"让红灯变准"的设计都是嫌疑。',
      actionId: 'a-impact',
      why: '1⚡ 买到设计边界：目标函数定义方案的善恶——"红灯率降 50%"作为 KPI 会诱导藏红灯，"红灯可信"才指向真问题。评审先校准目标，再逐条拷问。',
      conclusion: '评判标准确立 → 逐板块拷问。',
    },
    {
      thought: '先拷问最危险的一条：全量自动重试——本团队在这一条上交过最贵的学费。',
      update: '实锤：全量重试 = 基建化的重跑文化，确定性失败将被自动洗白——舍入案例会重演。阻断级。',
      actionId: 'a-retrypolicy',
      why: '2⚡ 事故档案是评审的弹药库：方案不会自己想起"重跑文化放走真 bug"的教训——评审者的职责就是把学费摆到桌面上，逐条对照新方案有没有重建同一个坑。',
      conclusion: '重试边界确认为阻断项。',
    },
    {
      thought: '隔离与覆盖率两问并查：一个问生命周期，一个问激励效应——它们是"接住问题"与"度量问题"的两端。',
      update: '隔离无期限（23 例冻 200 天）、95% 单指标（零断言教训）——两个缺陷都确认，都有本团队前科。',
      actionId: 'a-quarantinestate',
      why: '1⚡ 评审拷问的节奏：每条举措问两句——"之后呢"（生命周期）与"会诱导什么"（激励效应）。机制的存在价值取决于它的边界与它塑造的行为。',
      conclusion: '两项确认 → 源头治理追问。',
    },
    {
      thought: '最后一问源头：重试和隔离都在下游接 flaky——上游生产 flaky 的源头，方案管了吗。',
      update: '确认缺失：无 seedable 数据工厂、失败无归因信息——下游机制会越滚越大，治标不治本。',
      actionId: 'a-flakyroot',
      why: '1⚡ 系统思维收口：接住问题的机制越多，越容易忽略生产问题的源头——预算有限时，源头治理（种子/归因基建）的优先级高于下游扩容。',
      conclusion: '四项确认 → 评估保留价值 → 开清单。',
    },
    {
      thought: '框架方向正确（三机制都对、缺边界），修正清单五项开列、重试边界为阻断——评审落笔。停止追问。',
      update: '停止。',
      actionId: '',
      why: '【评审停止规则】四板块逐条拷问完毕（重试边界/隔离生命周期/覆盖率激励/源头治理），每项都有本团队事故档案背书——继续追问不会发现新的结构性缺陷。',
      conclusion: '有条件通过：归因前置为阻断项。检查单：重试先归因、隔离有期限、度量用复合、源头要治理。',
    },
  ],

  lessons: [
    {
      text: '自动重试必须以归因前置：不区分"环境抖动"与"确定性失败"的全量重试，是把重跑文化写进基建——真 bug 会被自动洗白。',
      principle: '验证思维：重试的边界 = 已归因为环境的失败。归因流程（固定输入复现 → 分类）必须先于重试机制存在，否则 CI 的红灯哨兵集体哑火——这是用 87 笔线上损失换来的排序。',
    },
    {
      text: '质量度量是激励系统：95% 覆盖率硬指标会诱导零断言测试——度量什么就得到什么，包括垃圾。',
      principle: '产品思维：单一质量指标必然被"优化"，必须用复合指标互为制衡（覆盖率 + 断言密度 + 变异分数）。设定度量目标前先问"团队会用什么方式达成它"——如果答案里有你不想要的行为，改度量而不是加监管。',
    },
    {
      text: '隔离清单无 owner 无期限 = 体面的删除：下游接住问题的机制越多，越要追问上游生产的源头。',
      principle: '系统思维：治理措施的三要素——边界（适用条件）、生命周期（owner + 期限）、源头（生产速率）。flaky 的治理预算优先投给源头（种子/归因基建），下游隔离与重试只是止血——否则清单越滚越大，测试套件慢性死亡。',
    },
  ],
}
