import { DiagnosisCase } from '../../types/case'

/**
 * 第 5 章 · 接口与契约 第五批（错误响应契约缺失 L2）
 * 教学点：架构设计——错误响应也是契约：message 是给人看的文案，code 才是给程序读的协议；
 * 文案与逻辑解耦（i18n），错误码表与 schema 同源生成。
 * 专家路径：impact(1) + erroranatomy(2) + encoding(1) = 4⚡︎
 */
export const errorContractCase: DiagnosisCase = {
  id: 'error-contract',
  title: '后端改了个标点，前端的充值流程崩了',
  intro: '前端按错误文案"余额不足"做分支，后端文案改成"账户余额不足"——message 从来不是契约，code 一直是空的。',
  domain: 'build',
  layer: '错误响应也是契约——message 给人看，code 给程序读',
  part: 'engineer',
  chapterId: 'contract',
  order: 5,
  typeTags: ['contract', 'config'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」支付链路的负责人，一个文案微调让前端的充值引导全部失灵。',
    architecture: '支付服务(错误响应: { message }) → 前端(按 message.includes("余额不足") 分支) → 充值引导页',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '故障表现',
        text: '余额不足的用户：不再看到"去充值"引导，而是收到"支付失败请重试"——重试永远失败。\n文案微调：后端把"余额不足，请充值"改为"账户余额不足，请先充值"（合规要求）。',
      },
      {
        type: 'text',
        title: '牵出的旧账',
        text: '前端代码搜索：message.includes(...) 做逻辑分支的写法共 14 处（余额不足/超时/风控…）。\n错误响应结构：{ "message": "…" }——从设计之初就没有 code 字段。',
      },
    ],
    timeline: '文案微调昨天上线（合规整改）｜ 前端分支失效今天客服报上来 ｜ 错误码表：设计稿里有，从未实现',
    impactHint: '一个标点的改动崩了 14 处逻辑——文案从来不是契约。错误响应的"另一半契约"长什么样？',
  },

  hypotheses: [
    { id: 'h-nocontract', text: '错误响应无 code 契约：前端被迫按 message 文本匹配做逻辑分支——文案即契约的幻觉', excludeActionId: 'a-erroranatomy' },
    { id: 'h-encoding', text: '前后端文案编码不一致，includes 匹配失败（与本例无关的编码问题）', excludeActionId: 'a-encoding' },
    { id: 'h-mapping', text: '前端缓存了旧的错误映射表', excludeActionId: 'a-mappingcache' },
    { id: 'h-gw', text: '网关改写了错误响应体', excludeActionId: 'a-gwbody' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '量化"文案即契约"的欠账',
      desc: '影响面：有多少处逻辑挂在 message 文本上',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '欠账清单',
        text: '前端搜索：message.includes / message == 做逻辑分支 = 14 处\n覆盖场景：余额不足×3 / 超时×4 / 风控拦截×2 / 限购×2 / 其他×3\n本次故障：后端文案微调（合规要求）→ includes("余额不足") 匹配失败 → 分支走默认重试\n→ 一处文案微调崩 14 处逻辑——这不是 bug，是"契约缺失"的整体状态。',
      },
    },
    {
      id: 'a-erroranatomy',
      name: '解剖错误响应的完整结构',
      desc: '错误响应里有哪些字段、缺了哪个',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-nocontract'],
      hypotheses: [{ id: 'h-nocontract', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '错误响应解剖',
        text: '现状：{ "message": "账户余额不足，请先充值" } —— 只有人读的文案\n设计稿（从未实现）：{ "code": "PAYMENT_INSUFFICIENT_BALANCE", "message": "…" }\nmessage 的本质：给人看的展示层——它会因合规/多语言/措辞优化而变；\ncode 的本质：给程序读的协议——一旦定义恒定不变。\n实锤：前端被迫用"展示层"做"协议判断"——错误响应的另一半契约从未出生。',
      },
    },
    {
      id: 'a-encoding',
      name: '核对前后端字符编码',
      desc: '排除编码问题',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-encoding'],
      hypotheses: [{ id: 'h-encoding', status: 'excluded' }],
      result: {
        type: 'text',
        title: '编码核对',
        text: '两侧均 UTF-8；includes 的问题是"文案变了"不是"比对坏了"。\n→ 排除编码。',
      },
    },
    {
      id: 'a-mappingcache',
      name: '核对前端错误映射缓存',
      desc: '排除缓存',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-mapping'],
      hypotheses: [{ id: 'h-mapping', status: 'excluded' }],
      result: {
        type: 'text',
        title: '缓存核对',
        text: '前端无错误映射缓存（就是实时 includes）。\n→ 排除缓存。',
      },
    },
    {
      id: 'a-gwbody',
      name: '核对网关对错误体的处理',
      desc: '排除网关改写',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-gw'],
      hypotheses: [{ id: 'h-gw', status: 'excluded' }],
      result: {
        type: 'text',
        title: '网关核对',
        text: '网关透传错误体原样（抓包比对一致）。\n→ 排除网关。',
      },
    },
    {
      id: 'a-fixcodes',
      name: '修复：错误码表落地',
      desc: '【状态变更】错误码枚举（INSUFFICIENT_BALANCE 等 22 个）+ 响应加 code + 前端按 code 分支',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 错误码枚举落地（22 个业务错误码，枚举类 + 文档同源生成）\n② 错误响应补 code 字段（message 保留供展示）\n③ 前端 14 处分支全部改为按 code 判断；文案仅用于展示\n回归：文案再怎么改（多语言/合规措辞），前端分支稳定——文案与逻辑解耦。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急回滚后端文案到旧版',
      desc: '【状态变更】文案回滚"余额不足，请充值"，前端分支恢复',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果',
        text: '前端分支恢复，充值引导正常——合规整改被迫撤回。\n代价：合规要求悬置；且回滚只对"这一处文案"有效——其余 13 处 message 分支的雷原样躺着。\n→ 复盘点评：回滚救得了这一次，救不了文案必然的下一次变化。',
      },
    },
    {
      id: 'a-fixlint',
      name: '沉淀：双端 lint 防回潮',
      desc: '【状态变更】前端禁止 message 匹配做逻辑分支；后端错误响应必须携带 code',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'lint 双闸',
        text: '① 前端 lint：message.includes / message === 做分支 → 拦截\n② 后端 lint：错误响应缺 code 字段 → 拦截\n双闸让"文案即契约"从两端都无法再发生。',
      },
    },
    {
      id: 'a-fixi18n',
      name: '沉淀：文案与逻辑解耦',
      desc: '【状态变更】错误文案进 i18n 资源（可改/可多语言），code 恒定——为多语言铺路',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'i18n 铺路',
        text: '错误文案迁移 i18n 资源文件：合规改文案、多语言翻译都不再触碰任何逻辑。\n——本次的"合规文案微调"正是 i18n 场景的预演：文案天然会变，逻辑必须恒定。',
      },
    },
    {
      id: 'a-fixdoc',
      name: '沉淀：错误码表进契约文档',
      desc: '【状态变更】错误码表与接口 schema 同源生成——错误契约也是契约（错误场景可 mock 可验证）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '契约补全',
        text: '错误码表进 OpenAPI（每个接口的可抛错误码列出）：\n联调可 mock 错误场景、前端可按 code 写分支、文档与实现同源——\n错误响应从"二等公民"升格为完整契约。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-nocontract', text: '错误响应无 code 契约：前端按 message.includes("余额不足") 做逻辑分支 ×14 处——后端合规文案微调即全线失效；message 是展示层会变，code 是协议层恒定', correct: true },
    { id: 'rc-encoding', text: '前后端文案编码不一致', correct: false },
    { id: 'rc-mapping', text: '前端缓存旧错误映射表', correct: false },
    { id: 'rc-gw', text: '网关改写错误响应体', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-fixcodes',

  expertChain: [
    {
      thought: '一处文案微调崩 14 处逻辑——先量化欠账：还有多少逻辑挂在文案上。',
      update: '14 处 message.includes 分支、错误响应无 code 字段——"文案即契约"是整体欠账。',
      actionId: 'a-impact',
      why: '1⚡︎ 欠账清单决定修复层级：单处误匹配修一处即可；14 处意味着"错误响应契约缺失"的体系问题——修一张码表，不是修 14 个字符串。',
      conclusion: '定性完成：契约缺失（h-nocontract 升权）。',
    },
    {
      thought: '解剖错误响应的完整结构——它有哪些字段、缺了哪个，设计稿里"本该有"的是什么。',
      update: '实锤：message 是给人看的展示层（会变），code 是给程序读的协议（恒定）——后者从未出生。',
      actionId: 'a-erroranatomy',
      why: '2⚡︎ 教学核心：错误响应也是契约，且有两半——文案给人看（可变），code 给程序读（恒定）。前端被迫用展示层做协议判断，等于把逻辑建在流沙上。',
      conclusion: '根因实锤：另一半契约缺失。',
    },
    {
      thought: '编码/缓存/网关三个常规嫌疑各 1⚡︎ 排除——"字符串匹配失败"的三种技术性解释全部清场。',
      update: '编码一致、无缓存、网关透传——嫌疑收敛到契约结构本身。',
      actionId: 'a-encoding',
      why: '1⚡︎ 技术性解释先排除：编码/缓存/改写都是"匹配失败"的合理嫌疑——留证清场后，结构性缺陷的结论才无可辩驳。',
      conclusion: '嫌疑收敛 → 码表落地。',
    },
    {
      thought: '修复（码表+code 字段）、双闸（双端 lint）、解耦（i18n）、契约补全（错误码进文档）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（无 code 契约）✓ 欠账（14 处）✓ 防线（双闸+同源文档）✓——个案、体系、防线三层闭合。',
      conclusion: '沉淀：错误响应也是契约——message 给人看，code 给程序读；文案与逻辑解耦，才是"改文案不炸逻辑"的底气。',
    },
  ],

  lessons: [
    {
      text: '错误响应也是契约，且有两半：message 给人看（会因合规/多语言/措辞而变），code 给程序读（恒定不变）。',
      principle: '架构设计：错误响应必须携带稳定 code（枚举 + 文档同源生成）。程序逻辑只依赖 code，message 仅用于展示——把"人读的层"与"机读的层"分开，文案的自由度才能还给文案。',
    },
    {
      text: 'message.includes 做逻辑分支 = 把逻辑建在流沙上：文案的每一次微调（合规/多语言/措辞优化）都是一次潜在故障。',
      principle: '程序设计：前端双闸（禁止 message 匹配做分支）与后端双闸（错误必带 code）让"文案即契约"无法从任何一端回潮。逻辑挂文案的每一处，都是文案下一次变更的爆破点——14 处就是 14 个爆破点。',
    },
    {
      text: '合规改文案是 i18n 场景的预演：文案天然会变（合规/多语言/A-B 测试），code 恒定——解耦做得越早，变更成本越低。',
      principle: '产品思维：错误提示的"话术"永远会被要求调整——法务要改措辞、运营要改语气、出海要多语言。把文案放进 i18n 资源、把判断钉在 code 上，是给"必然到来的变更"预留的轨道。',
    },
  ],
}
