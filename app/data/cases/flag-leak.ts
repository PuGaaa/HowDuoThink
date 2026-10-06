import { DiagnosisCase } from '../../types/case'

/**
 * 第 6 章 · 部署与发布（feature flag 泄露 L2）
 * 教学点：验证思维——规则"写对"不等于求值"跑对"；灰度配置上线前必须做求值分布断言；
 * 语义歧义（0~1 还是 0~100）是事故温床。
 * 专家路径：impact(1) + ruleeval(2) + timeout(1) = 4⚡︎
 */
export const flagLeakCase: DiagnosisCase = {
  id: 'flag-leak',
  title: 'feature flag 泄露了未完成功能',
  intro: '退票功能灰度 0.5% 内部白名单，上线 40 分钟后客服收到几十张用户截图：未完成的退票页全量可见。',
  domain: 'deploy',
  layer: '规则写对不等于求值对——配置发布要有求值分布断言',
  part: 'master',
  chapterId: 'deployment',
  order: 2,
  typeTags: ['deploy', 'config'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」平台的基础架构后端，feature flag 平台与新功能灰度发布由你负责。',
    architecture: '客户端(启动拉取 flag) → flag 服务(灰度规则求值) → 退票功能(受 flag: refund-beta 控制)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: 'flag 服务求值日志',
        text: 'rule "refund-beta" 今晚求值结果统计：true 占比 51.7%（35.2 万台设备）。\n预期：仅内部员工白名单约 200 台测试设备为 true。',
      },
      {
        type: 'text',
        title: '用户截图',
        text: '退票入口出现在"我的订单"页；点进去是未完成页面，尾部还有"TODO: 对接客服工单"的开发占位文案。\n有用户走到了退票申请第三步才发现无法提交——投诉里带着截图。',
      },
    ],
    timeline: '今晚 19:00 退票功能灰度发布（flag refund-beta：员工白名单）｜ 19:40 第一张用户截图 ｜ 白名单规则 18:50 由功能开发录入',
    impactHint: '预期 200 人，实际 35 万——先算清真实求值结果和规则意图之间差在哪一层。',
  },

  hypotheses: [
    { id: 'h-unit', text: '灰度比例单位歧义：白名单外配了 0.5 的"放开比例"，平台把小数解析为 50%', excludeActionId: 'a-ruleeval' },
    { id: 'h-cache', text: '客户端用了本地缓存的旧配置（离线包/强缓存），内容是昨晚的全量测试配置', excludeActionId: 'a-pkgver' },
    { id: 'h-failopen', text: 'flag 服务晚高峰超时触发降级，降级默认值 fail-open（默认开启）', excludeActionId: 'a-timeout' },
    { id: 'h-expr', text: '白名单表达式对缺失字段误判：employee_id 为空时表达式反而为 true', excludeActionId: 'a-exprtest' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '分析 35 万台设备的分布形状',
      desc: '影响面：true 的设备按账号/设备/时间怎么分布',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '求值 true 的分布',
        text: '账号维度：无聚集（员工账号占比正常）→ 不是白名单泄漏的形状\n设备维度：无机型/批次聚集 → 不是离线包问题\n时间维度：19:00 发布后立即出现，比率稳定 → 19:00 前的求值全部 false\n→ "一半设备稳定为 true"更像一条比例规则在生效，而不是名单或缓存事故。',
      },
    },
    {
      id: 'a-ruleeval',
      name: '在测试环境复现规则求值',
      desc: '用 1000 个模拟设备跑同一条规则，看真实语义',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-unit'],
      hypotheses: [{ id: 'h-unit', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '规则复现',
        text: '线上规则：{ whitelist: employeeList, percent: 0.5 }\n模拟 1000 台非员工设备求值：true 495 台 → percent: 0.5 被解析为 50%！\n平台文档：percent 字段范围 0~100（百分数语义）。\n开发按 0~1 小数语义写了 0.5，本意是 0.5%——两种读法都能自圆其说。',
      },
    },
    {
      id: 'a-exprtest',
      name: '用边界设备测白名单表达式',
      desc: 'employee_id 空/空串/员工/非员工四类边界',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-expr'],
      hypotheses: [{ id: 'h-expr', status: 'excluded' }],
      result: {
        type: 'text',
        title: '表达式边界测试',
        text: '四类边界设备求值：空值 false、空串 false、员工 true、非员工 false——全部符合预期。\n→ 排除表达式问题：白名单逻辑本身是对的。',
      },
    },
    {
      id: 'a-pkgver',
      name: '核对客户端包内默认配置',
      desc: '离线包/缓存里存的 flag 默认值是什么',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'excluded' }],
      result: {
        type: 'text',
        title: '客户端配置核对',
        text: '离线包内置 refund-beta 默认 false；用户端拉取记录显示 19:00 后从服务端拉到了 true。\n→ 排除缓存问题：true 是服务端实发的，不是本地翻出来的。',
      },
    },
    {
      id: 'a-timeout',
      name: '查 flag 服务晚高峰超时与降级策略',
      desc: '排除 fail-open 降级',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-failopen'],
      hypotheses: [{ id: 'h-failopen', status: 'excluded' }],
      result: {
        type: 'text',
        title: '降级审计',
        text: '19:00-20:00 flag 服务无超时记录；降级策略为 fail-closed（超时默认 false）。\n→ 排除降级问题：而且平台方向本来就是"宁可关不可漏"，设计上没踩这个坑。',
      },
    },
    {
      id: 'a-doccheck',
      name: '审计 percent 字段的文档与校验',
      desc: '平台为什么允许 0.5 这种值通过',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-unit'],
      hypotheses: [],
      result: {
        type: 'text',
        title: '平台审计',
        text: '文档：percent ∈ [0, 100]（百分数）——但 19:00 前该功能从未被用过，没人读过文档。\n平台侧：字段无范围校验、无二次确认，0.5 作为合法数字直接入库。\n→ 语义歧义 + 零校验 + 冷门字段 = 三重巧合引爆。歧义字段必须强类型或强校验。',
      },
    },
    {
      id: 'a-shutdown',
      name: '紧急将 refund-beta 全量置 false',
      desc: '【状态变更】功能对所有人隐藏，占位文案消失',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: 'flag 全量关闭，35 万台设备的退票入口 2 分钟内消失（客户端下次拉取生效）。\n走到第三步的用户工单转人工安抚。\n→ 止血优先于排查：未完成功能暴露的每一分钟都在产生投诉与风险。',
      },
    },
    {
      id: 'a-fixunit',
      name: '修复 percent 语义 + 平台加校验',
      desc: '【状态变更】字段改 percent: 0.05 语义修正 + 平台拒绝 [0,1) 区间小数',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 规则改为 percent: 0.05（0.5% 白名单灰度）\n② 平台新增校验：percent ∈ (0.5, 100]——0~1 区间小数直接拒绝录入，歧义值物理上无法再入库\n③ 字段旁标注示例文案："如 5 表示 5%"',
      },
    },
    {
      id: 'a-fixassert',
      name: '灰度发布增加求值分布断言',
      desc: '【状态变更】配置生效后自动采样求值，分布偏离预期即告警回滚',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '发布流程 v2',
        text: '新流程：规则录入 → 保存 → 自动采样 1 万设备求值 → 分布断言（预期 ±0.5%）→ 通过才放行。\n当晚这种事故会在发布后 1 分钟内被断言拦下，而不是 40 分钟后被客服发现。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-unit', text: 'percent 字段语义歧义（0~1 vs 0~100）：开发按 0.5% 意图录入 0.5，平台解析为 50% 且无范围校验——白名单规则变成半量放开', correct: true },
    { id: 'rc-cache', text: '客户端本地缓存的旧配置未失效，全量测试配置被启用', correct: false },
    { id: 'rc-failopen', text: 'flag 服务超时降级 fail-open，默认放开所有开关', correct: false },
    { id: 'rc-expr', text: '白名单表达式对缺失 employee_id 的用户误判为 true', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-shutdown',

  expertChain: [
    {
      thought: '预期 200 人实际 35 万——先看这 35 万的分布形状，它直接区分"名单泄漏"还是"规则放大"。',
      update: '无任何维度聚集、19:00 起稳定 51.7%——形状是"比例规则在跑"，不是名单也不是缓存。',
      actionId: 'a-impact',
      why: '1⚡︎ 分布形状是最便宜的判别器：名单泄漏会有聚集，缓存事故会有批次，比例错误是均匀的——一张交叉表省掉三次盲查。',
      conclusion: '假设排序更新：h-unit 升为首位，h-cache/h-expr 降权。',
    },
    {
      thought: '测试环境用模拟设备复现同一条规则——不读文档猜语义，直接问平台"0.5 是什么意思"。',
      update: '实锤：1000 台模拟设备 495 台 true——percent: 0.5 被解析为 50%。',
      actionId: 'a-ruleeval',
      why: '2⚡︎ 复现是验证思维的核心动作：语义歧义靠"看代码/读文档"永远各执一词，跑一遍求值立刻分出胜负。',
      conclusion: '单位歧义实锤 → 查平台为什么放行这种值（机制补全）。',
    },
    {
      thought: '两个副嫌疑用 1⚡︎ 各自快查：表达式边界 + 降级策略——排除要留证据，不能靠"感觉没关系"。',
      update: '表达式四类边界全对；降级 fail-closed 且无超时——两个假设有证据地排除。',
      actionId: 'a-timeout',
      why: '1⚡︎ 排除也值成本：复盘时"查过并排除"和"没查"是两种可信度——尤其降级策略这类设计缺陷高发区。',
      conclusion: '嫌疑收敛到 h-unit 单点。',
    },
    {
      thought: '机制补全：为什么歧义值能入库？审计平台的校验与文档。',
      update: '无范围校验 + 冷门字段无人读过文档——歧义 × 零校验 × 冷门三重巧合。',
      actionId: 'a-doccheck',
      why: '2⚡︎ 根因修在两层：值改对只是止血，校验拦住"下一个 0.5"才是修复——平台缺陷不修，事故必然换个人重演。',
      conclusion: '修复清单：显式语义 + 强校验 + 求值分布断言。',
    },
    {
      thought: '止血（全量关）、修复（语义+校验）、流程（发布断言）三层齐了，停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】求值语义 ✓ 平台机制 ✓ 流程缺口 ✓——能解释过去，也能防住未来，排查可以结束。',
      conclusion: '沉淀：flag 的"发布完成"不是保存成功，是求值分布符合预期——配置也要验证，而且要在真实求值层面验证。',
    },
  ],

  lessons: [
    {
      text: '规则"写对"不等于求值"跑对"：灰度配置上线前必须做求值分布断言（采样验证真实放行比例）。',
      principle: '验证思维：配置类变更的验证层在"运行时求值结果"，不在"配置内容审查"。预期 0.5% 实际 51.7%，一条自动断言就能在发布后 1 分钟拦住——把验证从人眼检查升级为机器断言。',
    },
    {
      text: '语义歧义的字段是事故温床：0~1 还是 0~100，必须用强类型或录入校验钉死，靠文档约定等于没约定。',
      principle: '接口设计：歧义只能在边界处消灭——平台校验拒绝 [0,1) 小数、字段旁标注示例、code review 时不接受"我觉得应该是"。凡是"两种读法都合理"的输入，都会在某个深夜被读错。',
    },
    {
      text: '止血优先于排查：未完成功能暴露的每一分钟都在产生投诉，先全量关 flag，再慢慢查。',
      principle: '安全思维：feature flag 的价值就是"随时可关"的止血能力。暴露未完成功能不仅是体验问题——占位文案、未校验的表单、未收口的接口都是攻击面。先关后查，顺序不能反。',
    },
  ],
}
