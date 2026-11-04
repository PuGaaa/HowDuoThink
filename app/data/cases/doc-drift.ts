import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const docDriftCase: DiagnosisCase = {
  id: 'doc-drift',
  title: '接口与文档的字段类型对不上',
  intro: '合作方按公开文档对接失败；先核对同版本请求、响应和契约，再定位差异如何产生。',
  domain: 'build',
  layer: '运行输出说明现状，已发布契约约束承诺；二者冲突不能自动判实现正确',
  part: 'engineer',
  chapterId: 'contract',
  order: 2,
  typeTags: [
    'contract',
    'process',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」开放平台的接口负责人，一个重要合作方的对接工程师已经三天没睡好了。',
    architecture: '合作方对接系统 → swagger 文档站(三个月前生成) → 库存接口(代码此后变更 4 次) → 库存服务',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '对接报错清单',
        text: '合作方GET库存响应按文档将stock解析为string，但接口返回number，严格解析失败。\n差异清单：5个类型变化、2个字段缺失、3个新增字段。',
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
    {
      id: 'h-drift',
      text: 'DTO变更后未更新并发布schema，流水线持续部署过期文档，且无一致性检查',
      excludeActionId: 'a-docvscode',
    },
    {
      id: 'h-version',
      text: '合作方用错版本文档（v1 文档对接 v2 接口）',
      excludeActionId: 'a-versioncheck',
    },
    {
      id: 'h-serial',
      text: '全局序列化配置与注解冲突，实现的行为偏离代码本意',
      excludeActionId: 'a-serialconf',
    },
    {
      id: 'h-script',
      text: '合作方对接脚本自身 bug，误报类型错误',
      excludeActionId: 'a-scriptcheck',
    },
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
      tests: [
        'h-drift',
        'h-serial',
      ],
      hypotheses: [
        {
          id: 'h-drift',
          status: 'confirmed',
        },
        {
          id: 'h-serial',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '实现序列化结果（真实现场）',
        text: '同一路径和版本的教学响应：{"stock":123,"updateTime":1727901234567,"price":880,"warehouseId":3,"revision":7,"stockVersion":7,"frozenFlag":0,"warehouseTier":"A"}\n文档前5项分别约定string/string/元number/string/string，实现在DTO中变为数量number/毫秒number/分number/number/number；warehouseCode、regionTag缺失，最后3项新增。\nDTO与序列化输出一致；ObjectMapper无定制覆盖。变更记录显示4次发布只改DTO，发布流水线仍部署旧schema产物。运行响应证明“现在怎样”，不能自动证明它符合已发布承诺。',
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
      tests: [
        'h-version',
      ],
      hypotheses: [
        {
          id: 'h-version',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '版本核对',
        text: '合作方引用该路径当前公开文档；请求URL、版本头、部署接口均为v1。文档artifact仍为三个月前版本，不是合作方自行选错v2/v1。',
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
      tests: [
        'h-serial',
      ],
      hypotheses: [
        {
          id: 'h-serial',
          status: 'excluded',
        },
      ],
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
      tests: [
        'h-script',
      ],
      hypotheses: [
        {
          id: 'h-script',
          status: 'excluded',
        },
      ],
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
      cost: 9,
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
        text: '在同一构建内生成schema并发布；CI对真实路由序列化结果做schema校验，对已发布契约做兼容diff。仅从注解生成不能保证注解更新，也不会天然产生编译告警。\n对已经承诺的字段先保留兼容适配或版本化迁移，不能把改文档当作破坏性实现的追认。',
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
        text: 'schema生成的mock只代表声明内容；如果mock与文档同源，两者可能一起错。必须再与真实实现执行契约测试，才能发现漂移；mock不能让真实联调只剩环境验证。',
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
    {
      id: 'rc-drift',
      text: 'DTO变更与文档构建发布脱节，当前公开schema仍是旧产物；缺少运行输出校验和兼容diff，调用方按公开承诺解析失败',
      correct: true,
    },
    {
      id: 'rc-version',
      text: '合作方拿 v1 旧版文档对接 v2 接口',
      correct: false,
    },
    {
      id: 'rc-serial',
      text: '全局序列化配置与注解冲突，实现偏离代码',
      correct: false,
    },
    {
      id: 'rc-script',
      text: '合作方对接脚本自身 bug 误报',
      correct: false,
    },
  ],
  expertCost: 5,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '建立完整差异清单。',
      update: '5个类型变化、2缺失、3新增。',
      actionId: 'a-impact',
      why: '1⚡量化差异，不把一个类型报错泛化成所有请求坏了。',
      conclusion: '比对同版本真实输出。',
    },
    {
      thought: '核对DTO、序列化输出及发布产物。',
      update: '实现与DTO一致，schema产物停留在旧版本。',
      actionId: 'a-docvscode',
      why: '2⚡数据和构建来源能定位漂移环节，但不自动追认实现符合契约。',
      conclusion: '确认发布脱节并排除序列化冲突。',
    },
    {
      thought: '对齐URL、版本头和文档链接。',
      update: '合作方确在使用当前公开v1文档。',
      actionId: 'a-versioncheck',
      why: '1⚡文档产物旧不等于合作方自行选错接口版本。',
      conclusion: '排除版本误用。',
    },
    {
      thought: '检查消费者解析器。',
      update: '严格按文档解析，独立客户端也重现。',
      actionId: 'a-scriptcheck',
      why: '1⚡消费者行为核验是独立反证，不能省略后声称全部无辜。',
      conclusion: '排除脚本错误。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】同版本输出与发布schema脱节已确认，版本、序列化和消费者脚本候选排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: 'DTO变更与文档构建发布脱节，当前公开schema仍是旧产物；缺少运行输出校验和兼容diff，调用方按公开承诺解析失败',
    },
  ],
  lessons: [
    {
      text: '运行输出是现状证据，已发布文档是对外承诺；二者冲突时先定位差异，再决定兼容修复和迁移。',
      principle: '不能用“实现才是事实”宣判消费者错误。保留旧消费者回归、真实输出schema校验和发布契约diff，区分文档过期与实现破坏承诺。',
    },
    {
      text: '代码生成文档不能替代一致性验证，注解也会过期，构建正确的schema还必须随版本部署。',
      principle: '把DTO、生成schema和文档artifact标识关联；CI验证实际路由和序列化输出，而非只比两份来自同一旧注解的产物。',
    },
    {
      text: '文档和mock同源会共同继承错误，只有接入真实实现的契约测试才能验证二者与服务是否一致。',
      principle: '以同版本、同字段和同语义建立比较条件，记录变更意图；新增字段也要确认旧端的未知字段策略。',
    },
  ],
}
