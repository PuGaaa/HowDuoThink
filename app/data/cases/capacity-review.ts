import { DiagnosisCase } from '../../types/case'

/**
 * 第 8 章 · 架构演进 结业评审（评审现场 L3）
 * 教学点：架构设计——容量保障的四张必答卷：按形状算容量（不是按均值外推）、DB 是最终瓶颈、
 * 预案必须演练过、压测覆盖真实场景；产品思维——侥幸渡劫不是容量。
 * 专家路径：dbload(2) + pulsecheck(1) + drillcheck(1) + scenecover(1) + benefit(1) + minfix(2) = 8⚡︎
 */
export const capacityReviewCase: DiagnosisCase = {
  id: 'capacity-review',
  title: '大促容量保障方案终审',
  intro: '大促容量保障方案明天终审：扩容清单、降级预案、依赖梳理一应俱全——你的工作是找出它在零点怎么失效。',
  domain: 'runtime',
  layer: '容量按"形状"算不按均值外推——侥幸渡劫不是容量',
  part: 'master',
  chapterId: 'evolution',
  order: 7,
  typeTags: ['architecture', 'capacity', 'process'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」架构委员会成员，评审会上被指派"挑刺"——在零点之前找出方案会失效的地方。',
    architecture: '全链路(App+直播渠道 → 网关 → 订单/商品/库存 → DB/缓存/MQ) ｜ 方案四板块：扩容/降级/限流/演练',
    tag: '评审现场',
    symptoms: [
      {
        type: 'error',
        title: '方案文档 · 关键句',
        text: '① 应用层扩容 3 倍（按去年峰值线性外推）\n② DB 层未扩容——"去年大促 DB 没出问题"\n③ 降级预案 12 项（文档状态，"需要时按开关执行"）\n④ 全链路压测 10 万 QPS 全绿（单场景：均匀流量）',
      },
      {
        type: 'text',
        title: '现网事实',
        text: '今年新增直播带货渠道：开抢瞬间秒级脉冲 ×10（与 App 匀速流量形状完全不同）。\n今年预估峰值 12 万 QPS（去年 3.5 万的 3.4 倍）。\n去年大促的"没出问题"档案：DB 层曾靠人工 kill 慢查询渡劫 40 分钟（有工单为证）。',
      },
    ],
    timeline: '方案评审明天终审 ｜ 大促 20 天后 ｜ 12 项降级预案无一演练过 ｜ 压测数据集为 500 SKU 固定循环',
    impactHint: '这不是故障排查——是在零点之前把种子找出来。最值钱的问句仍是："什么情况下这套方案会失效？"',
  },

  hypotheses: [
    { id: 'h-db', text: 'DB 是真正的瓶颈：应用扩 3 倍后 DB 连接与读压力同步放大，"去年没出问题"是侥幸不是容量', excludeActionId: 'a-dbload' },
    { id: 'h-linear', text: '线性外推失效：直播脉冲的流量形状不同，按均值算的 3 倍扩容在脉冲下不够', excludeActionId: 'a-pulsecheck' },
    { id: 'h-drill', text: '降级预案零演练：真用时开关找不到/降级后依赖方故障——纸面预案', excludeActionId: 'a-drillcheck' },
    { id: 'h-scenario', text: '压测单场景假象：未覆盖脉冲与混合场景，全绿不代表能扛真实形状', excludeActionId: 'a-scenecover' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '问清今年与去年"形状"的差异',
      desc: '评审第一问：业务约束变了什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '业务约束盘点',
        text: '总量：12 万 QPS（去年 3.5 万的 3.4 倍）——"3 倍扩容"连总量都没追平。\n形状：新增直播渠道，开抢瞬间秒级脉冲 ×10（去年是匀速爬坡）。\n结构：DB 层负载与上游流量是乘法关系——应用每多一分吞吐，DB 多一分压力。\n→ 三个约束三个问：总量够吗？形状扛得住吗？下游跟得上吗？方案只答了第一问的一半。',
      },
    },
    {
      id: 'a-dbload',
      name: '核算 DB 层的真实容量',
      desc: '应用 ×3 之后，DB 的连接与读压力是多少',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-db'],
      hypotheses: [{ id: 'h-db', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'DB 容量核算',
        text: '连接数：应用实例 ×3 → DB 连接需求超 max_connections 上限 40%（还没算脉冲峰值）\n读 QPS：缓存命中率按真实分布估 60% → 12 万 QPS × 40% 回源 = 4.8 万 DB QPS，超读红线 60%\n"去年没出问题"考古：去年峰值 3.5 万，DB 曾靠人工 kill 慢查询渡劫 40 分钟——侥幸撑过，不是容量足够。\n实锤：DB 是整个方案的瓶颈层，且它被整段跳过了。阻断级缺陷。',
      },
    },
    {
      id: 'a-pulsecheck',
      name: '核算脉冲场景的容量与限流',
      desc: '秒级 ×10 脉冲下，3 倍实例和现在的限流阈值会怎样',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-linear'],
      hypotheses: [{ id: 'h-linear', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '脉冲核算',
        text: '直播开抢：30 秒内流量冲到 10 倍基线——扩容后的实例数按"均值 12 万"算，脉冲瞬时排队；\n现有限流阈值按去年匀速形状设置：脉冲时要么误杀大量正常用户，要么放行打穿下游。\n→ 确认缺陷（非阻断）：容量与限流都要按"脉冲形状"重算——容量是形状的函数，不是均值的函数。',
      },
    },
    {
      id: 'a-drillcheck',
      name: '抽测降级预案的真实可用性',
      desc: '12 项预案抽 3 项现场演练',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-drill'],
      hypotheses: [{ id: 'h-drill', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '抽测结果（3 项）',
        text: '预案 #3（关闭推荐）：开关路径已变更，现场花了 11 分钟才找到——真用时就是 11 分钟的裸奔。\n预案 #7（推荐降级为空）：降级后下游推荐服务对空数据 NPE，连环故障——降级变成引爆。\n预案 #11（限流 50%）：执行正常 ✓\n→ 1/3 可用。"纸面预案"实锤：没演练过的预案不是预案，是愿望清单。',
      },
    },
    {
      id: 'a-scenecover',
      name: '核对压测的场景覆盖',
      desc: '单场景全绿能代表什么',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-scenario'],
      hypotheses: [{ id: 'h-scenario', status: 'excluded' }],
      result: {
        type: 'text',
        title: '压测覆盖核对',
        text: '单场景（500 SKU 固定循环 × 均匀流量）——与真实形状（40 万 SKU、脉冲、混合渠道）完全不同。\n→ 确认为并行缺陷（与压测专项整改合并推进）：单场景全绿在本次评审中不作为容量依据。',
      },
    },
    {
      id: 'a-benefit',
      name: '评估方案框架本身的价值',
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
        text: '四板块框架（扩容/降级/限流/演练）完整且正确；依赖梳理表质量高（全链路 38 个依赖逐项标注）。\n→ 评审结论是补强短板，不是推倒重做——方案作者一年的梳理工作值得保留。',
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
      tests: ['h-db', 'h-linear', 'h-drill', 'h-scenario'],
      hypotheses: [
        { id: 'h-db', status: 'confirmed' },
        { id: 'h-linear', status: 'confirmed' },
        { id: 'h-drill', status: 'confirmed' },
        { id: 'h-scenario', status: 'confirmed' },
      ],
      result: {
        type: 'text',
        title: '评审结论 · 修正清单',
        text: '① DB 按真实形状重新核算：读扩容 + 连接池上限调整（阻断项，零点前必须完成）\n② 脉冲专项压测 + 限流阈值按形状重设\n③ 12 项预案双周内全量演练，不可用的预案修订或删除\n④ 压测数据集与场景真实化（呼应压测专项）\n→ 四项补齐后有条件通过；DB 容量为零点阻断项。',
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
        text: '原方案过审。零点：直播脉冲打穿限流，DB 连接耗尽，12 项预案找到的只有 4 项……\n你批准的不是方案，是零点的排期表故障。',
      },
    },
    {
      id: 'a-veto',
      name: '整体否决，延期大促',
      desc: '【状态变更】容量方案不可靠，建议大促延期',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '否决结果（陷阱动作）',
        text: '大促延期，商业损失巨大；而方案的四板块框架与依赖梳理本可通过补强达标。\n→ 复盘点评：发现缺陷的正确产出是修正清单——把可修复的方案推倒，是评审的另一种失职。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-db', text: '核心阻断缺陷：DB 层未扩容且"去年没出问题"实为人工渡劫——应用 ×3 后 DB 连接超限 40%、读 QPS 超红线 60%，零点必然打挂', correct: true },
    { id: 'rc-linear', text: '真实风险：线性外推不覆盖直播脉冲形状，容量与限流需按脉冲重算', correct: false },
    { id: 'rc-drill', text: '真实风险：12 项预案零演练，抽测 1/3 不可用', correct: false },
    { id: 'rc-scenario', text: '真实风险：压测单场景假象，不构成容量依据（并入压测专项）', correct: false },
  ],

  expertCost: 8,
  restartActionId: 'a-approve',

  expertChain: [
    {
      thought: '评审第一问照例是业务约束：今年与去年相比，总量、形状、结构各变了什么。',
      update: '总量 3.4 倍（3 倍扩容没追平）、形状多了秒级脉冲、结构上 DB 与上游是乘法关系——三个约束三个问。',
      actionId: 'a-impact',
      why: '1⚡ 买到设计边界：容量方案的全部参数都该从"约束"推导——约束变了而参数没变，就是缺陷清单的第一页。',
      conclusion: '三问确立：总量、形状、下游——逐一拷问方案。',
    },
    {
      thought: '先拷问最要命的下游：应用 ×3 后 DB 的账是多少，"去年没出问题"经不经得起翻档案。',
      update: '实锤：连接超限 40%、读 QPS 超红线 60%；去年靠人工 kill 渡劫——侥幸不是容量。阻断级缺陷成立。',
      actionId: 'a-dbload',
      why: '2⚡ 容量核算是把"印象"换成"乘法"：应用与 DB 的负载是放大关系，跳过瓶颈层核算是方案的结构性漏洞——"去年没出问题"的档案里藏着的正是反证。',
      conclusion: 'DB 阻断缺陷实锤 → 其余板块逐项拷问。',
    },
    {
      thought: '形状与预案两问并查：脉冲下的容量够不够、降级开关拉得动拉不动。',
      update: '脉冲缺陷确认（容量/限流需按形状重算）；预案抽测 1/3 可用——"纸面预案"实锤。',
      actionId: 'a-pulsecheck',
      why: '1⚡ 评审要覆盖"算术"与"执行"两个维度：数字错了零点崩，预案拉不动零点也崩——两个都是"方案看起来完整"的暗面。',
      conclusion: '两项确认 → 压测覆盖单独核。',
    },
    {
      thought: '压测覆盖单独定权：单场景全绿在评审中作数吗——它与其他板块是独立缺陷还是重复记账。',
      update: '定权为并行缺陷、并入压测专项整改——评审依据中剔除"单场景全绿"。',
      actionId: 'a-scenecover',
      why: '1⚡ 评审的记账纪律：同一类缺陷（数据集失真）在容量方案里只能"剔除依据"，具体整改归专项——避免评审清单与专项工程重复打架。',
      conclusion: '压测依据剔除 → 评估方案保留价值。',
    },
    {
      thought: '框架价值评估后开修正清单：四项补齐、DB 为阻断——评审结论落笔。停止追问。',
      update: '停止。',
      actionId: '',
      why: '【评审停止规则】四板块全部核验完毕（容量核算/形状/预案/压测依据），修正清单已能开出且每项有验收标准——继续追问不会发现新的结构性缺陷。',
      conclusion: '有条件通过：DB 容量为零点阻断项，其余三项双周内完成。检查单：容量按形状算、瓶颈层必须核算、预案必须演练过、压测场景必须真实。',
    },
  ],

  lessons: [
    {
      text: '容量按"形状"算不按均值外推：脉冲、头部效应、混合渠道都会让"线性外推 3 倍"变成零点的排队与打挂。',
      principle: '架构设计：容量是流量形状的函数——总量之外必须问形状（脉冲倍数/持续时间）与结构（上下游乘法关系）。限流阈值与容量同源：形状变了，阈值必须一起重算。',
    },
    {
      text: '"去年没出问题"要翻档案验证：去年的"没问题"可能是人工渡劫的侥幸——侥幸不是容量，是负债的延期支付。',
      principle: '产品思维：容量核算必须覆盖每一层（应用永远不是最底层瓶颈），瓶颈层的"历史安全记录"要核查它的取得方式。翻历史工单是评审的免费情报：靠人肉救过的火，说明那一层的容量从来就没够过。',
    },
    {
      text: '没演练过的预案不是预案，是愿望清单：开关找不到、降级引爆下游——纸面完备与真实可用之间隔着一次演练。',
      principle: '验证思维：降级/回滚/应急预案的验收标准是"演练通过"，不是"文档存在"。抽测是最便宜的审计——3 项抽测就能给 12 项预案的可信度定性。预案还必须验证"降级后依赖方活得下去"：降级是切换，不是卸责。',
    },
  ],
}
