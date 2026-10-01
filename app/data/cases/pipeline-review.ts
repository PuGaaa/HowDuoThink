import { DiagnosisCase } from '../../types/case'

/**
 * B3-2 · build L3（构建章结业评审）
 * 主训思维：架构设计（自动化的每一步都要有门禁——"自动 merge"是供应链攻击的自动化入口）
 * 次训思维：验证思维（构建缓存的隔离性——一个项目的污染会传染全部）
 * 真实原型：依赖自动升级 bot 无人工审核 + 跨项目共享构建缓存
 * 情绪兽设计：惊讶獭（惊讶）——"流水线 2.0 把上次投毒的教训变成了自动化"
 * 检查单：思维型 3 + 知识型 1
 */
export const pipelineReviewCase: DiagnosisCase = {
  id: 'pipeline-review',
  title: '流水线 2.0 评审——自动化的门禁缺失',
  intro: '构建团队提交"流水线 2.0"方案：依赖机器人自动合并升级 + 全公司共享构建缓存 + 测试并行化提速 50%。三个月前供应链投毒的教训，似乎没被写进方案。',
  domain: 'build',
  layer: '自动化的每一步都要有门禁：没有门禁的自动化，是把人为失误升级为系统性风险',
  part: 'apprentice',
  chapterId: 'build',
  order: 4,
  typeTags: ['build', 'architecture'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」的平台工程评审委员。流水线 2.0 方案宣称"测试提速 50%、依赖永不过时"——但上个月投毒事故的整改清单，你还记得。',
    architecture: 'Git → 流水线 2.0(机器人合并/共享缓存/并行测试) → 制品库 → 生产',
    tag: '评审现场',
    symptoms: [
      {
        type: 'error',
        title: '方案文档 · 关键句',
        text: '① 依赖机器人：minor/patch 版本自动合并（"全绿即合，无需人工"）\n② 构建缓存：全公司统一缓存池（"命中率提升到 90%"）\n③ 测试并行化：按文件切片并行（"耗时砍半"）',
      },
      {
        type: 'text',
        title: '评审输入 · 未竟事项',
        text: '上季度供应链投毒（request-utils@2.1.1）的整改清单第三条：\n"依赖升级必须人工审核 + 内部源白名单"——流水线 2.0 方案中未见落实。',
      },
    ],
    timeline: '投毒事故整改 3 个月前完成（缓存 key 指纹化已落地）｜ 流水线 2.0 计划下月全量启用 ｜ 全公司 12 个服务共用流水线',
    impactHint: '提速与安全不是二选一——但方案里，安全的三条整改去哪了？',
  },

  hypotheses: [
    { id: 'h-bot', text: '依赖机器人自动合并 = 供应链攻击的自动化入口：投毒版本"全绿"也会被合入', excludeActionId: 'a-supply' },
    { id: 'h-cache', text: '全公司共享缓存无项目隔离：一个项目的污染缓存会传染全部 12 个服务', excludeActionId: 'a-cache' },
    { id: 'h-parallel', text: '测试并行化破坏依赖顺序的用例（数据竞争类测试失效）', excludeActionId: 'a-parallel' },
    { id: 'h-keyfix', text: '上次的缓存 key 指纹化修复会在 2.0 中丢失', excludeActionId: 'a-keyfix' },
  ],

  actions: [
    {
      id: 'a-supply',
      name: '联动投毒事故整改清单',
      desc: '三个月前的三条整改，方案落实了几条',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-bot'],
      hypotheses: [{ id: 'h-bot', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '整改落实核对',
        text: '投毒整改三条：① 依赖升级人工审核——方案改为"自动合并"（倒退）\n② 内部源白名单——方案未提及（缺失）\n③ install 后完整性校验——方案未提及（缺失）\n→ 机器人自动合并 = 把投毒事故的根因做成了自动化功能。',
      },
    },
    {
      id: 'a-botpath',
      name: '推演机器人合并的攻击路径',
      desc: '投毒版本"全绿"通过合并需要几步',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-bot'],
      hypotheses: [{ id: 'h-bot', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '攻击路径推演',
        text: '投毒版本发布 → 机器人自动升级 PR → CI 跑测试：\n新版本无破坏性 API 变更 → 测试全绿 → 自动合并 → 自动发布。\n→ 全程零人工。上次投毒靠的是"人没看住"，这次连"看"的环节都被移除了。\n→ 供应链攻击的自动化入口，实锤。',
      },
    },
    {
      id: 'a-cache',
      name: '审查共享缓存的隔离性',
      desc: '12 个项目共用缓存池，污染会不会传染',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '缓存隔离审计',
        text: '缓存 key 无项目维度（全局共享池）；无写入校验（任何项目的产物都可写入）。\n→ A 项目构建产物被恶意注入 → B/C 项目直接命中缓存使用。\n投毒事故的缓存 key 修复（lockfile 指纹）只防了"过期"，没防"跨项目传染"。',
      },
    },
    {
      id: 'a-keyfix',
      name: '核对上次缓存修复的保留状态',
      desc: '缓存 key 的 lockfile 指纹化还在吗',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-keyfix'],
      hypotheses: [{ id: 'h-keyfix', status: 'excluded' }],
      result: {
        type: 'text',
        title: '修复保留核对',
        text: '2.0 方案保留 lockfile 指纹化（修复未丢失）。\n→ 上次修复健在；但指纹化只解决"过期"，不解决"传染"——两个问题不同维度。',
      },
    },
    {
      id: 'a-parallel',
      name: '审查测试并行化的隔离性',
      desc: '按文件切片后，共享数据库的用例会怎样',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-parallel'],
      hypotheses: [{ id: 'h-parallel', status: 'excluded' }],
      result: {
        type: 'text',
        title: '并行隔离评估',
        text: '并行框架自带数据隔离（每 worker 独立 schema）；依赖共享数据库的 12 个用例已标记串行。\n→ 并行化可接受（风险已治理），非阻断项。',
      },
    },
    {
      id: 'a-frequency',
      name: '统计依赖升级的历史频率',
      desc: '量化机器人上线后的暴露频次',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-bot'],
      hypotheses: [{ id: 'h-bot', status: 'up' }],
      result: {
        type: 'text',
        title: '升级频率统计',
        text: '近 90 天依赖升级 PR：147 个（日均 1.6 个）——每个都会被机器人自动合并。\n→ 暴露频次 = 日均 1.6 次供应链赌博；人工审核的边际成本可控（每天 < 10 分钟）。',
      },
    },
    {
      id: 'a-minspec',
      name: '开出最小修正清单',
      desc: '保留提速收益、补齐安全门禁',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-bot', 'h-cache'],
      hypotheses: [
        { id: 'h-bot', status: 'confirmed' },
        { id: 'h-cache', status: 'confirmed' },
      ],
      result: {
        type: 'text',
        title: '评审结论 · 修正清单',
        text: '① 依赖机器人：自动 PR + 人工审核后合并（minor/patch 也不自动）\n② 缓存池加项目维度隔离 + 写入校验\n③ 并行化按方案执行（隔离已治理）\n→ 三项后评审通过：提速与安全兼得。',
      },
    },
    {
      id: 'a-golive',
      name: '跳过修正全量启用流水线 2.0',
      desc: '【状态变更】不等修正清单，提速优先',
      cost: 3,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '启用结果',
        text: '流水线 2.0 全量启用。\n下一次投毒事件发生时：机器人自动把投毒版本合并、自动发布——供应链攻击从"需要绕过门禁"变成"搭顺风车"。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-bot', text: '核心阻断缺陷：依赖机器人自动合并（全绿即合、零人工）——供应链投毒版本"无破坏性变更"即可自动合并并发布，把投毒事故的根因做成了自动化功能', correct: true },
    { id: 'rc-cache', text: '真实风险：全公司共享缓存无项目隔离，单项目污染会传染全部 12 个服务', correct: false },
    { id: 'rc-parallel', text: '测试并行化破坏依赖顺序用例', correct: false },
    { id: 'rc-keyfix', text: '上次的缓存 key 指纹化修复丢失', correct: false },
  ],

  expertCost: 7,
  restartActionId: 'a-golive',

  expertChain: [
    {
      thought: '评审的第一动作：拿上季度投毒事故的整改清单逐条核对——安全整改的落实状态是流水线方案的前置条件。',
      update: '三条整改：一条倒退（人工审核→自动合并）、两条缺失（白名单/完整性校验）——方案建立在未完成的安全基线上。',
      actionId: 'a-supply',
      why: '1⚡ 整改清单核对是流水线评审的前置条件：安全基线未落实的流水线，提速越多风险越大。',
      conclusion: '整改缺口确认 → 推演自动合并的攻击路径。',
    },
    {
      thought: '推演攻击路径：投毒版本从发布到上线需要几步、哪一步有人类决策。',
      update: '全程零人工：投毒版本只要"不破坏 API"就自动合并、自动发布——机器人把供应链攻击做成了自动化。',
      actionId: 'a-botpath',
      why: '2⚡ 攻击路径推演是评审的杀手锏：站在攻击者视角走一遍流程，每一个"无人工"节点都是攻击者的免费通道。',
      conclusion: '自动合并实锤为核心阻断缺陷 → 审查共享缓存的隔离性。',
    },
    {
      thought: '共享缓存的隔离性：12 个项目共用的缓存池，一次投毒是感染一个项目还是全部。',
      update: '无项目隔离 + 无写入校验——缓存成为跨项目污染的传播媒介。与投毒事故同级的传染风险。',
      actionId: 'a-cache',
      why: '2⚡ 缓存隔离审计补全传染维度：上次修复了"过期"维度，这次审计发现"传染"维度——同一基础设施的两个独立风险。',
      conclusion: '修正清单齐了：机器人人工审核 + 缓存项目隔离 + 并行化放行。',
    },
    {
      thought: '并行化隔离已治理（风险放行）、上次修复健在（指纹化保留）、修正清单可交付——评审闭环。',
      update: '停止评审。有条件通过：两项安全修正 + 并行化放行，提速与安全兼得。',
      actionId: '',
      why: '【评审停止规则】缺陷全部有对应修正且不牺牲方案核心收益（提速 50%）——评审的产出是"带条件的通过"，不是"全盘否定"。',
      conclusion: '有条件通过：机器人人工审核 + 缓存项目隔离后启用；并行化与提速收益保留。',
    },
  ],

  lessons: [
    {
      text: '自动化的每一步都要有门禁："全绿即合"的依赖机器人，会把供应链投毒从人为失误升级为自动化流程。',
      principle: '架构设计：自动化改变的是"谁执行"，不改变"该不该执行"。供应链投毒的教训必须转译成流水线的门禁——否则自动化只是让错误的传播更快。',
    },
    {
      text: '安全整改的落实状态是基础设施方案的前置条件：未落实的整改会在新方案里被"顺理成章"地继承。',
      principle: '沉淀思维：评审基础设施方案前，先核对历史事故的整改清单——整改未落实时，新方案会以"设计如此"的方式把旧风险制度化。',
    },
    {
      text: '共享基础设施的隔离性是传染维度的风险：一个项目的污染缓存，可以感染全部 12 个服务。',
      principle: '架构设计：共享缓存/共享制品库必须按项目隔离 + 写入校验。"过期"与"传染"是两个独立维度，修复了一个不等于修复了另一个。',
    },
    {
      text: '评审的产出是"带条件的通过"：指出缺陷的同时保留方案的核心收益，才是有效的评审。',
      principle: '评审方法论：好的评审不是全盘否定——开出最小修正清单，让"提速 50%"与"安全门禁"兼得。全盘否定会让下一次方案学会隐藏，而不是学会正确。',
    },
  ],
}
