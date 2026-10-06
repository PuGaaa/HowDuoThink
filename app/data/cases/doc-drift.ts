import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 接口与契约 第二批（文档与实现漂移 L2）
 * 教学点：验证思维——文档不是事实，实现才是：联调争议用"实现序列化结果"裁决；
 * 文档必须由代码生成（CI 一致性断言），文档即 mock。
 * 专家路径：impact(1) + docvscode(2) + versioncheck(1) = 4⚡︎
 */
export const docDriftCase: DiagnosisCase = {
  id: 'doc-drift',
  title: '联调三天全在对字段：文档与实现打架了',
  intro: '合作方按 swagger 文档对接库存接口，三天连报类型错误——文档说 string，实现返回 int，谁才是事实？',
  domain: 'build',
  layer: '文档不是事实，实现才是——契约由代码生成，一致性由 CI 保证',
  part: 'engineer',
  chapterId: 'contract',
  order: 2,
  typeTags: ['contract', 'process'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」开放平台的接口负责人，一个重要合作方的对接工程师已经三天没睡好了。',
    architecture: '合作方对接系统 → swagger 文档站(三个月前生成) → 库存接口(代码此后变更 4 次) → 库存服务',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '对接报错清单',
        text: '合作方按文档传 stock: "123"（string，文档如此）→ 实现按 int 解析 → 反序列化失败\n差异字段累计 5 个类型不符 + 2 个文档有但实现没有 + 3 个实现有但文档没有',
      },
      {
        type: 'text',
        title: '双方立场',
        text: '合作方："文档就这么写的，我按文档对接。"\n内部开发："接口早就改了，文档是老的。"\n文档站显示"最后更新：三个月前"——代码此后发布了 4 个版本。',
      },
    ],
    timeline: '文档三个月前生成 ｜ 代码 4 次变更均未更新注解 ｜ 合作方对接窗口本周截止（上线排期卡死）',
    impactHint: '文档与实现打架——但"文档错"只是结论，要紧的是：漂了 4 次没人发现，机制上少装了什么报警器？',
  },

  hypotheses: [
    { id: 'h-drift', text: '文档与实现漂移：swagger 由注解生成，代码改了 4 次注解没跟上——文档是三个月前的快照', excludeActionId: 'a-docvscode' },
    { id: 'h-version', text: '合作方用错版本文档（v1 文档对接 v2 接口）', excludeActionId: 'a-versioncheck' },
    { id: 'h-serial', text: '全局序列化配置与注解冲突，实现的行为偏离代码本意', excludeActionId: 'a-serialconf' },
    { id: 'h-script', text: '合作方对接脚本自身 bug，误报类型错误', excludeActionId: 'a-scriptcheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '建立差异字段全清单',
      desc: '影响面：漂移覆盖多少字段、哪些是阻断项',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '差异清单（文档 vs 实现逐字段比对）',
        text: '类型不符 ×5：stock(string→int)、updateTime(string→long)、price(float→分 int)…\n文档有实现无 ×2：warehouseCode、regionTag（代码已删）\n实现有文档无 ×3：stockVersion、frozenFlag、warehouseTier\n阻断项：5 个类型不符（反序列化直接失败）；其余为"按文档写会踩空"。\n→ 漂移是系统性的：不是一处笔误，是"文档停更"的整体状态。',
      },
    },
    {
      id: 'a-docvscode',
      name: '逐字段裁决：文档 vs 实现序列化结果',
      desc: '拿真实响应当裁判——文档与代码各执一词时，序列化结果是唯一事实',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-drift'],
      hypotheses: [{ id: 'h-drift', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '实现序列化结果（真实现场）',
        text: 'GET /stock/889 真实响应：\n{ "stock": 123, "updateTime": 1727901234567, "price": 880,\n  "stockVersion": 7, "frozenFlag": 0, "warehouseTier": "A" }\n对照文档：类型 5 处不符 ✓、缺失 2 字段 ✓、多出 3 字段 ✓\ngit 考古：文档生成于 3 个月前 tag v1.4；此后 4 次变更（改类型×2/删字段×2/加字段×3）注解均未更新。\n实锤：文档是三个月前的快照——"事实"早已搬走，告示牌没换。',
      },
    },
    {
      id: 'a-versioncheck',
      name: '核对合作方使用的文档版本',
      desc: '排除"用错版本文档"',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-version'],
      hypotheses: [{ id: 'h-version', status: 'excluded' }],
      result: {
        type: 'text',
        title: '版本核对',
        text: '合作方引用的正是文档站当前首页链接——只有一个版本可看，且是过期的。\n→ 排除版本误用：不是"看错了文档"，是"唯一的文档就是错的"。',
      },
    },
    {
      id: 'a-serialconf',
      name: '核对全局序列化配置',
      desc: '排除配置与注解冲突',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-serial'],
      hypotheses: [{ id: 'h-serial', status: 'excluded' }],
      result: {
        type: 'text',
        title: '序列化核对',
        text: '全局 ObjectMapper 配置 8 个月未动；实现响应与代码 DTO 逐字段一致。\n→ 排除序列化冲突：实现忠实于代码，代码忠实于业务——只有文档掉队。',
      },
    },
    {
      id: 'a-scriptcheck',
      name: '复核合作方的对接脚本',
      desc: '排除脚本误报',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-script'],
      hypotheses: [{ id: 'h-script', status: 'excluded' }],
      result: {
        type: 'text',
        title: '脚本复核',
        text: '合作方脚本按文档定义的类型做严格校验——行为正确（恰恰因为它正确，才暴露了文档的错）。\n→ 排除脚本：认真的人被过期的地图坑得最深。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急锁定文档站为只读旧版',
      desc: '【状态变更】文档站挂"维护中"横幅，阻止继续误导',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '锁站结果',
        text: '误导停止（没人再被旧文档坑）。\n但合作方仍在等"正确的文档"——锁站只是止血，产出正确契约才是交付。',
      },
    },
    {
      id: 'a-fixgen',
      name: '修复：文档由代码生成 + CI 一致性断言',
      desc: '【状态变更】OpenAPI 注解强制化；CI 断言"生成的文档 == 实现序列化快照"',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 文档改为构建期从代码生成（OpenAPI 注解缺失编译告警）\n② CI 断言：每次合并自动请求真实接口、与生成的 schema 逐字段比对，不一致拦截合并\n③ 修正后的文档当日发布给合作方——对接两天内完成（此前已耗三天）。',
      },
    },
    {
      id: 'a-fixmock',
      name: '沉淀：文档即 mock 服务',
      desc: '【状态变更】按 schema 自动生成 mock 端点供合作方联调——文档错了，mock 也错，互相暴露',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'mock 服务',
        text: 'schema → mock 端点自动生成：合作方对着 mock 开发，真实联调只剩环境验证。\n文档与实现再次漂移时，mock 会与真实接口一起漂移——两份"按文档写的代码"\n在真实联调时必然对撞，漂移无处藏身。',
      },
    },
    {
      id: 'a-fixprocess',
      name: '沉淀：契约变更 checklist',
      desc: '【状态变更】改接口必改注解；字段变更走"文档 diff"评审；对接窗口前 3 天冻结契约',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '流程 v2',
        text: '① 改接口代码必同步 OpenAPI 注解（CI 强制）\n② 契约字段变更进评审（对外接口）\n③ 对外对接窗口前 3 天契约冻结——冻结期的变更默认拒绝。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-drift', text: 'swagger 文档由注解生成但代码 4 次变更注解未更新：文档停留在三个月前快照（5 处类型不符/2 删/3 漏）——合作方按文档对接必然失败，且无任何机制发现漂移', correct: true },
    { id: 'rc-version', text: '合作方拿 v1 旧版文档对接 v2 接口', correct: false },
    { id: 'rc-serial', text: '全局序列化配置与注解冲突，实现偏离代码', correct: false },
    { id: 'rc-script', text: '合作方对接脚本自身 bug 误报', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '先建差异全清单：不是裁决"谁对"，而是量化"漂了多远"——漂移的范围决定它是笔误还是机制缺失。',
      update: '5 类型 + 2 删 + 3 漏——系统性漂移：文档整体停留在三个月前。',
      actionId: 'a-impact',
      why: '1⚡︎ 清单先行的价值：单字段差异可能是笔误，全字段漂移必然是"停更机制"问题——范围直接改变修复的层级。',
      conclusion: '定性完成：机制性停更（h-drift 升权）。',
    },
    {
      thought: '逐字段裁决：拿实现的真实序列化响应当裁判——文档与代码各执一词时，谁在"现场"谁说了算。',
      update: '实锤：真实响应与代码 DTO 一致、与文档系统性不符 + git 考古确认 4 次变更未更新注解。',
      actionId: 'a-docvscode',
      why: '2⚡︎ "实现序列化结果"是接口契约的唯一现场证据：文档是纸面、代码是意图、响应是事实——三方对质让"文档 vs 实现"的争论一锤定音。',
      conclusion: '根因实锤：文档快照过期。',
    },
    {
      thought: '版本误用假设 1⚡︎ 排除——"他们看错文档"是最方便的甩锅，必须用证据关掉。',
      update: '文档站只有一个版本可看且就是过期的——甩锅叙事退场。',
      actionId: 'a-versioncheck',
      why: '1⚡︎ 甩锅类假设要最先排除：它阻止真正的修复（机制）发生——证据显示"想看对文档都没得看"。',
      conclusion: '责任归位 → 排除实现侧。',
    },
    {
      thought: '序列化配置与合作方脚本各 1⚡︎ 排除——两侧的"无辜证明"让修复聚焦文档生成机制。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（注解未随代码更新）✓ 两侧（实现忠实/对接正确）✓ 防线（CI 断言+mock）✓——三方、机制、防线三层闭合。',
      conclusion: '沉淀：文档不是事实，实现才是——契约由代码生成、由 CI 对账、由 mock 放大。让文档与实现漂移无处藏身的，是机制不是自觉。',
    },
  ],

  lessons: [
    {
      text: '文档不是事实，实现才是：契约争议的裁判是"实现的序列化结果"——纸面、意图、事实三方对质，一锤定音。',
      principle: '验证思维：接口类争论（文档 vs 代码 vs 实际）必须落回"真实响应"裁决。curl 一次的真实输出比十份讨论记录更有法律效力——这也是 diff 溯源（git 考古）定位漂移起点的锚点。',
    },
    {
      text: '文档必须由代码生成 + CI 一致性断言：人工维护的文档必然漂移——漂移不产生告警时，它以"联调事故"的形式提现。',
      principle: '流程设计：OpenAPI 注解强制化 + "生成的文档 == 实现快照"的 CI 断言，让每次代码变更自动同步契约。文档即 mock：按 schema 生成 mock 端点，漂移时 mock 与实现一起漂——两份"按文档写的代码"必然对撞，无处藏身。',
    },
    {
      text: '认真的人被过期的地图坑得最深：合作方脚本完全正确才暴露了文档全错——对外契约的严肃度要与对方的专业度匹配。',
      principle: '产品思维：对外接口是公司的脸面——对接窗口冻结契约、字段变更走评审、漂移有 CI 拦截，这三件事的成本远低于"重要合作方对接失败"的商业代价。文档站上"最后更新时间"应该像食品保质期一样醒目。',
    },
  ],
}
