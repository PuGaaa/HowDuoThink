import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const midnightRollbackCase: DiagnosisCase = {
  id: 'midnight-rollback',
  title: '凌晨一点四十分：回滚还是硬扛',
  intro: '结算错误持续3%，新版本高度可疑但根因未证实。根据影响、回滚可行性和等待代价，选当前处置。',
  domain: 'data',
  layer: '决策依据是风险不对称：回滚 10 分钟可逆，不行动的代价是用户持续受损——疑似即行动',
  part: 'engineer',
  chapterId: 'data',
  order: 5,
  typeTags: [
    'data',
    'sre',
    'decision',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」值班工程师。凌晨 1:40 告警把你叫醒，你有 15 分钟决定：回滚 v2.6.0（大促功能推迟），还是留着继续排查。',
    architecture: 'App → 结算服务(v2.6.0, 2h 前发布) → 支付渠道',
    tag: '决策现场',
    symptoms: [
      {
        type: 'error',
        title: '监控快照',
        text: '结算错误率0.1%→3%，从00:10至01:40在2%~4%波动，没有已知自愈机制。错误为签名无效。发布23:40，00:10全量完成。',
      },
      {
        type: 'text',
        title: '已知信息（不完整）',
        text: 'v2.6.0 两小时前发布（含支付渠道路由重构——大促核心功能）。\n上游无变更；依赖渠道侧无变更确认（渠道方值班未回复）。\n堆栈指向新路由代码，但复现条件复杂，初步判断完整定位需 1~2 小时。',
      },
      {
        type: 'log',
        title: '发票附件失败',
        text: '[WARN] invoice archive upload failed；同一分钟业务看板记录。',
      },
    ],
    timeline: '23:40发布，00:10全量及错误抬升，01:40告警；要求15分钟内完成处置决策，执行回滚另需8分钟；功能原计划D-11，修复后D-9重发。',
    impactHint: '决策依据不是"确定根因后才行动"——是"行动与不行动的代价对比"。先把两边的代价算清楚。',
  },
  hypotheses: [
    {
      id: 'h-newcode',
      text: '新版本高度可疑且回滚已验证可执行，应先受控回滚止损，再确认根因',
      excludeActionId: 'a-timeline',
    },
    {
      id: 'h-channel',
      text: '渠道未回复时禁止任何止损动作，必须无限期等对方确认',
      excludeActionId: 'a-channel',
    },
    {
      id: 'h-traffic',
      text: '错误率已经持续下降并恢复基线，可以继续观察不处置',
      excludeActionId: 'a-pattern',
    },
    {
      id: 'h-env',
      text: '本次版本有不可逆数据迁移，旧版本无法安全运行，不能回滚',
      excludeActionId: 'a-env',
    },
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
      tests: [
        'h-traffic',
      ],
      hypotheses: [
        {
          id: 'h-traffic',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '业务影响量化',
        text: '接口每分钟7000次尝试，错误率3%即约210次失败尝试/分钟，不等于210个独立订单或确定金额资损。90分钟仍处于2%~4%，没有持续下降到0.1%基线。\n噪声收线：发票附件是独立异步任务，未进入结算签名调用；210次失败尝试按结算trace单独统计，没有把附件失败混入分母。',
      },
    },
    {
      id: 'a-timeline',
      name: '对齐发布与故障的时间线',
      desc: '时间吻合 ≠ 因果确认——但它是决策信息的一部分',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-newcode',
      ],
      hypotheses: [
        {
          id: 'h-newcode',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'text',
        title: '时间线对齐',
        text: '23:40发布，00:10放量到100%且错误抬升，堆栈指向新路由；这只支持高度可疑，不是根因确定。\n排期负责人给定：回滚使功能延后约1天，安全回滚预案预计8分钟；继续完整定位预计1~2小时，期间仍受损。应结合可执行性先止损，不需等完整复现。',
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
      tests: [
        'h-traffic',
      ],
      hypotheses: [
        {
          id: 'h-traffic',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '波动模式分析',
        text: '01:10~01:40错误率持续2%~4%，未回到0.1%基线；这不证明未来永不自愈，但与“已经恢复”不符。',
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
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '上游排查',
        text: '上游没有已知发布，渠道尚未回复仍属未知；这不能排除渠道故障，也不构成禁止受控回退的规则。',
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
      tests: [
        'h-channel',
      ],
      hypotheses: [
        {
          id: 'h-channel',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '渠道方联系',
        text: '渠道值班暂未回复，不能据此排除渠道故障。团队事故处置规则允许对高度相关且可逆的发布先受控回退；等待回复不是硬前置。排除“未回复则任何止损都禁止”的决策规则。',
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
      tests: [
        'h-env',
      ],
      hypotheses: [
        {
          id: 'h-env',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '配置比对',
        text: '回滚演练与当前发布差异检查：无schema/不可逆数据变更，旧版仍兼容当前数据和渠道密钥；可先小批回退、观察错误及健康，再扩展，失败可停止。配置版本与灰度一致。排除“不可逆迁移导致不能回滚”。',
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
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '定位进展',
        text: '新路由堆栈给出调查方向，完整签名兼容复现尚需1~2小时。仅有堆栈不能把代码缺陷标成已确认根因；该事实不阻止先执行已验证可逆的止损。',
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
        text: '排期负责人给定回退会让功能延迟约1天；本次教学时间线为D-11回退、D-9修复重发，两日期相差2天，不是7天。实际复发与返工代价仍需另评估。',
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
        text: '这是选择后才执行的状态变更：小批回退、观测、全量回退共8分钟，教学分支记录错误回落0.08%。回落支持版本相关，但日后仍需根因复现；不能在执行前用这个结果证明决策必然正确。',
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
        text: '继续定位预计1~2小时，这段时间可能持续失败；当前没有证据保证业务排期一定保住。不能虚构1400投诉或搜索指数下降为必然结果。',
      },
    },
    {
      id: 'a-observe',
      name: '观察一夜等自愈',
      desc: '【状态变更】错误率波动不大，先观察到天亮',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '观察结果',
        text: '若错误率及流量维持6小时，约210×360=75600次失败尝试；这是条件情景估算，不是已发生的独立订单数，也不能凭波动证明绝不自愈。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-rollback',
      text: '在新版本高度相关、故障持续且回滚可安全执行的给定条件下，先受控回退止损，再调查根因；不是因根因已被证明才行动',
      correct: true,
    },
    {
      id: 'rc-hold',
      text: '渠道未回复则禁止止损，必须无限期等待',
      correct: false,
    },
    {
      id: 'rc-observe',
      text: '错误率已经恢复基线，继续观察即可',
      correct: false,
    },
    {
      id: 'rc-delay',
      text: '存在不可逆迁移，当前旧版不能运行',
      correct: false,
    },
  ],
  expertCost: 5,
  restartActionId: 'a-observe',
  expertChain: [
    {
      thought: '量化持续失败与是否恢复。',
      update: '约210次失败尝试/分钟，尚未恢复基线。',
      actionId: 'a-impact',
      why: '1⚡统一请求分母并反证已经自愈，不把失败请求当独立订单。',
      conclusion: '需要及时止损。',
    },
    {
      thought: '对齐发布、放量和两种等待代价。',
      update: '版本可疑，继续调查较久，延期有明确给定代价。',
      actionId: 'a-timeline',
      why: '2⚡决策依靠相关性和风险比较，不伪称已确认缺陷。',
      conclusion: '选择受控回退方向。',
    },
    {
      thought: '检查回滚前置条件。',
      update: '无不可逆迁移，旧版可运行，有分批与观测。',
      actionId: 'a-env',
      why: '1⚡回滚安全性是行动前必须取得的证据。',
      conclusion: '排除不能回滚。',
    },
    {
      thought: '确认渠道联系不构成止损阻塞。',
      update: '渠道仍未知，但规则允许可逆止损。',
      actionId: 'a-channel',
      why: '1⚡排除错误决策规则，不把未知渠道因果假装排除。',
      conclusion: '决策信息充分，转受控回退。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】持续失败、版本关联、两侧代价与安全回滚条件齐备；本局只完成行动选择，回滚及根因复现尚未执行。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '在新版本高度相关、故障持续且回滚可安全执行的给定条件下，先受控回退止损，再调查根因；不是因根因已被证明才行动',
    },
  ],
  lessons: [
    {
      text: '先判断影响和回滚能否安全执行，再比较止损与继续调查的代价；不是所有不确定都能用回滚解决。',
      principle: '回滚可能涉及不兼容数据、密钥与外部副作用。本题明确排除这些阻碍，才可受控回退；“如果不确定就回滚”不是无条件规则。',
    },
    {
      text: '决策确认的是此时应做的行动，不等于确认新代码是根因；渠道未回复仍是未知信息。',
      principle: '把可逆行动的依据与因果验证分开。止损后仍需复现和回归，不能用事后结果回填成事前已知。',
    },
    {
      text: '7000次尝试/分钟×3%=210次失败尝试；是否重复重试、独立用户或金额损失需另行去重与核实。',
      principle: '以统一分母估算持续受损，不把失败请求直接等价成独立订单、资损和品牌指标。',
    },
  ],
}
