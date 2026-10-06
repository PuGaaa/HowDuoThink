import { DiagnosisCase } from '../../types/case'

/**
 * 第 12 章 · 架构演进 结业（规则散落漏改 L2）
 * 教学点：架构设计——复制粘贴的规则没有"事实定义处"：每次修改都是全仓搜索 × 人工；
 * 对账是散落规则的探测器；技术债要台账化偿还。
 * 专家路径：impact(1) + grepreport(2) + configdiff(1) = 4⚡︎
 */
export const ruleSprawlCase: DiagnosisCase = {
  id: 'rule-sprawl',
  title: '17 处复制粘贴，漏改了 1 处',
  intro: '大促改价规则上线后某品类对账差异 4 万元：折扣系数硬编码在 17 处——复制粘贴漏改了对账模块。',
  domain: 'runtime',
  layer: '复制粘贴的规则没有事实定义处——每次修改都是一次赌博',
  part: 'master',
  chapterId: 'evolution',
  order: 8,
  typeTags: ['architecture', 'data', 'process'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」营销平台的架构师，一次"简单"的系数调整暴露了三年的技术债。',
    architecture: '会员折扣规则(品类系数 0.9→0.85)：硬编码散落在 订单/购物车/结算/推荐/导出/对账…共 17 处',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '对账差异',
        text: '大促 T+1 对账：某 3 个品类的"对账口径金额"与"线上实收"差 4 万元。\n差异方向：对账侧按 0.85 算出"应得"，线上实收按 0.9 算出"实得"——对账认为少收了。',
      },
      {
        type: 'text',
        title: '变更记录',
        text: '本周变更：品类系数 0.9 → 0.85（大促折扣）。\n开发自述："全局搜了 0.9，改了 17 处"——但没人知道 17 是不是全部。',
      },
    ],
    timeline: '系数调整 3 天前上线 ｜ 折扣规则自系统诞生硬编码在各业务模块 ｜ 每次大促调整都是一次"全仓搜索行动"',
    impactHint: '线上与对账的分歧 = 两处代码对"规则"的理解不同——同一份规则，到底活在几个地方？',
  },

  hypotheses: [
    { id: 'h-sprawl', text: '规则复制粘贴散落 17 处：漏改 1 处（对账模块）——线上/对账各持一个版本的"事实"', excludeActionId: 'a-grepreport' },
    { id: 'h-config', text: '配置中心下发的系数未同步到某服务', excludeActionId: 'a-configdiff' },
    { id: 'h-cache', text: '某模块缓存了旧规则未失效', excludeActionId: 'a-cachekey' },
    { id: 'h-round', text: '0.85 的舍入规则差异造成系统性偏差', excludeActionId: 'a-rounddiff' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '定位差异的"坐标系"',
      desc: '影响面：差异只出现在哪个模块、哪个品类',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '差异坐标',
        text: '模块维度：只出现在"财务对账导出"——线上订单/结算/购物车全部正确\n品类维度：恰好是本次调整的 3 个品类\n方向：对账侧用 0.85（新值）计算，线上侧这些单按 0.9（旧值）结算？——反过来查：\n实情：线上全部按 0.85 新值 ✓，对账导出按 0.9 旧值 ✗——差异在对账模块内部。\n→ 唯一嫌疑人：对账模块的规则来源。',
      },
    },
    {
      id: 'a-grepreport',
      name: '全仓搜索规则字面量',
      desc: '品类系数 0.9/0.85 在代码里活了几次',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-sprawl'],
      hypotheses: [{ id: 'h-sprawl', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '全仓字面量普查',
        text: 'grep -rn "0.9\\|0.85" --include="*.java"（营销上下文过滤）：\n命中 17 处独立硬编码：订单×3 购物车×2 结算×2 推荐×1 导出×2 对账×1 积分×1 …\n状态：16 处已改 0.85，对账模块 1 处仍是 0.9 ← 漏改实锤\n更深的发现：这 17 处没有一处引用共享常量——"规则"没有事实定义处，\n每次调整都是"全仓搜索 × 人工改 × 祈祷"。',
      },
    },
    {
      id: 'a-configdiff',
      name: '核对配置中心的系数下发',
      desc: '排除配置未同步',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-config'],
      hypotheses: [{ id: 'h-config', status: 'excluded' }],
      result: {
        type: 'text',
        title: '配置核对',
        text: '对账模块根本不读配置中心——它是硬编码的重灾区之一。\n→ 排除配置漂移；这条排除反而佐证了散落的严重性。',
      },
    },
    {
      id: 'a-cachekey',
      name: '核对对账模块的规则缓存',
      desc: '排除缓存残留',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'excluded' }],
      result: {
        type: 'text',
        title: '缓存核对',
        text: '对账模块无规则缓存（离线批量计算）。\n→ 排除缓存。',
      },
    },
    {
      id: 'a-rounddiff',
      name: '核对舍入规则差异',
      desc: '排除 0.85 的舍入系统偏差',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-round'],
      hypotheses: [{ id: 'h-round', status: 'excluded' }],
      result: {
        type: 'text',
        title: '舍入核对',
        text: '两侧均 HALF_UP；差异方向（0.9 vs 0.85）与舍入无关。\n→ 排除舍入：差异是"系数版本"，不是"计算精度"。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急在对账模块手动 patch 系数',
      desc: '【状态变更】hotfix 直改对账服务常量并重跑历史对账',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '紧急 patch 结果',
        text: '对账差异清零，4 万元账目修正。\n讽刺的是：这次 patch 又产生了一处"绕过发布流程的硬编码"——第 18 处。\n→ 止血时埋下的新债，要在修复时认领。',
      },
    },
    {
      id: 'a-fixextract',
      name: '修复：规则收敛到规则服务',
      desc: '【状态变更】营销规则抽取为规则服务（版本化+生效时间），17 处统一改为调用',
      cost: 3,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '收敛结果',
        text: '① 规则服务：品类系数/满减/折上折集中定义，带版本号与生效时间窗\n② 17 处调用方统一接入（含对账）——同一时刻全系统只有一个"规则事实"\n③ 规则变更 = 改一处 + 全系统生效；历史对账按"当时版本"重放（生效时间窗支持）。',
      },
    },
    {
      id: 'a-fixlint',
      name: '沉淀：规则字面量扫描进 CI',
      desc: '【状态变更】营销系数类字面量出现即拦截；"复制粘贴 ≥3 处"标记为技术债台账',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '扫描规则',
        text: 'CI 扫描：业务规则字面量（系数/阈值/开关值）出现即警告，重复 ≥3 处升级为台账条目。\n技术债台账：每迭代分配偿还配额——"以后再说"变成"排在哪一迭代说"。',
      },
    },
    {
      id: 'a-fixrecon',
      name: '沉淀：口径对账制度化',
      desc: '【状态变更】线上实收 vs 对账口径的日对账，差异即告警——这次 4 万元第 2 天就该被发现',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '对账上线',
        text: '日对账 + 差异阈值告警：任何一处漏改，第二天早上就会亮灯——\n而不是等财务月结时翻出 4 万元的洞。对账是散落规则的探测器。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-sprawl', text: '折扣规则硬编码复制粘贴散落 17 处（无共享常量无规则服务）：大促调整"全仓搜索+人工改"漏改对账模块——线上/对账各持一个版本的规则事实，4 万元口径差异', correct: true },
    { id: 'rc-config', text: '配置中心系数未同步到某服务', correct: false },
    { id: 'rc-cache', text: '某模块缓存旧规则未失效', correct: false },
    { id: 'rc-round', text: '新系数的舍入规则差异', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '线上全对、对账出错——先定位差异的坐标系：哪个模块、哪个品类、哪个方向。',
      update: '差异只在"对账导出"模块内部、恰好是本次调整的品类——嫌疑人 = 对账模块的规则来源。',
      actionId: 'a-impact',
      why: '1⚡︎ 坐标系定位把"4 万元差异"缩到"一个模块的一个规则来源"——线上/对账各持一个版本的事实，从坐标就能推出来。',
      conclusion: '嫌疑锁定：对账模块的规则定义（h-sprawl 升权）。',
    },
    {
      thought: '全仓普查规则的"生存状态"：这个系数在代码里活了几次、各自什么版本。',
      update: '实锤：17 处独立硬编码、16 改 1 漏——且无一引用共享定义。规则没有事实定义处，每次修改都是赌博。',
      actionId: 'a-grepreport',
      why: '2⚡︎ 字面量普查把"漏改"从个人失误升级为架构缺陷：17 处复制粘贴意味着修改协议天生脆弱——真正要修的不是那 1 处，是"17 处"这个结构本身。',
      conclusion: '根因实锤：规则散落（结构性）。',
    },
    {
      thought: '配置与缓存两个"现代机制"假设各 1⚡︎ 排除——排除结果反而加深散落的定性。',
      update: '对账模块既不读配置也无缓存——它是纯粹的硬编码孤岛；排除证据佐证架构定性。',
      actionId: 'a-configdiff',
      why: '1⚡︎ 排除的副产品是定性加固："没接配置"这个事实说明该模块连现代化的统一机制都没碰过——散落是系统性的，不是一次疏忽。',
      conclusion: '定性完成 → 舍入快排。',
    },
    {
      thought: '舍入差异 1⚡︎ 排除——"0.85 的精度"叙事清场。止血、收敛、门禁、对账四步走。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（17 处散落漏 1）✓ 结构（无事实定义处）✓ 防线（扫描+对账）✓——个案、结构、防线三层闭合。',
      conclusion: '沉淀：复制粘贴的规则没有事实定义处。规则要收敛到唯一来源（服务/常量），对账要成为散落的探测器——漏改不可怕，可怕的是漏改 30 天没人知道。',
    },
  ],

  lessons: [
    {
      text: '复制粘贴的规则没有事实定义处：17 处硬编码意味着每次修改都是"全仓搜索 × 人工改 × 祈祷"——漏改是结构的必然，不是个人的疏忽。',
      principle: '架构设计：业务规则收敛到唯一事实来源（规则服务/共享常量 + 版本化与生效时间窗）。"出现 ≥3 处"的复制即标记技术债台账，按迭代偿还——债务的可怕不在存在，在于没有账本。',
    },
    {
      text: '对账是散落规则的探测器：线上实收与对账口径的日对账，让任何一处漏改在 24 小时内亮灯。',
      principle: '沉淀思维：当规则/配置/逻辑存在多副本时（过渡期必然），双向对账是唯一的漏改探测器。这次的 4 万元潜了一个大促周期——对账制度的缺失让"结构性风险"以"财务事故"的形式提现。',
    },
    {
      text: '止血时别埋新债：绕过发布流程的 hotfix patch 就是第 18 处硬编码——紧急修复要登记进修复清单。',
      principle: '流程设计：紧急状态下的手动 patch 必须当天登记为"待正式化债务"，否则止血动作本身成为下一次事故的种子。修复清单的完整性包括"止血过程中产生的临时状态"。',
    },
  ],
}
