import { DiagnosisCase } from '../../types/case'

/**
 * B4-2 · access L3（决策现场皮肤）
 * 主训思维：产品思维（决策 = 期望值与可逆性，而非完美信息——扩灰度收集数据 + 设止损线）
 * 次训思维：验证思维（统计噪声 vs 真实信号——5% 灰度的 8% 波动在置信区间边缘）
 * 真实原型：灰度发布新推荐算法，5% 灰度 CTR 下降 8%（置信区间边缘），决策：回退/全量/扩灰度
 * 情绪兽设计：惊讶獭（惊讶）——"CTR 降了，但可能是噪声"
 * 检查单：思维型 3 + 知识型 1
 */
export const canaryDecisionCase: DiagnosisCase = {
  id: 'canary-decision',
  title: '灰度 5% 出问题了：全量、回退还是扩灰度',
  intro: '新推荐算法灰度 5%，48 小时后 CTR 下降 8%。产品经理要求回退，算法工程师说是噪声。你的决策窗口：今天下班前。',
  domain: 'network',
  layer: '决策 = 期望值与可逆性，而非完美信息：数据不足时扩灰度收集，设止损线'
  ,
  part: 'apprentice',
  chapterId: 'access',
  order: 6,
  typeTags: ['access', 'decision'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」的发布负责人。新推荐算法灰度 5%，48 小时后 CTR 下降 8%——产品经理要回退，算法工程师说是冷启动噪声。你今天下班前必须做决策。',
    architecture: 'App 5% 流量 → 新推荐算法 v2 ｜ 95% 流量 → 旧算法 v1',
    tag: '决策现场',
    symptoms: [
      {
        type: 'error',
        title: '灰度指标（48h）',
        text: 'CTR：-8%（对照 -1%~+2% 波动区间）\n下单转化率：-5%（置信区间 [-12%, +2%]）\n用户停留时长：+15%（新算法推荐了更多长内容）\n→ 下降集中在 CTR，转化率降幅较小但也不容乐观。',
      },
      {
        type: 'text',
        title: '两方论点',
        text: '算法工程师："5% 灰度样本量小，CTR 波动 ±8% 在噪声范围内；且新算法冷启动需要学习期，7 天后才能评估真实效果。"\n产品经理："-8% CTR 就是 -8% 的用户在忍受差体验，每天多等一天都是流失。"',
      },
    ],
    timeline: '灰度：2 天前开始 ｜ CTR 下降：第 1 天 -6%、第 2 天 -8%（趋势在扩大）｜ 决策窗口：今天下班前 ｜ 大促：D-20',
    impactHint: '数据在噪声与信号的边缘——决策不是二选一，是三选一（回退/扩灰度/维持），每条的代价和收益不同。',
  },

  hypotheses: [
    { id: 'h-real', text: 'CTR 下降是真实信号：新算法确实不如旧版（冷启动解释不通持续扩大的下降）', excludeActionId: 'a-trend' },
    { id: 'h-cold', text: '冷启动噪声：新算法学习期导致暂时下降，7 天后恢复', excludeActionId: 'a-cold' },
    { id: 'h-sample', text: '5% 灰度样本偏差：抽样用户不是随机分布（重度用户更多？）', excludeActionId: 'a-sample' },
    { id: 'h-bug', text: '新算法实现有 bug：推荐内容重复或为空', excludeActionId: 'a-bug' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '看 CTR 下降的逐日趋势',
      desc: '趋势方向比绝对值更有信息量',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '逐日趋势',
        text: 'D1: -6%  D2: -8%（趋势扩大中）\n对照旧算法基线波动 ±2%。\n→ 趋势扩大 ≠ 冷启动恢复模式（冷启动应先降后升）——噪声假说置信度下降。\n但也可能是学习期在收敛（不是线性恢复）。',
      },
    },
    {
      id: 'a-sample',
      name: '查灰度用户分群画像',
      desc: '5% 灰度用户是不是随机抽样',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-sample'],
      hypotheses: [{ id: 'h-sample', status: 'excluded' }],
      result: {
        type: 'text',
        title: '灰度用户画像',
        text: '灰度用户按 userId hash 随机分配——画像与对照组无显著差异。\n→ 样本偏差假设排除：数据可信度提升。',
      },
    },
    {
      id: 'a-cold',
      name: '对比冷启动用户与老用户的表现',
      desc: '如果只是冷启动，老用户应该不受影响',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cold'],
      hypotheses: [{ id: 'h-cold', status: 'excluded' }],
      result: {
        type: 'text',
        title: '分群对比',
        text: '老用户（30 天活跃）：CTR -5%\n新用户（7 天内注册）：CTR -14%\n→ 老用户也降了 5%——冷启动只解释了新用户的下降，老用户的下降是真实信号。\n→ 混合证据：部分冷启动 + 部分真实退化。',
      },
    },
    {
      id: 'a-bug',
      name: '排查新算法的实现 bug',
      desc: '推荐内容有没有异常（重复/空/低质）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-bug'],
      hypotheses: [{ id: 'h-bug', status: 'down' }],
      result: {
        type: 'text',
        title: '实现排查',
        text: '推荐内容无重复、无空推荐；新算法的推荐多样性高于旧版（设计预期）。\n→ 实现 bug 排除：下降可能来自模型本身（需要更多数据确认）。',
      },
    },
    {
      id: 'a-trend',
      name: '基于全部信息做出决策评估',
      desc: '趋势扩大 + 冷启动部分解释 + 无 bug——决策的天平在哪边',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-real'],
      hypotheses: [{ id: 'h-real', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '决策评估',
        text: '支持真实退化：趋势扩大（-6%→-8%）+ 老用户也降 5%。\n支持冷启动：新用户降更多（学习期特征）+ 48h 样本量确实偏小。\n→ 天平略偏"真实退化"但置信度不足以下"回退"的确定性结论。',
      },
    },
    {
      id: 'a-rollback',
      name: '立即回退全量灰度',
      desc: '【状态变更】5% 灰度回退到旧算法 v1',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回退结果',
        text: '回退后 CTR 恢复基线。\n→ 如果是真实退化：止损正确，但错失了收集更多数据的机会。\n如果是冷启动：错杀了一个 7 天后会更好的算法，回退=从零开始。',
      },
    },
    {
      id: 'a-expand',
      name: '扩灰度至 20% 并设止损线',
      desc: '【状态变更】灰度扩到 20%，24h 后 CTR < -10% 自动回退',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '扩灰度结果',
        text: '灰度扩至 20%，止损线：24h CTR < -10% 自动回退。\n→ 决策逻辑：数据不足以确认退化 → 扩灰度 = 花可控代价（额外 15% 用户 1 天的体验）换更多信息（统计置信度 ×4）。\n预期收益：24h 后 CTR 数据量 ×4，冷启动 vs 真退化将被明确区分。',
      },
    },
    {
      id: 'a-fullroll',
      name: '直接全量发布新算法',
      desc: '【状态变更】相信冷启动解释，全量发布',
      cost: 1,
      gain: 'mid',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '全量结果',
        text: '全量发布 = 100% 用户承受尚不确定的 CTR 下降。\n→ 如果是真实退化：全量 7 天 = 大促期间核心指标持续受损，不可逆。\n→ 在数据不足时全量，是把"可能的冷启动"押注在"全部用户的体验"上。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-expand', text: '扩灰度至 20% 并设自动止损线（CTR < -10% 回退）：花可控代价换统计置信度 ×4——24h 后数据足以明确区分冷启动与真实退化，无论哪种结论都做出了正确决策', correct: true },
    { id: 'rc-rollback', text: '立即回退：保守止损但可能错杀冷启动期的算法', correct: false },
    { id: 'rc-fullroll', text: '直接全量发布：在数据不足时押注全部用户体验', correct: false },
    { id: 'rc-observe', text: '维持 5% 不动：等数据自然积累但不加速收集', correct: false },
  ],

  expertCost: 5,
  restartActionId: 'a-rollback',

  expertChain: [
    {
      thought: '-8% 是信号还是噪声？——先看趋势方向：D1 -6% → D2 -8%，趋势在扩大而非收敛。冷启动应该先降后升。',
      update: '趋势扩大削弱冷启动假说——但 48h 样本量确实偏小，置信度不足以下定论。',
      actionId: 'a-impact',
      why: '1⚡ 趋势方向比绝对值更有信息量：扩大的下降 ≠ 冷启动的恢复模式——两个假说的置信度开始分化。',
      conclusion: '趋势偏真实退化，但样本量不足 → 排除样本偏差。',
    },
    {
      thought: '排除样本偏差：灰度用户是 userId hash 随机分配——抽样无偏差，数据可信。',
      update: '样本可信 → 分群对比：老用户 -5%（排除冷启动）、新用户 -14%（冷启动特征）——混合信号。',
      actionId: 'a-sample',
      why: '1⚡ 排除抽样偏差后，分群对比揭示了混合信号：冷启动只解释新用户下降，老用户下降是独立信号——单纯的"冷启动噪声"解释不完整。',
      conclusion: '混合信号 → 需要更多数据区分，但当前 5% 的收集速度太慢。',
    },
    {
      thought: '决策评估：支持退化的证据略强（趋势扩大+老用户降），但置信度不足以下回退结论。三选一的期望值分析：回退=确定但可能错杀，扩灰度=可控代价换信息，全量=激进押注。',
      update: '扩灰度是期望值最优选项：15% 额外用户的 1 天体验是可控代价，换来 4 倍数据量 + 自动止损线兜底。',
      actionId: 'a-trend',
      why: '2⚡ 决策 = 期望值 × 可逆性，而非确定性：扩灰度的下行有止损线封顶（-10% 自动回退），上行是"如果冷启动为真则 20% 用户已经受益"——不对称收益。',
      conclusion: '扩灰度决策做出 → 设止损线并执行。',
    },
    {
      thought: '止损线是扩灰度的安全网：CTR < -10% 自动回退——无论冷启动还是真退化，24h 后都有明确结论和预设动作。',
      update: '停止决策循环。转入数据等待期——24h 后决策被数据确认或推翻。',
      actionId: '',
      why: '【停止规则】扩灰度 + 止损线 = 决策已完成：不需要"确定答案"才能行动——止损线把不确定性变成了可管理的风险。',
      conclusion: '24h 后 CTR < -10% → 自动回退并立项优化冷启动；CTR ≥ -10% → 继续灰度至 50%。',
    },
  ],

  lessons: [
    {
      text: '决策 = 期望值 × 可逆性，而非确定性：不需要"确定答案"才能行动——止损线把不确定性变成可管理的风险。',
      principle: '产品思维：三个选项的期望值分析——回退（确定但可能错杀）/ 扩灰度（可控代价换信息）/ 全量（激进押注）。数据不足时选"可逆 + 有止损线"的那个。',
    },
    {
      text: '分群对比是拆解混合信号的工具：老用户 -5% 排除了纯冷启动——冷启动只解释新用户的下降。',
      principle: '验证思维：灰度数据的分群对比（新老/地域/设备）能拆解混合信号。整体 -8% 里，新用户 -14% 老用户 -5% = 两个原因叠加而非一个。',
    },
    {
      text: '趋势方向比绝对值更有信息量：扩大的下降 ≠ 冷启动的恢复模式。',
      principle: '验证思维：灰度第 1 天 -6% 第 2 天 -8%——趋势在扩大，不是收敛。看趋势而不是只看截值。',
    },
    {
      text: '止损线是决策的安全网：不需要"确定答案"才能行动——CTR < -10% 自动回退，把不确定性变成预设规则。',
      principle: '产品思维：止损线 = "如果情况恶化到 X，自动做 Y"——它让决策者可以在信息不足时行动，因为最坏情况已被规则封顶。',
    },
  ],
}
