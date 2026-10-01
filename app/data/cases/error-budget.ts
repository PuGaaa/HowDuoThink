import { DiagnosisCase } from '../../types/case'

/**
 * B4-4 · observability L3（决策现场皮肤）
 * 主训思维：产品思维（错误预算不是冻结令，是优先级信号——冻结的正确姿势是"冻结需求，不冻结修复"）
 * 次训思维：沉淀思维（错误预算的消耗结构分析：69% 来自重复发布的回归 bug）
 * 真实原型：SLO 99.9% 错误预算本月耗尽，业务方要求继续上线新功能
 * 情绪兽设计：垂耳兔（沮丧）——"稳定性指标在惩罚我"
 * 检查单：思维型 3 + 知识型 1
 */
export const errorBudgetCase: DiagnosisCase = {
  id: 'error-budget',
  title: '错误预算烧完了：冻结还是继续',
  intro: '结算服务 SLO 99.9%（月错误预算 43 分钟），本月已消耗 47 分钟——超出预算。SRE 平台提出冻结新功能上线一周。业务方：大促在即，不能停。',
  domain: 'runtime',
  layer: '错误预算不是冻结令，是优先级信号——正确解法是分析消耗结构，针对性止血',
  part: 'master',
  chapterId: 'observability',
  order: 6,
  typeTags: ['observability', 'sre'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」的平台工程负责人。SRE 平台的自动冻结通知刚发到群里——业务方秒回"大促在即，不能停"。你需要在一个小时内给出决策和依据。',
    architecture: '结算服务(SLO 99.9%, 月错误预算 43 分钟) → 错误预算政策(耗尽即冻结新功能)',
    tag: '决策现场',
    symptoms: [
      {
        type: 'error',
        title: '错误预算消耗',
        text: 'SLO 99.9%（可用性）→ 月错误预算 = 43.2 分钟（43200 分钟 × 0.1%）\n本月实际消耗：47.3 分钟（超支 9%）\n消耗结构：4 次发布回归占 32 分钟（68%）｜ 1 次基础设施抖动占 9 分钟（19%）｜ 2 次第三方抖动占 6.3 分钟（13%）',
      },
      {
        type: 'text',
        title: '业务方诉求',
        text: '大促 D-20：本月计划上线 3 个功能（购物车优化 / 新支付渠道 / 优惠券重构）。\n"冻结一周 = 大促功能全部推迟一周，对营收影响不可估量。"',
      },
    ],
    timeline: '本月 30 天，剩余 20 天（含大促 D-20）｜ 4 次发布回归的时间分布：D1、D8、D14、D22（平均每周 1 次）｜ SRE 政策：预算耗尽即自动冻结一周',
    impactHint: '47.3 分钟不是均匀消耗的——消耗结构里藏着"该冻结什么"的答案。',
  },

  hypotheses: [
    { id: 'h-regression', text: '重复发布回归是主因：4 次发布 4 次回归 = 测试覆盖不足，冻结新功能也无法止血', excludeActionId: 'a-regbreak' },
    { id: 'h-infra', text: '基础设施抖动是次要因素但占比 19%，需评估是否可忽略', excludeActionId: 'a-infrabreak' },
    { id: 'h-third', text: '第三方抖动不可控：13% 属外部因素，无需处理', excludeActionId: 'a-thirdbreak' },
    { id: 'h-freeze', text: '按政策冻结一周是正确动作：全部上线都暂停', excludeActionId: 'a-freeze' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '拆解错误预算的消耗结构',
      desc: '47.3 分钟是怎么花的——按来源分类',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '消耗结构分析',
        text: '发布回归 ×4 = 32 分钟（每次 8 分钟，全部在发布后 15 分钟内出现）\n基础设施抖动 ×1 = 9 分钟（K8s 节点故障，非服务自身）\n第三方抖动 ×2 = 6.3 分钟（支付渠道超时）\n→ 68% 来自"发布回归"——结构极度偏斜，不是"大促前正常的稳定性消耗"。',
      },
    },
    {
      id: 'a-regbreak',
      name: '审计 4 次发布回归的共同根因',
      desc: '4 次回归是不是同一类 bug',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-regression'],
      hypotheses: [{ id: 'h-regression', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '回归根因审计',
        text: '4 次回归全部是同模式：新代码路径在特定条件下触发未覆盖的边界。\n测试覆盖：单测覆盖 78%，集成测试只覆盖主链路——新分支路径零覆盖。\n→ 不是 4 个独立 bug，是同一类系统性缺陷：测试覆盖跟不上发布节奏。\n→ 冻结新功能无法解决这个根因——它只冻结了"发现新 bug 的速度"。',
      },
    },
    {
      id: 'a-infrabreak',
      name: '评估基础设施抖动的可控性',
      desc: '9 分钟的 K8s 节点故障是可预防的吗',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-infra'],
      hypotheses: [{ id: 'h-infra', status: 'excluded' }],
      result: {
        type: 'text',
        title: '基础设施抖动分析',
        text: 'K8s 节点故障：可预防性中等（定期维护+驱逐策略）。\n→ 9 分钟中约 4 分钟可通过节点维护策略避免，剩余 5 分钟属"基础设施固有风险"。\n→ 记入优化项，非本轮重点。',
      },
    },
    {
      id: 'a-thirdbreak',
      name: '评估第三方抖动的可控性',
      desc: '6.3 分钟的支付渠道超时能否缓解',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-third'],
      hypotheses: [{ id: 'h-third', status: 'down' }],
      result: {
        type: 'text',
        title: '第三方抖动分析',
        text: '支付渠道超时：不可控（外部服务），已有超时+重试+降级。\n→ 不可控外部因素，计入错误预算基线即可（SLO 设定时应考虑外部依赖的固有抖动）。',
      },
    },
    {
      id: 'a-freeze',
      name: '评估"冻结一周"的实际效果',
      desc: '冻结新功能能否止血',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-freeze'],
      hypotheses: [{ id: 'h-freeze', status: 'down' }],
      result: {
        type: 'text',
        title: '冻结效果评估',
        text: '冻结新功能 ≠ 消除发布回归：\n回归根因是测试覆盖不足——冻结新功能不增加测试覆盖。\n且冻结期间仍需发布 bug fix（不在冻结范围内）——bug fix 发布同样可能回归。\n→ 冻结只能延迟"发现下一个回归"的时间，不能减少回归本身。',
      },
    },
    {
      id: 'a-testcov',
      name: '补测试覆盖与发布门禁',
      desc: '【状态变更】新代码路径 100% 覆盖 + 发布前必须过回归门禁',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 新代码路径覆盖率 0% → 92%（补边界条件用例）\n② 发布门禁：集成测试必须覆盖新增代码路径（缺失则阻塞发布）\n③ 回归测试套件：4 次回归的边界条件全部补入\n→ 下次发布如有同类 bug，门禁直接拦截。',
      },
    },
    {
      id: 'a-continuerelease',
      name: '冻结需求发布但继续上线 bug fix',
      desc: '【状态变更】区分冻结范围：新功能冻结、bug fix 与稳定性改进正常发布',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '冻结范围优化',
        text: '冻结范围细化：\n新功能（3 个）→ 推迟至下月\nbug fix → 正常发布（过回归门禁）\n稳定性改进 → 优先发布\n→ "冻结"的正确姿势：冻结的是"会消耗错误预算的风险增量"，保护的是"减少错误预算消耗的修复"。',
      },
    },
    {
      id: 'a-ignorebudget',
      name: '忽略错误预算，大促前正常上线全部功能',
      desc: '【状态变更】大促优先，忽略 SRE 平台的冻结通知',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '忽略结果',
        text: '忽略冻结通知，3 个功能全部上线。\n→ 下月错误预算消耗：3 个功能 × 1~2 次回归/个 = 预计 24~48 分钟超支。\n→ 上月已超支 9%，叠加后 = 连续两月超支——SLO 将从 99.9% 降到 99.87%。\n→ 这个选项的陷阱：不是"大促功能不能上"，而是"没修测试覆盖就上线，只会继续消耗预算"。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-testcov', text: '核心修复：发布回归根因 = 测试覆盖不足（新代码路径 0% 集成覆盖）——补覆盖 + 发布门禁后，回归消除，错误预算消耗回到基线', correct: true },
    { id: 'rc-infra', text: '次要因素：K8s 节点抖动 9 分钟（19%），部分可通过维护策略避免', correct: false },
    { id: 'rc-third', text: '外部因素：支付渠道抖动 6.3 分钟（13%），不可控', correct: false },
    { id: 'rc-freeze', text: '按政策冻结一周新功能：无法消除发布回归根因，只能延迟发现', correct: false },
  ],

  expertCost: 6,
  restartActionId: 'a-ignorebudget',

  expertChain: [
    {
      thought: '错误预算不是均匀消耗的——先拆消耗结构：47.3 分钟里什么占大头。',
      update: '68% 来自发布回归（4 次 × 8 分钟/次，全部在发布后 15 分钟内出现）——结构极度偏斜。',
      actionId: 'a-impact',
      why: '1⚡ 消耗结构分析决定修复方向：如果是均匀消耗 = 正常稳定性退化；如果偏斜 = 有系统性根因。68% 偏斜指向"发布流程有系统性缺陷"。',
      conclusion: '发布回归为主因 → 审计 4 次回归的共同模式。',
    },
    {
      thought: '4 次回归的共同模式：全部是新代码路径的边界条件——测试覆盖没跟上发布节奏。',
      update: '根因实锤：新代码路径 0% 集成测试覆盖 → 每次发布都带着未测试的边界条件上线。',
      actionId: 'a-regbreak',
      why: '2⚡ 根因审计揭示冻结方案的无效性：冻结新功能不增加测试覆盖——它只是让"发现回归"变慢了，回归本身的根因仍在。',
      conclusion: '测试覆盖不足实锤 → 修复覆盖 + 门禁，而非简单冻结。',
    },
    {
      thought: '基础设施 9 分钟中 4 分钟可预防、第三方 6.3 分钟不可控——次要因素分级处理，非本轮重点。',
      update: '次要因素确认：可优化 4 分钟（节点维护策略），不可控 6.3 分钟（外部固有）。',
      actionId: 'a-infrabreak',
      why: '1⚡ 次要因素也要分级：可优化 vs 不可控的区分，避免把不可控因素记成"待办"造成无效工作。',
      conclusion: '次要因素归档 → 冻结方案有效性评估。',
    },
    {
      thought: '"冻结一周新功能"评估：冻结不能消除回归根因（测试覆盖不足），只能延迟发现——修复覆盖+门禁才是根治。',
      update: '停止决策循环。方案确定：补覆盖+门禁（治根）+ 细化冻结范围（防"冻结变松"）+ 大促功能推迟一个月。',
      actionId: '',
      why: '【停止规则】消耗结构分析 ✓ 回归根因审计 ✓ 次要因素分级 ✓ 冻结效果评估 ✓——四项闭合，决策有理有据：治根优于冻结。',
      conclusion: '决策：补覆盖+门禁（治根）+ 细化冻结范围（新功能推迟、修复正常发布）+ 大促功能推迟一个月（带测试覆盖的版本）。',
    },
  ],

  lessons: [
    {
      text: '错误预算的消耗结构决定修复方向：68% 偏斜于发布回归 ≠ 正常稳定性退化，而是系统性流程缺陷。',
      principle: '产品思维：消耗结构分析是错误预算的第一动作——均匀消耗 = 正常波动；偏斜消耗 = 系统性根因。修复方向取决于偏斜指向哪里。',
    },
    {
      text: '冻结新功能 ≠ 消除错误预算消耗的根因：测试覆盖不足才是——冻结只是延迟了发现回归的时间。',
      principle: '产品思维：错误预算政策（冻结）的正确姿势是"冻结需求，不冻结修复"——因为需求增加消耗预算，修复减少消耗。一刀切冻结等于把"减少消耗的动作"也停了。',
    },
    {
      text: '测试覆盖跟不上发布节奏：4 次回归 4 次都是新代码路径的边界条件——覆盖的债最终会用错误预算来还。',
      principle: '程序设计纪律：发布门禁 = 集成测试覆盖新增代码路径。覆盖不足时每发布一次就消耗一次错误预算——覆盖债的利息就是用户受损。',
    },
    {
      text: '错误预算的分级策略：可预防的（发布回归/节点维护）主动修，不可控的（第三方抖动）计入基线。',
      principle: '沉淀思维：错误预算分析后按"可预防/不可控"分类——可预防的列行动清单，不可控的纳入 SLO 基线重新校准（避免把外部抖动算成自己的"超支"）。',
    },
  ],
}
