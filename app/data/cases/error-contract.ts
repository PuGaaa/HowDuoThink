import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const errorContractCase: DiagnosisCase = {
  id: 'error-contract',
  title: '后端换了措辞，充值引导消失',
  intro: '余额不足错误换了展示文案，充值引导不再出现。对比真实字符串和前端分支，别先假设匹配失败。',
  domain: 'build',
  layer: '错误响应也是契约——message 给人看，code 给程序读',
  part: 'engineer',
  chapterId: 'contract',
  order: 5,
  typeTags: [
    'contract',
    'config',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」支付链路的负责人，一个文案微调让前端的充值引导全部失灵。',
    architecture: '支付服务(错误响应: { message }) → 前端(按 message.includes("余额不足") 分支) → 充值引导页',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '故障表现',
        text: '后端将“余额不足，请充值”改为“可用资金不足，请先充值”；前端仍执行message.includes("余额不足")，充值引导不再出现。',
      },
      {
        type: 'text',
        title: '牵出的旧账',
        text: '前端代码搜索：message.includes(...) 做逻辑分支的写法共 14 处（余额不足/超时/风控…）。\n错误响应结构：{ "message": "…" }——从设计之初就没有 code 字段。',
      },
    ],
    timeline: '文案微调昨天上线（合规整改）｜ 前端分支失效今天客服报上来 ｜ 错误码表：设计稿里有，从未实现',
    impactHint: '这次影响余额不足分支；全仓14处文案判断是潜在风险，不能都算本次已坏。',
  },
  hypotheses: [
    {
      id: 'h-nocontract',
      text: '错误响应无 code 契约：前端被迫按 message 文本匹配做逻辑分支——文案即契约的幻觉',
      excludeActionId: 'a-erroranatomy',
    },
    {
      id: 'h-encoding',
      text: '前后端字符编码不一致，导致解码后的关键字损坏',
      excludeActionId: 'a-encoding',
    },
    {
      id: 'h-mapping',
      text: '前端缓存了旧的错误映射表',
      excludeActionId: 'a-mappingcache',
    },
    {
      id: 'h-gw',
      text: '网关改写了错误响应体',
      excludeActionId: 'a-gwbody',
    },
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
        text: '本次受影响是3处余额不足引导，旧文案“余额不足，请充值”匹配true，新文案“可用资金不足，请先充值”匹配false。\n另外11处文案判断本次未失效，只是同类风险。若改成“账户余额不足”，includes("余额不足")仍为true，不能用它声称故障。',
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
      tests: [
        'h-nocontract',
        'h-mapping',
      ],
      hypotheses: [
        {
          id: 'h-nocontract',
          status: 'confirmed',
        },
        {
          id: 'h-mapping',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '错误响应解剖',
        text: '错误响应只有message，无机器可读code。调用链每次直接执行message.includes("余额不足")，无缓存映射；同构只替换文案即可重现true→false。\n设计稿code从未落地。稳定code适合程序判断，message用于展示；code语义也需要契约维护，不能保证永恒不变。',
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
      tests: [
        'h-encoding',
        'h-gw',
      ],
      hypotheses: [
        {
          id: 'h-encoding',
          status: 'excluded',
        },
        {
          id: 'h-gw',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '编码核对',
        text: '同一请求的服务端响应字节、网关出口和浏览器解码字符串相同，均为UTF-8的“可用资金不足，请先充值”。网关未改body；JS直接执行includes得到false。排除编码损坏与网关改写。',
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
      tests: [
        'h-mapping',
      ],
      hypotheses: [
        {
          id: 'h-mapping',
          status: 'excluded',
        },
      ],
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
      tests: [
        'h-gw',
      ],
      hypotheses: [
        {
          id: 'h-gw',
          status: 'excluded',
        },
      ],
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
      cost: 9,
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
    {
      id: 'rc-nocontract',
      text: '错误响应缺少稳定机器code，充值引导按message.includes("余额不足")分支；文案改为“可用资金不足”后匹配false，3处引导失效',
      correct: true,
    },
    {
      id: 'rc-encoding',
      text: '前后端文案编码不一致',
      correct: false,
    },
    {
      id: 'rc-mapping',
      text: '前端缓存旧错误映射表',
      correct: false,
    },
    {
      id: 'rc-gw',
      text: '网关改写错误响应体',
      correct: false,
    },
  ],
  expertCost: 4,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '先实际运行前后字符串判断。',
      update: '旧文案true，新文案false，3处受影响。',
      actionId: 'a-impact',
      why: '1⚡执行真实includes，不能凭措辞变化虚构失败。',
      conclusion: '检查分支依赖。',
    },
    {
      thought: '跟踪错误结构和使用点。',
      update: '无code、无缓存，文案是唯一判断依据。',
      actionId: 'a-erroranatomy',
      why: '2⚡结构与单变量文案复验共同证明耦合，排除缓存。',
      conclusion: '确认契约缺失。',
    },
    {
      thought: '对照同请求端到端字节。',
      update: 'UTF-8一致，网关未改写。',
      actionId: 'a-encoding',
      why: '1⚡同一次抓包链给出编码与网关各自反证。',
      conclusion: '其余候选排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】真实字符串判断复现成立，无code耦合已确认，编码、缓存、网关均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '错误响应缺少稳定机器code，充值引导按message.includes("余额不足")分支；文案改为“可用资金不足”后匹配false，3处引导失效',
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
