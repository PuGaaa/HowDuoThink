import { DiagnosisCase } from '../../types/case'

/**
 * 第 8 章 · 测试与质量（mock 泄露 L2）
 * 教学点：程序设计——测试的隔离性是设计出来的：mock 必须有确定性恢复（fixture 作用域/上下文管理器）；
 * 测试之间共享全局状态 = 定时炸弹。
 * 专家路径：impact(1) + isolation(2) + runnorder(1) = 4⚡︎
 */
export const mockLeakCase: DiagnosisCase = {
  id: 'mock-leak',
  title: 'mock 泄露：测试之间互相污染',
  intro: '单测分开跑全绿，合并全量跑挂 3 个；CI 并行化后越跑越乱——有些测试"记得"上一个测试的事。',
  domain: 'build',
  layer: '测试的隔离性是设计出来的，不是运行出来的',
  part: 'master',
  chapterId: 'testing',
  order: 2,
  typeTags: ['testing', 'state'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」支付平台的后端，单测套件有 800+ 用例，今天的 CI 开始变得诡异。',
    architecture: '测试框架(pytest) → 支付客户端(全局单例, 测试中被 mock) → CI 流水线(串行/并行两种模式)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: 'CI 失败报告',
        text: '全量跑：3 个测试失败（test_refund_query / test_refund_retry / test_refund_cancel）\n失败信息：支付网关返回 "MOCK-REFUND-OK-FAKE"——一个根本不存在的响应，来自测试桩。',
      },
      {
        type: 'text',
        title: '开发者困惑',
        text: '这 3 个测试单独跑全部通过；本地按目录跑也通过。\n只有 CI 全量跑才挂——而且上周开始 CI 提速开启并行后，失败的组合每次还不一样。',
      },
    ],
    timeline: '上周 CI 并行化改造上线 ｜ test_payment_refund 系列是两个月前写的（mock 写法最老）｜ 失败从本周开始集中出现',
    impactHint: '"单独跑绿、一起跑挂"+ 失败信息里出现了别的测试的 mock 数据——状态从哪漏过来的？',
  },

  hypotheses: [
    { id: 'h-mockleak', text: '前置测试 mock 了全局支付客户端且未恢复，泄漏给后续所有测试', excludeActionId: 'a-isolation' },
    { id: 'h-order', text: '测试顺序依赖：这些测试隐式假设"必须按声明顺序执行"，乱序暴露假设', excludeActionId: 'a-runnorder' },
    { id: 'h-shared', text: '共享 fixture/单例（DB 连接、缓存、配置）状态被前面测试污染', excludeActionId: 'a-sharedstate' },
    { id: 'h-parallel', text: '并行执行的资源竞争（同端口/同临时文件/同 DB 行锁）导致偶发失败', excludeActionId: 'a-parallelrun' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定失败测试的共同点',
      desc: '影响面：失败集合按什么规律聚集',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '失败聚类',
        text: '失败集合跨 5 次全量跑对比：\n共同点 1：全部在 test_payment_refund 系列之后执行（字母序 p < r）\n共同点 2：失败信息里的假响应 "MOCK-REFUND-OK-FAKE" 只在 refund 系列的 mock 桩里定义\n共同点 3：单独跑全绿——失败依赖"前面有测试跑过"\n→ 失败的根源在"前面"：refund 系列往公共环境里留了东西。',
      },
    },
    {
      id: 'a-isolation',
      name: '最小复现：两个测试的顺序实验',
      desc: '只跑 refund + 一个受害者，验证泄漏',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-mockleak'],
      hypotheses: [{ id: 'h-mockleak', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '最小复现（2 个测试）',
        text: 'pytest test_payment_refund.py::test_refund_ok → ✓\npytest test_refund_query.py 单独跑 → ✓\npytest 两者连跑 → test_refund_query ✗（拿到 FAKE 响应）\n代码审计：refund 系列用 monkey.patch 直接替换全局支付客户端实例，\n函数末尾没有恢复语句——mock 离开函数后继续活在全局单例上。\n实锤：mock 泄漏。写 mock 的人"借了"全局对象，没还。',
      },
    },
    {
      id: 'a-runnorder',
      name: '随机顺序跑 10 轮看失败集合',
      desc: '顺序依赖还是泄漏：随机化实验分离两者',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-order'],
      hypotheses: [{ id: 'h-order', status: 'excluded' }],
      result: {
        type: 'text',
        title: '随机化实验',
        text: '10 轮随机顺序：失败集合永远 = "refund 之后执行的支付类测试"，与具体顺序无关。\n→ 排除"顺序假设"：受害者不关心顺序，只关心"前面有没有人留下 mock"。\n顺序是泄漏的暴露条件，不是原因——把暴露条件当根因修（固定顺序），只会让炸弹埋得更深。',
      },
    },
    {
      id: 'a-sharedstate',
      name: '审计共享 fixture 与单例状态',
      desc: '排除 DB/缓存/配置层的污染',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-shared'],
      hypotheses: [{ id: 'h-shared', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'fixture 审计',
        text: 'DB fixture：事务回滚式清理 ✓ 缓存单例：每个测试重建 ✓ 配置：只读 ✓\n→ 排除共享 fixture：污染只发生在 mock 层——那层恰好没有任何清理机制。',
      },
    },
    {
      id: 'a-parallelrun',
      name: '关闭并行单进程复跑',
      desc: '排除并行资源竞争',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-parallel'],
      hypotheses: [{ id: 'h-parallel', status: 'excluded' }],
      result: {
        type: 'text',
        title: '串行复跑',
        text: '并行度 1 全量跑：3 个失败依旧（只要 refund 在前）。\n→ 排除并行竞争：并行化只是把"顺序"打乱，让泄漏更早、更随机地暴露——它不是根因。',
      },
    },
    {
      id: 'a-leakscan',
      name: '全仓扫描 mock 写法',
      desc: '泄漏是个例还是普遍写法问题',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: 'mock 写法普查',
        text: '全局 patch 23 处：9 处无恢复逻辑（refund 系列 4 处、通知系列 3 处、风控系列 2 处）\n规律：早期写的测试裸 monkey.patch；近期测试已改用 fixture 作用域（自动恢复）\n→ 这不是 3 个测试的 bug，是写法规范的演进断层——旧的定时炸弹还有 9 颗。',
      },
    },
    {
      id: 'a-danger',
      name: 'CI 临时切回进程级隔离',
      desc: '【状态变更】每个测试独立进程运行，强制物理隔离',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '进程隔离后泄漏物理归零，CI 恢复绿。\n代价：CI 时长 ×6（800 用例冷启动开销），每日构建排队。\n→ 止血可接受，但这是"把病人隔离"不是"治病"——根因修复继续。',
      },
    },
    {
      id: 'a-fixfixture',
      name: 'mock 全部收敛到 fixture 作用域',
      desc: '【状态变更】9 处裸 patch 改为 fixture/上下文管理器，作用域结束自动恢复',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '退款/通知/风控三系列全部改造：mock 定义在 fixture 内，teardown 自动恢复。\n回归：全量跑（乱序）连续 20 轮全绿——泄漏清零。',
      },
    },
    {
      id: 'a-fixrandom',
      name: '随机顺序 + 乱序检测进 CI',
      desc: '【状态变更】每日一轮随机顺序全量跑，提前暴露顺序依赖与泄漏',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'CI v2',
        text: '每日构建用随机顺序跑全量：任何"顺序敏感"的测试当轮暴露。\n泄漏和顺序依赖从"上线前夜惊魂"变成"每日晨会清单"。',
      },
    },
    {
      id: 'a-lint',
      name: '自定义 lint 禁止裸全局 patch',
      desc: '【状态变更】CI 静态检查：monkey.patch 全局对象必须走 fixture/上下文管理器',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '规范落进工具',
        text: 'lint 规则上线：检出裸 patch 直接拦截合并。\n写法断层不会再发生——新炸弹从源头停产。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-mockleak', text: 'refund 系列用裸 monkey.patch 替换全局支付客户端且无恢复逻辑，mock 泄漏到全局单例——后续所有支付类测试拿到假响应；CI 并行化打乱顺序让泄漏提前暴露', correct: true },
    { id: 'rc-order', text: '测试隐式依赖声明顺序，乱序执行后假设失效', correct: false },
    { id: 'rc-shared', text: '共享 fixture/单例状态被污染（DB/缓存/配置）', correct: false },
    { id: 'rc-parallel', text: '并行执行的端口/文件/锁资源竞争', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '"单独绿、一起挂"+ 失败信息里出现别人的 mock 数据——先圈失败集合的共同点，泄漏的方向就出来了。',
      update: '失败全部位于 refund 系列之后、假响应只属于 refund 的桩——污染从"前面"流向"后面"。',
      actionId: 'a-impact',
      why: '1⚡︎ 失败信息的"指纹"（FAKE 响应的出处）比任何日志都直接——它明确指认了污染源测试。',
      conclusion: '嫌疑锁定：refund 系列向公共环境泄漏了 mock。',
    },
    {
      thought: '最小复现：两个测试连跑——用最小用例集证实泄漏，也把根因压到代码层面。',
      update: '实锤：裸 monkey.patch 全局单例、无恢复语句——mock 离开测试后继续存活。',
      actionId: 'a-isolation',
      why: '2⚡︎ 两个测试的最小复现是程序设计层面的证据：它把"CI 玄学"还原成"两行代码的借用未还"——确定性复现才能支撑确定性修复。',
      conclusion: 'mock 泄漏实锤。方向：给 mock 建立确定性恢复机制。',
    },
    {
      thought: '顺序假设要单独澄清：随机顺序实验能分离"顺序依赖"和"泄漏暴露"两个纠缠的现象。',
      update: '10 轮随机顺序失败集合恒定 = refund 之后——受害者不关心顺序，只关心污染源。',
      actionId: 'a-runnorder',
      why: '1⚡︎ 不把"暴露条件"当"根因"是这次实验的价值：修成"固定执行顺序"会让测试永远绿、炸弹永远在。',
      conclusion: 'h-order 排除（作为根因），顺序随机化转为检测手段。',
    },
    {
      thought: '全仓普查 mock 写法——一个泄漏实锤后，要评估同类炸弹还有多少颗。',
      update: '9/23 处裸 patch 无恢复：早期写法断层，泄漏是系统性规范缺失不是个例。',
      actionId: 'a-leakscan',
      why: '1⚡︎ 修个例不如修写法：普查把"3 个失败"升级为"9 颗炸弹 + 一个规范缺口"——修复范围由证据重新定义。',
      conclusion: '修复升级：fixture 作用域改造 + lint 源头拦截。',
    },
    {
      thought: '止血（进程隔离）、修复（fixture 改造）、防复发（随机顺序 + lint）四层落地。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（裸 patch 无恢复）✓ 暴露条件（并行乱序）✓ 系统面（9 处同类）✓——个案与系统都覆盖。',
      conclusion: '沉淀：测试隔离性 = 每个测试对公共状态的"借用必须归还"。确定性恢复（fixture/上下文管理器）是测试代码的设计约束，不是可选修养。',
    },
  ],

  lessons: [
    {
      text: '测试借用全局状态必须"借了就还"：裸 monkey.patch 无恢复 = 把 mock 留给后面所有测试当真数据。',
      principle: '程序设计：mock 的生命周期必须绑定测试的生命周期——fixture 作用域或上下文管理器保证 teardown 必然执行。全局单例是最容易被污染的公共区，凡是 patch 全局的写法都要有静态检查拦截。',
    },
    {
      text: '"单独跑绿、一起跑挂"永远是状态泄漏或顺序依赖的签名——永远不要用"固定执行顺序"来修它。',
      principle: '用固定顺序掩盖问题是把炸弹调成哑火：泄漏还在，只是顺序不变就不爆。正确姿势是随机顺序跑进 CI，让顺序依赖和泄漏持续暴露——测不顺的测试是资产（它在报警），不是负债。',
    },
    {
      text: '发现一个泄漏，普查一类写法：修好 3 个失败之前，先知道还有 9 颗同款炸弹。',
      principle: '沉淀思维：个例修复之前先做模式普查（grep 写法、统计无恢复 patch 数量）。把"修复范围"从报错的用例扩展到同类写法——根因修复的单位是"模式"，不是"文件"。',
    },
  ],
}
