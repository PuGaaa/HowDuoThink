import { DiagnosisCase } from '../../types/case'

/**
 * B4-1 · data L3（决策现场皮肤试点）
 * 主训思维：产品思维（疑似即行动——回滚决策不需要根因确认，依据是风险不对称）
 * 次训思维：成本思维（回滚 10 分钟可逆 vs 排查 1~2h 不确定的期望成本对比）
 * 真实原型：凌晨疑似新版本引入故障，回滚丢功能 vs 硬扛排查的经典值班困境
 * 情绪兽设计：恐怖蛙（恐慌）——凌晨被叫醒、信息不足、还要做决定
 * 检查单：思维型 3 + 知识型 1
 */
export const midnightRollbackCase: DiagnosisCase = {
  id: 'midnight-rollback',
  title: '凌晨一点四十分：回滚还是硬扛',
  intro: '凌晨 1:40，值班手机响了：结算接口错误率从 0.1% 升到 3%。两小时前刚发布 v2.6.0（含大促核心功能）。你只有 15 分钟决定：回滚，还是硬扛。',
  domain: 'data',
  layer: '决策依据是风险不对称：回滚 10 分钟可逆，不行动的代价是用户持续受损——疑似即行动',
  part: 'engineer',
  chapterId: 'data',
  order: 6,
  typeTags: ['data', 'sre', 'decision'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」值班工程师。凌晨 1:40 告警把你叫醒，你有 15 分钟决定：回滚 v2.6.0（大促功能推迟），还是留着继续排查。',
    architecture: 'App → 结算服务(v2.6.0, 2h 前发布) → 支付渠道',
    tag: '决策现场',
    symptoms: [
      {
        type: 'error',
        title: '监控快照',
        text: '结算接口错误率：0.1% → 3.0%（两小时前起），当前在 2%~4% 波动，未持续恶化也未自愈。\n错误类型：支付渠道返回"签名无效"（新报错，此前从未出现）。',
      },
      {
        type: 'text',
        title: '已知信息（不完整）',
        text: 'v2.6.0 两小时前发布（含支付渠道路由重构——大促核心功能）。\n上游无变更；依赖渠道侧无变更确认（渠道方值班未回复）。\n堆栈指向新路由代码，但复现条件复杂，初步判断完整定位需 1~2 小时。',
      },
    ],
    timeline: 'v2.6.0 发布：23:40 ｜ 错误率爬升：00:10 起 ｜ 当前：1:40 ｜ 大促功能排期：D-11 预热前必须上线 ｜ 你的决策窗口：15 分钟',
    impactHint: '决策依据不是"确定根因后才行动"——是"行动与不行动的代价对比"。先把两边的代价算清楚。',
  },

  hypotheses: [
    { id: 'h-newcode', text: 'v2.6.0 支付路由重构引入：新报错类型 + 时间线吻合 + 堆栈指向新代码', excludeActionId: 'a-timeline' },
    { id: 'h-channel', text: '支付渠道侧变更导致签名不兼容（渠道方未回复确认）', excludeActionId: 'a-channel' },
    { id: 'h-traffic', text: '夜间流量模式变化触发边缘条件', excludeActionId: 'a-pattern' },
    { id: 'h-env', text: '环境差异：v2.6.0 在灰度与全量间的配置漂移', excludeActionId: 'a-env' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '评估错误率的业务影响',
      desc: '结算 = 资损链路，3% 意味着什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '业务影响量化',
        text: '结算 QPS ≈ 7000/分钟，错误率 3% → 每分钟 ~210 单支付失败。\n用户侧表现：支付页面报错、重试后仍失败 → 流失率随等待时间上升。\n→ 资损链路 + 持续受损：这不是"可以等到天亮"的问题。',
      },
    },
    {
      id: 'a-timeline',
      name: '对齐发布与故障的时间线',
      desc: '时间吻合 ≠ 因果确认——但它是决策信息的一部分',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-newcode'],
      hypotheses: [{ id: 'h-newcode', status: 'up' }],
      result: {
        type: 'text',
        title: '时间线对齐',
        text: 'v2.6.0 发布 23:40 → 错误率爬升 00:10（间隔 30 分钟 ≈ 灰度放量到 100% 的时间）。\n时间线高度吻合，但未做因果确认（未回滚验证）。\n→ 作为决策信息：嫌疑重大但非 100% 确定——这正好落在"疑似"区间。',
      },
    },
    {
      id: 'a-pattern',
      name: '分析错误率的波动模式',
      desc: '波动意味着什么',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-traffic'],
      hypotheses: [{ id: 'h-traffic', status: 'down' }],
      result: {
        type: 'text',
        title: '波动模式分析',
        text: '错误率在 2%~4% 波动，与流量 QPS 正相关。\n→ 间歇性触发：新代码路径的某个分支在特定条件下失败。\n→ 波动 ≠ 自愈前兆：QPS 持续则错误率持续，不会自然消失。',
      },
    },
    {
      id: 'a-upstream',
      name: '排查上游与依赖变更',
      desc: '排除法收窄嫌疑',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-channel'],
      hypotheses: [{ id: 'h-channel', status: 'down' }],
      result: {
        type: 'text',
        title: '上游排查',
        text: '上游网关/鉴权/风控：零变更。\n支付渠道方：值班未回复（渠道侧是否变更无法确认——这本身就是信息盲区）。\n→ 排除上游；渠道侧是信息盲区——无法排除也无法确认。',
      },
    },
    {
      id: 'a-channel',
      name: '联系渠道方确认',
      desc: '渠道侧有没有变更',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-channel'],
      hypotheses: [{ id: 'h-channel', status: 'down' }],
      result: {
        type: 'text',
        title: '渠道方联系',
        text: '渠道值班电话无人接听（凌晨 1:50）。\n→ 渠道侧确认为信息盲区：无法确认也无法排除。',
      },
    },
    {
      id: 'a-env',
      name: '比对灰度与全量的配置',
      desc: '排除环境配置漂移',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-env'],
      hypotheses: [{ id: 'h-env', status: 'excluded' }],
      result: {
        type: 'text',
        title: '配置比对',
        text: '灰度与全量的配置完全一致（同一 config 版本）。\n→ 排除环境漂移。',
      },
    },
    {
      id: 'a-deepdive',
      name: '深入定位根因',
      desc: '初步堆栈指向新路由代码，但复现条件复杂',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-newcode'],
      hypotheses: [{ id: 'h-newcode', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '定位进展',
        text: '堆栈指向 v2.6.0 新增的支付路由重构代码。\n触发条件：特定渠道 + 特定金额段（间歇性的原因找到了，但完整修复需要代码改动）。\n→ 根因假设已有方向，但验证修复需要 1~2 小时开发 + 测试。',
      },
    },
    {
      id: 'a-promo',
      name: '查大促功能的排期约束',
      desc: '回滚的时间代价是什么',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '排期约束',
        text: '大促功能排期：D-11 预热前上线（当前 D-11，即明天是最后期限）。\n回滚 = 功能推迟至少 1 天 + 团队连夜修复。\n→ 回滚的时间代价：功能晚 1 天 + 团队加班。不回滚的代价：错误率 3% 持续整夜 + 明天可能更高流量。',
      },
    },
    {
      id: 'a-rollback',
      name: '立即回滚 v2.6.0',
      desc: '【状态变更】疑似即行动——先止损再排查',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果',
        text: '回滚耗时 8 分钟（含确认），错误率回落至 0.08%。\n大促功能推迟 1 天——但资损链路止损成功。\n→ 根因随后在白天确认：路由重构在特定渠道签名算法下不兼容。修复后 D-9 重新上线。',
      },
    },
    {
      id: 'a-hold',
      name: '硬扛继续排查不回滚',
      desc: '【状态变更】不回滚，留版本继续定位',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '硬扛结果',
        text: '你选择了不回滚继续排查。\n→ 排查花了 1.5 小时才定位到路由兼容性 + 30 分钟修复 + 发布 = 2 小时+ 的持续受损窗口。\n→ 大促功能保住了排期，但结算错误率 3% 持续整夜，客服投诉 1400+，品牌搜索指数下降。此选项的期望成本远高于回滚。',
      },
    },
    {
      id: 'a-observe',
      name: '观察一夜等自愈',
      desc: '【状态变更】错误率波动不大，先观察到天亮',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '观察结果',
        text: '观察一夜：错误率未自愈（波动模式分析已排除自愈可能）。\n整夜持续受损 6 小时 = 210 单/分钟 × 360 分钟。\n→ 最差选项：把"不确定"当成了"不行动"的理由，忽略了持续受损的累积代价。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-rollback', text: '立即回滚止损——依据是风险不对称而非根因确认：回滚 8 分钟可逆、代价 = 功能推迟 1 天；不回滚 = 3% 错误率持续整夜（用户流失+品牌损伤），期望成本远高', correct: true },
    { id: 'rc-hold', text: '硬扛继续排查——根因未明时用户持续受损 2h+，且排查结果不确定', correct: false },
    { id: 'rc-observe', text: '观察一夜等自愈——波动模式已排除自愈可能', correct: false },
    { id: 'rc-delay', text: '先上线大促功能再修——资损链路故障不能让位于排期', correct: false },
  ],

  expertCost: 5,
  restartActionId: 'a-observe',

  expertChain: [
    {
      thought: '凌晨被叫醒，第一件事不是排查——是评估"这个故障值不值得我叫醒所有人"。结算 = 资损链路，3% 每分钟 210 单。',
      update: '资损链路 + 持续受损：这不是可以等到天亮的问题，决策窗口已经打开。',
      actionId: 'a-impact',
      why: '1⚡ 先量化业务影响再决定排查深度：资损链路 3% 错误率的每小时代价，决定了"值得投入什么级别的响应"。',
      conclusion: '持续受损实锤 → 收集决策所需的全部信息。',
    },
    {
      thought: '收集决策信息（不是根因信息）：发布时间线、错误率模式、上游变更、渠道联系、根因定位进度、排期约束——六块信息。',
      update: '六块信息拼出来：嫌疑指向 v2.6.0（时间吻合+堆栈指向），但未 100% 确认；回滚代价 = 功能推迟 1 天；不回滚代价 = 持续受损。',
      actionId: 'a-timeline',
      why: '1⚡ 决策需要的是决策信息，不是完整根因：根因排查是"定位到行"，决策排查是"定位到哪条路径嫌疑最大"——后者快得多。',
      conclusion: '决策信息齐备：嫌疑 + 代价两侧都有了 → 该做决策了。',
    },
    {
      thought: '决策时刻：嫌疑重大但非 100% 确定（未回滚验证因果）、回滚 8 分钟可逆、功能推迟 1 天、不回滚则整夜持续受损——风险不对称清晰。',
      update: '疑似即行动：回滚不需要根因确认，依据是风险不对称——先止损再排查。',
      actionId: 'a-rollback',
      why: '2⚡ 回滚决策的核心逻辑：8 分钟可逆的动作 vs 不可逆的持续用户受损——即使回滚错了（不是新版本引起的），损失也只是功能推迟一天。期望成本碾压。',
      conclusion: '回滚完成，错误率回落 0.08%——决策被验证正确（事后根因确认确实是新版本）。',
    },
    {
      thought: '回滚后根因在白天确认：路由重构在特定渠道签名算法下不兼容。修复 + 灰度重发，大促功能 D-9 上线。',
      update: '停止决策循环。转入正常修复流程。',
      actionId: '',
      why: '【停止规则】止损 ✓ 根因 ✓ 修复 ✓ 重发 ✓——决策循环完整闭环，无剩余动作。',
      conclusion: '回滚决策复盘：从告警到回滚 22 分钟，从回滚到重发 7 天——回滚买来的 7 天里，根因被完整修复，且大促功能上线时不再带着隐患。',
    },
  ],

  lessons: [
    {
      text: '疑似即行动：回滚决策不需要根因确认——依据是风险不对称，不是确定性。',
      principle: 'SRE 决策原则："如果不确定，回滚"。回滚是可逆的 10 分钟操作，持续故障是不可逆的用户流失——期望成本的差距就是决策的依据，不需要等到根因水落石出。',
    },
    {
      text: '决策需要的是决策信息，不是完整根因：根因排查是"定位到行"，决策排查是"定位到哪条路径嫌疑最大"。',
      principle: '产品思维：凌晨值班的 15 分钟决策窗口里，你要回答的是"行动还是不行动"，不是"根因是什么"。把决策信息（发布时间线/影响面/代价对比）与根因排查（堆栈/复现/修复）分开，前者 10 分钟，后者可能 2 小时。',
    },
    {
      text: '回滚的代价是功能推迟，不回滚的代价是用户持续受损+品牌损伤——算清两边再决定，但一定要算。',
      principle: '成本思维：决策 = 期望成本对比。回滚 8 分钟可逆（最坏：功能推迟）；不回滚最坏：整夜 3% 错误率 + 用户流失 + 品牌搜索下降。风险不对称时，选可逆的一边。',
    },
    {
      text: '回滚买来的时间里，根因被完整修复——回滚不是"认输"，是"用可控的代价换取安全排查的时间与空间"。',
      principle: '沉淀思维：回滚后的 7 天里，根因被完整定位修复，大促功能 D-9 重新上线时不再带隐患。如果当初硬扛，大促功能也会带着这个隐患上线——回滚保护的不只是用户，还有你自己的发布质量。',
    },
  ],
}
