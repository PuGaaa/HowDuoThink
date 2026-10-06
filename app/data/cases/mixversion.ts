import { DiagnosisCase } from '../../types/case'

/**
 * 第 14 章 · 部署与发布（滚动更新版本混合 L2）
 * 教学点：滚动更新的物理事实——新旧实例必然共存；API 契约必须 N-1/N+1 双向兼容；
 * "时好时坏"+与实例分布相关 = 混合窗口特征。
 * 专家路径：impact(1) + schemadiff(2) + lbcheck(1) = 4⚡︎
 */
export const mixVersionCase: DiagnosisCase = {
  id: 'mixversion',
  title: '滚动更新版本混合：新旧 API 互相调不通',
  intro: '订单服务滚动更新到第 3 批，错误率突增 8%：同一用户有时成功有时失败——请求打到新旧实例结果不同。',
  domain: 'deploy',
  layer: '滚动更新必有混合窗口——契约必须双向兼容',
  part: 'master',
  chapterId: 'deployment',
  order: 3,
  typeTags: ['deploy', 'contract'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」订单服务的负责人，今晚 v2.7 滚动更新进行到一半。',
    architecture: 'App → 网关 → 订单服务(10 实例: v2.6×4 / v2.7×6 混合) → DB(schema 已迁移)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '错误日志抽样',
        text: '400 Bad Request: "unknown field: couponBatchId"\n全部来自 v2.6 旧实例的入参校验器；v2.7 实例零 400。',
      },
      {
        type: 'text',
        title: '用户侧表现',
        text: '同一用户点"提交订单"：有时成功有时报"参数错误"——重试可能就好。\n错误率 8% 且随更新批次推进波动。',
      },
    ],
    timeline: '今晚 21:30 开始滚动更新（10 实例分 5 批）｜ 第 3 批后错误率爬升 ｜ v2.7 客户端今天下午已热更：新版本 App 会在下单请求里带 couponBatchId（优惠券批次）字段',
    impactHint: '时好时坏 + 与实例相关——混合窗口里，谁在校验谁的字段？',
  },

  hypotheses: [
    { id: 'h-contract', text: '新客户端带的新字段 couponBatchId 打到 v2.6 旧实例，被严格校验拒绝（契约不兼容）', excludeActionId: 'a-schemadiff' },
    { id: 'h-lb', text: '负载均衡配置变更，请求被异常集中路由到部分实例', excludeActionId: 'a-lbcheck' },
    { id: 'h-schema', text: '数据库 schema 未迁移，新实例写库失败', excludeActionId: 'a-dbcheck' },
    { id: 'h-config', text: '新实例配置错误，功能开关/依赖读不到', excludeActionId: 'a-configcheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定错误的三维分布',
      desc: '影响面：错误按实例/字段/用户怎么分布',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '错误分布交叉表',
        text: '实例维度：400 全部来自 v2.6 旧实例（v2.7 零 400）\n字段维度：100% 集中在 couponBatchId（下午热更后客户端开始发送）\n用户维度：同一用户重试成功率 = 命中新实例的概率\n→ 错误 = 新客户端流量 × 打到旧实例——一个纯粹的"混合窗口"现象。',
      },
    },
    {
      id: 'a-schemadiff',
      name: '对比新旧版本的请求 schema 校验策略',
      desc: 'v2.6 拒绝未知字段的策略是什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-contract'],
      hypotheses: [{ id: 'h-contract', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'schema 校验 diff',
        text: 'v2.6 入参模型：extra = "forbid"  ← 未知字段直接 400\nv2.7 入参模型：couponBatchId: Optional[str]（新增可选字段）\n客户端 v2.7：下单请求体已带 couponBatchId\n→ 新字段 + 旧实例严格校验 = 必然 400。滚动更新的混合窗口里这是结构性冲突，不是偶发。',
      },
    },
    {
      id: 'a-lbcheck',
      name: '查负载均衡路由分布',
      desc: '排除路由异常集中',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-lb'],
      hypotheses: [{ id: 'h-lb', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'LB 路由审计',
        text: '轮询均匀，各实例 QPS 差异 < 3%。\n错误分布与"旧实例占比"精确吻合——路由没坏，是路由到的内容有敏感差异。\n→ 排除 LB 故障：它反而解释了"时好时坏"（轮询 = 概率性命中旧实例）。',
      },
    },
    {
      id: 'a-dbcheck',
      name: '查 DB schema 迁移与写库错误',
      desc: '排除数据库层问题',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-schema'],
      hypotheses: [{ id: 'h-schema', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'DB 检查',
        text: 'coupon_batch_id 列今晚 DDL 已提前加好（扩大兼容窗口的正确操作）；写库零错误。\n→ 排除 DB：错误死在入参校验层，根本没到 SQL。',
      },
    },
    {
      id: 'a-configcheck',
      name: '对比新旧实例配置与健康度',
      desc: '排除新实例配置错误',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-config'],
      hypotheses: [{ id: 'h-config', status: 'excluded' }],
      result: {
        type: 'text',
        title: '配置对比',
        text: 'v2.7 六个实例健康检查全绿，内部依赖调用正常。\n→ 排除新实例问题：出错的反而是"没动的"旧实例——被动接了新契约。',
      },
    },
    {
      id: 'a-grayscale',
      name: '量化混合窗口与错误率的关系',
      desc: '错误率 = 旧实例占比 × 新客户端流量占比？',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '混合窗口函数',
        text: '第 3 批：旧实例 4/10，热更渗透 20% → 预测错误率 20%×0.4 = 8.0% ✓ 实测 8.1%\n第 5 批完成后：旧实例 0 → 预测错误率归零\n→ 公式成立。错误率不是随机噪声，是混合窗口的确定函数——窗口闭合，错误消失，但根因还在。',
      },
    },
    {
      id: 'a-pause',
      name: '暂停滚动更新，冻结当前批次',
      desc: '【状态变更】停在 6/10 混合态，阻止窗口继续变化',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '冻结结果',
        text: '更新暂停在第 3 批。混合窗口稳定（错误率锁定 8%），不再随批次波动。\n→ 为契约修复争取稳定环境——继续滚动只会让排查变量继续漂移。',
      },
    },
    {
      id: 'a-hotfix',
      name: 'v2.6 校验策略改宽容 + 灰度客户端字段',
      desc: '【状态变更】旧实例 unknownFieldsPolicy: forbid→ignore，客户端字段按服务端版本灰度发送',
      cost: 3,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① v2.6 热修：extra=ignore（服务端对未知字段宽容）→ 旧实例不再 400\n② 客户端改为"探测服务端版本再决定是否发送 couponBatchId"\n③ 继续完成剩余批次，错误率归零。\n→ 双向兼容落地：服务端宽容旧契约，客户端克制新契约。',
      },
    },
    {
      id: 'a-contractci',
      name: '契约测试矩阵进 CI',
      desc: '【状态变更】N-1/N+1 兼容矩阵：新客户端×旧服务端、旧客户端×新服务端',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'CI 契约矩阵',
        text: '每次发布必跑四个象限：新服务端×新客户端 / 新服务端×旧客户端 / 旧服务端×新客户端 / 旧服务端×旧客户端。\n本次事故的组合（新客户端×旧服务端）从"上线后用户发现"提前到"合并前流水线拦截"。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-contract', text: '契约不兼容：v2.7 客户端带新字段 couponBatchId，v2.6 旧实例入参校验 extra=forbid 直接拒绝——滚动更新混合窗口里的结构性冲突', correct: true },
    { id: 'rc-lb', text: '负载均衡路由异常，请求集中打到部分实例', correct: false },
    { id: 'rc-schema', text: '数据库 schema 未迁移，写库失败', correct: false },
    { id: 'rc-config', text: '新实例配置错误导致功能异常', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-pause',

  expertChain: [
    {
      thought: '时好时坏 + 与实例相关——先画错误的三维分布（实例×字段×用户），让"随机"现出原形。',
      update: '400 全来自旧实例、全集中在新字段、用户重试成功率=命中新实例概率——混合窗口现象。',
      actionId: 'a-impact',
      why: '1⚡︎ 三维交叉把"8% 的错误"分解成两个比例的乘积——分解维度选对了，根因就只剩下"读代码确认"一步。',
      conclusion: '假设升权：契约不兼容（h-contract）；LB 降权（路由均匀）。',
    },
    {
      thought: '读新旧两版的校验策略——"谁在校验谁的字段"这一问的最终答案在代码里。',
      update: '实锤：v2.7 新增可选字段，v2.6 extra=forbid——新契约撞上旧校验器，结构性必然。',
      actionId: 'a-schemadiff',
      why: '2⚡︎ schema diff 给出机制级的"必然"：不是配置手误、不是环境差异，是两份契约在共存窗口里天然互斥。',
      conclusion: '根因实锤。修复方向：双向兼容（服务端宽容 + 客户端克制）。',
    },
    {
      thought: 'DB 和配置用 1⚡︎ 各查一次——排除要留证据：迁移是否提前做了、新实例是否健康，都写进复盘。',
      update: 'DDL 已提前加好（操作正确），新实例全绿——两层有证据排除。',
      actionId: 'a-dbcheck',
      why: '1⚡︎ 顺带确认了发布流程里做对的部分：DDL 先行是教科书操作——复盘要记功也要记账。',
      conclusion: '嫌疑收敛单点；流程中正确动作同时被记录。',
    },
    {
      thought: '验证"混合窗口函数"：错误率 = 旧实例占比 × 新客户端渗透——公式若成立，机制就是完备的。',
      update: '实测 8.1% vs 预测 8.0%——公式成立，窗口闭合错误自然归零，但根因潜伏到下一次发布。',
      actionId: 'a-grayscale',
      why: '1⚡︎ 量化验证堵死侥幸心理："等更新完就好了"是错觉——窗口每次发布都会重开，除非契约兼容成为制度。',
      conclusion: '机制完备 → 进入修复与沉淀。',
    },
    {
      thought: '冻结窗口 → 热修校验策略 → 契约矩阵进 CI。三层动作对应止血/修复/防复发。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（extra=forbid）✓ 量化（窗口函数成立）✓ 制度（契约矩阵）✓——过去、现在、未来都覆盖。',
      conclusion: '沉淀：滚动更新的第一性问题不是"怎么滚得快"，是"混合窗口里新旧如何共存"——契约双向兼容是滚动更新存在的前提。',
    },
  ],

  lessons: [
    {
      text: '滚动更新的物理事实：新旧实例必然共存一段时间——API 契约必须 N-1/N+1 双向兼容，否则每次发布都是一次赌博。',
      principle: '架构设计：兼容性是滚动更新的前提而非优化项。服务端对未知字段默认宽容（extra=ignore），新字段的消费端要容忍缺失；确需 strict 校验的字段必须等全量升级完成后收紧。',
    },
    {
      text: '"时好时坏"+与实例分布相关 = 混合窗口特征：错误率 ≈ 新流量占比 × 旧实例占比，它不是随机噪声。',
      principle: '验证思维：把"偶现"翻译成公式。两个比例的乘积能精确复现观测值时，机制就被证明是完备的——量化验证既确认根因，也堵死"等发布完自然好了"的侥幸。',
    },
    {
      text: '数据库 DDL 先行、代码后上：扩大兼容窗口的标准操作，这次做对了——复盘既要记账也要记功。',
      principle: '发布设计：兼容窗口的每个环节（DDL → 服务端宽容 → 客户端灰度 → 收紧校验）都有先后顺序。把顺序写成检查单，下次发布就不会靠记忆赌运气。',
    },
  ],
}
