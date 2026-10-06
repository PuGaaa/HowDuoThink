import { DiagnosisCase } from '../../types/case'

/**
 * 第 16 章 · 测试与质量 第三批（共享测试环境争抢 L2）
 * 教学点：产品思维——共享环境是把独占资源当公共草地用；临时环境（ephemeral）是隔离的正解；
 * 发布锁与冻结窗口治标，隔离分层治本。
 * 专家路径：impact(1) + envtopo(2) + lockcheck(1) = 4⚡︎
 */
export const envContentionCase: DiagnosisCase = {
  id: 'env-contention',
  title: '昨晚谁又把测试环境覆盖了？',
  intro: '三个团队共用一套测试环境，互相发布的"覆盖战"月均 12 次——验证到一半的功能，服务突然换了个版本。',
  domain: 'build',
  layer: '共享环境把独占资源当公共草地——隔离分层才是秩序',
  part: 'master',
  chapterId: 'testing',
  order: 7,
  typeTags: ['testing', 'process', 'architecture'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」测试平台的负责人，群里每周上演的"谁覆盖了谁"大战由你终结。',
    architecture: '测试环境(1 套: 网关 + 30 个服务 + 共享 DB) ← 9 个团队各自发布 ｜ 发布方式：直接覆盖部署',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '事故台账',
        text: '月均 12 次"覆盖事故"：A 团队验证中的功能被 B 团队的发布替换。\n最严重一次：版本验证通过后 10 分钟被覆盖——带着未验证代码上了生产。',
      },
      {
        type: 'text',
        title: '群聊实录',
        text: '"昨晚谁又把测试环境覆盖了？我的验证白做了！"\n"我发的没毛病啊，你验证的是上周的版本吧？"——各说各话，无账可查。',
      },
    ],
    timeline: '测试环境建设 2 年（服务从 8 个长到 30 个，团队从 3 个到 9 个）｜ 环境架构从未扩容 ｜ 曾引入"发布锁"但冲突依旧',
    impactHint: '覆盖战的结构：9 个团队 × 1 套环境 × 直接覆盖——这不是谁的错，是没有"租户"概念的房子。',
  },

  hypotheses: [
    { id: 'h-shared', text: '单环境无租户隔离：发布即全局覆盖，任何团队的验证现场随时可能被抹掉', excludeActionId: 'a-envtopo' },
    { id: 'h-lock', text: '无发布锁，并发发布互相踩踏', excludeActionId: 'a-lockcheck' },
    { id: 'h-data', text: '共享测试数据被互相重置，验证结果互相污染', excludeActionId: 'a-dataset' },
    { id: 'h-schedule', text: '发布窗口排班冲突，两团队预约同一时段', excludeActionId: 'a-schedulelog' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '给 12 次事故画冲突画像',
      desc: '影响面：冲突的时间关系、团队关系、伤害深度',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '冲突画像',
        text: '并发同时发布：仅 2/12（同时刻写冲突）\n先后覆盖：10/12（A 验证中，B 发布替换——时间上错开的"覆盖"）\n伤害最深：验证通过后被覆盖 → 未验证代码上生产（隔离缺失的伤害穿透）\n→ 8 成冲突是"顺序覆盖"——发布锁防得住"同时"，防不住"先后"。',
      },
    },
    {
      id: 'a-envtopo',
      name: '审计环境拓扑与租户概念',
      desc: '1 套环境 × 9 个团队：发布的"影响半径"是多大',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-shared'],
      hypotheses: [{ id: 'h-shared', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '拓扑审计',
        text: '环境架构：1 套共享环境，无命名空间、无租户、无版本路由。\n发布语义：部署 = 全局替换（30 个服务里被覆盖的那个，对所有团队生效）。\n→ 任何团队的发布影响半径 = 全部 9 个团队——"环境"被当独占资源用，\n实际是公共草地：这是结构性缺陷，冲突次数只是它的账单。',
      },
    },
    {
      id: 'a-lockcheck',
      name: '评估发布锁的实际效果',
      desc: '锁防住了什么、没防住什么',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-lock'],
      hypotheses: [{ id: 'h-lock', status: 'excluded' }],
      result: {
        type: 'text',
        title: '锁效果评估',
        text: '发布锁上线 3 个月：同时发布冲突归零 ✓\n先后覆盖冲突依旧（10/12）✗——锁只防"同时写"，不防"顺序覆盖"。\n→ 排除锁作为解法：它止痛不治病——顺序覆盖需要的是"各自的现场"，不是"轮流用现场"。',
      },
    },
    {
      id: 'a-dataset',
      name: '核对共享数据集的污染',
      desc: '数据重置在冲突中的占比',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-data'],
      hypotheses: [{ id: 'h-data', status: 'down' }],
      result: {
        type: 'text',
        title: '数据评估',
        text: '共享 DB 的数据重置确实是覆盖的一部分（3/12 事故以数据重置为主诉）。\n→ 降权并入主因：即便数据不重置，服务版本覆盖已足以摧毁验证现场——数据是伤害的放大器，版本覆盖是本体。',
      },
    },
    {
      id: 'a-schedulelog',
      name: '核对排班预约记录',
      desc: '排除"协调失败"叙事',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-schedule'],
      hypotheses: [{ id: 'h-schedule', status: 'excluded' }],
      result: {
        type: 'text',
        title: '排班核对',
        text: '预约排班表存在但 10/12 次覆盖是"无预约的突袭发布"（紧急验证/临时联调）。\n→ 排除排班：靠人协调的秩序，覆盖不了真实的发布节奏——协调是补丁，隔离才是结构。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急推行每周三天发布冻结',
      desc: '【状态变更】周二/四/六冻结测试环境发布',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '冻结结果',
        text: '冲突归零（冻结日没得冲突）。\n代价：发布吞吐 -60%，迭代节奏被拖垮，"冻结日偷偷发"开始出现（又回到无序）。\n→ 复盘点评：冻结是排队，排队治不了结构——9 个团队的需求是真实的，缺的是能并行的基础设施。',
      },
    },
    {
      id: 'a-fixephemeral',
      name: '修复：临时环境（Ephemeral Env）',
      desc: '【状态变更】按 PR/按团队自动拉起命名空间级临时环境，用完销毁',
      cost: 3,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '临时环境落地',
        text: '① 模板化拉起：PR 关联自动创建命名空间（依赖服务走共享基座 + 被测服务独立部署）\n② 生命周期自动管理：合并/关闭自动销毁（空闲 24h 回收）\n③ 回归：三个月零覆盖事故；团队发布吞吐 ↑200%（从排队到并行）——隔离不是成本，是吞吐。',
      },
    },
    {
      id: 'a-fixlayer',
      name: '沉淀：隔离分层策略',
      desc: '【状态变更】功能验证=临时环境 ｜ 联调=团队专属命名空间 ｜ 集成验收=受控共享环境（有准入与预约）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '分层策略',
        text: '环境按"隔离强度"分层：\n功能自测：临时环境（最强隔离，零冲突）\n跨团队联调：团队命名空间（弱共享）\n集成验收：受控共享环境（预约+准入+变更通知）\n→ 每种协作模式有自己的环境形态——一套环境打天下是冲突的根源。',
      },
    },
    {
      id: 'a-fixproduct',
      name: '沉淀：环境即产品',
      desc: '【状态变更】环境负责人 + SLA（拉起 < 10min）+ 用量看板——环境从公共草地变有主服务',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '环境运营',
        text: '环境平台化：负责人/SLA/用量看板/成本分摊——"环境"有了产品化的运营身份。\n共享环境保留但"有准入、有账单"——公共草地的悲剧，靠产权与规则终结。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-shared', text: '单套测试环境无租户隔离：9 团队直接覆盖部署，发布影响半径 = 全部团队——先后覆盖（10/12）无法用发布锁防治，最严重时未验证代码借"已验证"假象上了生产', correct: true },
    { id: 'rc-lock', text: '无发布锁导致并发发布踩踏（锁已防住，仅占 2/12）', correct: false },
    { id: 'rc-data', text: '共享测试数据被互相重置（伤害放大器）', correct: false },
    { id: 'rc-schedule', text: '发布排班冲突（2/12，协调无法覆盖突袭发布）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '12 次冲突两种形态：同时踩踏与先后覆盖——先画冲突画像分清比例，解法完全不同。',
      update: '并发仅 2/12、先后覆盖 10/12——主冲突是"顺序覆盖"，锁类方案先天不够。',
      actionId: 'a-impact',
      why: '1⚡︎ 冲突形态的画像决定解法族谱：同时写 → 锁；顺序覆盖 → 隔离。画像画错，修复就会在锁上继续加码。',
      conclusion: '主冲突定性：顺序覆盖 → 结构缺陷（h-shared 升权）。',
    },
    {
      thought: '审计环境拓扑：发布的影响半径是多大——一发布，几个人受伤。',
      update: '实锤：1 套环境 × 9 团队 × 全局替换语义——影响半径 = 全公司。结构性缺陷确认。',
      actionId: 'a-envtopo',
      why: '2⚡︎ 影响半径是共享资源的核心度量：半径 = 全员意味着"没有租户概念"——这不是管理问题（加锁/排班都治不了），是基础设施缺一间"每人自己的房间"。',
      conclusion: '根因实锤：环境无租户隔离。',
    },
    {
      thought: '发布锁单独评估：它防住的与没防住的——避免"再加强锁"的错误投入。',
      update: '锁防住并发（2/12）、防不住顺序覆盖（10/12）——排除锁作为解法，确认其为止痛药。',
      actionId: 'a-lockcheck',
      why: '1⚡︎ 已有措施的效果评估是关键的中间步骤：它防止"在止痛药上加量"的惯性——锁的失败恰恰是隔离必要性的最佳论据。',
      conclusion: '锁定位止痛 → 数据与排班快排。',
    },
    {
      thought: '数据重置降权并入主因，排班叙事排除——冻结窗口是排队不是秩序。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】结构（无租户）✓ 形态（顺序覆盖为主）✓ 防线（临时环境+分层）✓——机制、结构、防线三层闭合。',
      conclusion: '沉淀：共享环境是公共草地——隔离分层（临时环境/专属命名空间/受控共享）+ 环境产品化，让 9 个团队从排队发布回到并行验证。',
    },
  ],

  lessons: [
    {
      text: '共享测试环境是公共草地：无租户概念时，任何一个团队的发布影响半径都是全部团队——顺序覆盖是结构缺陷不是协调失误。',
      principle: '产品思维：先画"发布影响半径"——半径=全员的环境必然冲突频发，加锁/排班只是把冲突推迟。隔离分层（临时环境/团队命名空间/受控共享）让每种协作模式有自己的环境形态，冲突在结构上消失。',
    },
    {
      text: '临时环境（ephemeral）是隔离的正解：按 PR 自动拉起、用完销毁——隔离不是吞吐的敌人，排队才是。',
      principle: '架构设计：模板化拉起 + 生命周期自动管理让"一人一环境"的成本可控（依赖走共享基座，被测服务独立）。三个月零冲突 + 吞吐 200% 的数据证明：隔离的投入回报是正向的，它买到的是"验证现场不被摧毁"的基本尊严。',
    },
    {
      text: '冻结窗口是排队，排队治不了结构：冻结日"偷偷发"会卷土重来——需求是真实的，缺的是能并行的基础设施。',
      principle: '治理判断：当"限制使用"与"扩容供给"二选一时，先看需求是否真实且持续——9 个团队的发布需求不会消失。限制只应作为"供给建设期"的临时措施，且要登记解除条件，否则限制本身成为新的瓶颈与灰色地带。',
    },
  ],
}
