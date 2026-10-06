import { DiagnosisCase } from '../../types/case'

/**
 * 第 7 章 · 配置与启动 首批（配置键 typo 静默回退 L1）
 * 教学点：验证思维——配置键对不上时框架静默用默认值：配置的"生效断言"要成为习惯；
 * 绑定校验（未知键告警/必填键缺失 fail-fast）让 typo 在启动时尖叫。
 * 专家路径：impact(1) + keydiff(2) + loadcheck(1) = 4⚡︎
 */
export const configTypoCase: DiagnosisCase = {
  id: 'config-typo',
  title: '启动全绿，功能是坏的：键少了一个 s',
  intro: '报表服务的"导出超时"配置怎么改都不生效：配置中心写的 timeouts，代码读的是 timeout——差一个字母。',
  domain: 'deploy',
  layer: '配置键对不上时，框架静默用默认值——生效断言要成为配置的习惯',
  part: 'engineer',
  chapterId: 'config-boot',
  order: 1,
  typeTags: ['config', 'verification'],
  difficulty: 1,

  scene: {
    role: '你是「鲜到家」报表服务的新任负责人，接手第一天就遇到"配置改了像没改"的灵异现象。',
    architecture: '配置中心(Nacos) → 报表服务(启动读取 @Value("${export.timeout}")) → 导出功能(大报表生成)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '现象',
        text: '配置中心 export.timeout 已调到 120s——导出功能的行为依然像 30s（大报表超时失败）。\n应用启动日志全绿，没有任何"配置未生效"的告警。',
      },
      {
        type: 'text',
        title: '前情',
        text: '前任开发口头交接："导出超时默认 30 秒，配置中心可以调。"——"可以调"，但没有验证过真的调得动。',
      },
    ],
    timeline: '配置 3 天前调整为 120s（大促报表变大的预案）｜ 今天的导出失败告警让预案现出原形 ｜ @Value 注入代码一年未动',
    impactHint: '配置中心的值、代码想读的键、运行时实际生效的值——三个数字，先对质再下结论。',
  },

  hypotheses: [
    { id: 'h-typo', text: '配置键拼写不一致：配置中心 timeouts，代码读 timeout——键对不上，@Value 静默回退默认 30s', excludeActionId: 'a-keydiff' },
    { id: 'h-load', text: '配置文件没被加载（未打进包/路径不对）', excludeActionId: 'a-loadcheck' },
    { id: 'h-priority', text: '配置优先级被其他来源覆盖（环境变量/命令行）', excludeActionId: 'a-priority' },
    { id: 'h-profile', text: '部署环境激活了错误的 profile，读的是另一套配置', excludeActionId: 'a-profilecheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '三处对质：配置中心、代码、运行时',
      desc: '影响面：三个"值"各是什么、谁在最后说话',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '三处对质',
        text: '配置中心：export.timeouts = 120000 ✓（你想要的值在这里）\n代码注入：@Value("${export.timeout:30000}") ← 键是 timeout（无 s），默认 30000\n运行时行为：大报表 30s 整被杀——行为与"默认值"精确吻合\n→ 三个值两个世界：配置中心活在 timeouts 的世界，代码活在 timeout 的世界。',
      },
    },
    {
      id: 'a-keydiff',
      name: '逐字符 diff 配置键与注入键',
      desc: 'timeouts vs timeout——差一个字母的世界',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-typo'],
      hypotheses: [{ id: 'h-typo', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '键名逐字符对照',
        text: '配置中心键：export.timeout  s   ← 多一个 s（timeouts）\n代码注入键：export.timeout      ← @Value("${export.timeout:30000}")\nSpring 行为：找不到 export.timeout 的配置源 → 静默使用冒号后的默认值 30000\n无警告、无报错、启动全绿——一个字母的差距，三天的"配置不生效"。\n实锤：typo × 静默默认值 = 配置的薛定谔状态。',
      },
    },
    {
      id: 'a-loadcheck',
      name: '核对配置加载链路',
      desc: '排除"配置没被加载"',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-load'],
      hypotheses: [{ id: 'h-load', status: 'excluded' }],
      result: {
        type: 'text',
        title: '加载核对',
        text: '启动日志确认 Nacos 配置源已连接；同文件其他键（导出行数限制等）全部生效。\n→ 排除加载问题：加载得好好的，只是"名字对不上"的那个键永远等不到值。',
      },
    },
    {
      id: 'a-priority',
      name: '核对配置优先级链',
      desc: '排除被环境变量覆盖',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-priority'],
      hypotheses: [{ id: 'h-priority', status: 'excluded' }],
      result: {
        type: 'text',
        title: '优先级核对',
        text: '环境变量/命令行/JVM 参数中均无 export.* 相关键——不存在更高优先级的覆盖。\n→ 排除优先级。',
      },
    },
    {
      id: 'a-profilecheck',
      name: '核对激活的 profile',
      desc: '排除环境 profile 错误',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-profile'],
      hypotheses: [{ id: 'h-profile', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'profile 核对',
        text: '激活 profile = prod（正确）；各 profile 中都无 timeouts 键的影子——typo 发生在配置中心的"正确 profile"里。\n→ 排除 profile。',
      },
    },
    {
      id: 'a-fixkey',
      name: '修复：统一键名并验证生效',
      desc: '【状态变更】配置中心键改为 export.timeout；启动后断言运行值为 120000',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '键名统一后发布：启动日志读到 120000 ✓\n大报表导出 30s→115s 完成（不再被 30s 掐断）。\n→ 修复后必须断言"运行时读到的值"——这一次，生效是被验证过的。',
      },
    },
    {
      id: 'a-fixbind',
      name: '沉淀：绑定校验 fail-fast',
      desc: '【状态变更】@ConfigurationProperties 替代散落 @Value；未知配置键启动告警；必填键缺失启动失败',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '绑定校验',
        text: '① 配置收敛到 @ConfigurationProperties 类（键集中、IDE 可导航、重构可跟随）\n② 启动校验：未知的 export.* 键打 WARN（typo 当场现形）；必填键缺失直接启动失败\n③ 全仓扫描：另有 2 处散落 @Value 带静默默认值，一并收敛。',
      },
    },
    {
      id: 'a-fixassert',
      name: '沉淀：配置生效断言进发布检查',
      desc: '【状态变更】发布检查单新增：关键配置项"运行时读取值"抽样断言',
      cost: 1,
      gain: 'mid',
      danger: false,
      tests: [],
      hypotheses: [],
      effects: [],
      result: {
        type: 'text',
        title: '检查单',
        text: '发布检查单新增一项：对本次变更涉及的每个配置键，断言"运行时实际读取值 == 期望值"。\n——配置的"改了"要验证成"生效了"，与发布验证边缘节点同理：意图不等于事实。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-typo', text: '配置键 typo：中心写 timeouts、代码读 @Value("${export.timeout:30000}")——键不匹配静默回退默认值 30s，无告警无提示', correct: true },
    { id: 'rc-load', text: '配置文件未加载/路径错误', correct: false },
    { id: 'rc-priority', text: '配置被更高优先级来源覆盖', correct: false },
    { id: 'rc-profile', text: '部署环境激活错误 profile', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-fixkey',

  expertChain: [
    {
      thought: '"改了像没改"——先做三处对质：配置中心的值、代码的注入、运行时的行为。',
      update: '三个值来自两个世界：timeouts（中心）vs timeout（代码）——键名差异浮出。',
      actionId: 'a-impact',
      why: '1⚡︎ 三处对质是配置类问题的标准起手：意图（中心）、实现（代码）、事实（运行时）各读一次，断点在哪一环立刻可见。',
      conclusion: '嫌疑锁定：键名不匹配（h-typo 升权）。',
    },
    {
      thought: '逐字符 diff 两个键名——typo 的确认不需要灵感，需要耐心。',
      update: '实锤：timeouts vs timeout，差一个 s；@Value 的冒号默认值让 typo 静默落地 30000。',
      actionId: 'a-keydiff',
      why: '2⚡︎ 教学核心：静默回退的默认值是"配置 typo"的掩护——框架不报错是因为它认为"默认值也是一种合法选择"。验证思维：默认值必须被显式验证，不能被隐式信任。',
      conclusion: '根因实锤：typo × 静默默认。',
    },
    {
      thought: '加载/优先级/profile 三个常规嫌疑各 1⚡︎ 排除——每个都是"配置不生效"的真实可能，必须留证。',
      update: '加载正常、无覆盖、profile 正确——三个假设有证据排除，嫌疑收敛单点。',
      actionId: 'a-loadcheck',
      why: '1⚡︎ 配置不生效的鉴别诊断有固定四象限（键名/加载/优先级/环境）——逐一留证既是排除，也是给修复后的回归立边界。',
      conclusion: '嫌疑收敛 → 修复与防复发。',
    },
    {
      thought: '修复（键名统一）、防线（绑定校验 fail-fast + 未知键告警）、流程（生效断言进发布检查单）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（typo × 静默默认）✓ 防线（绑定校验）✓ 流程（生效断言）✓——个案、机制、流程三层闭合。',
      conclusion: '沉淀：配置的"改了"要验证成"生效了"——绑定校验让 typo 在启动时尖叫，生效断言让意图变成被验证的事实。',
    },
  ],

  lessons: [
    {
      text: '配置键对不上时框架静默用默认值：@Value 的冒号兜底让 typo 无声无息——"启动全绿"不代表"配置生效"。',
      principle: '验证思维：散落 @Value + 静默默认值是配置 typo 的温床。收敛到 @ConfigurationProperties（键集中可导航）+ 未知键启动告警 + 必填键缺失 fail-fast——typo 的暴露时机应提前到启动那一秒。',
    },
    {
      text: '配置三处对质：配置中心的意图、代码的读取、运行时的行为——断点在哪一环，修复就在哪一环。',
      principle: '验证思维：配置类"改了没生效"的鉴别四象限：键名匹配、加载成功、无更高优先级覆盖、环境 profile 正确——逐一留证。三处对质 + 四象限排除，是配置排查的固定起手式。',
    },
    {
      text: '生效要被断言：发布检查单对每个变更配置键断言"运行时实际读取值 == 期望值"——意图不等于事实。',
      principle: '流程设计：配置变更与发布同构——都要有终态验证。验证的成本（一次启动断言）远低于"静默默认值在生产运行三个月"的代价——尤其当那个默认值的行为是"大报表全部超时"。',
    },
  ],
}
