import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 接口与契约 第四批（枚举语义漂移 L2）
 * 教学点：架构设计——枚举的语义漂移比类型漂移更毒：值合法、含义错，类型校验拦不住；
 * 枚举禁用裸数字（字符串常量/枚举类），文档从枚举类生成。
 * 专家路径：impact(1) + enumdiff(2) + fieldmap(1) = 4⚡︎
 */
export const enumDriftCase: DiagnosisCase = {
  id: 'enum-drift',
  title: 'status=2 两边理解不同：已支付还是已发货',
  intro: '合作物流公司按文档语义路由订单，1,204 单被错误发往"已发货"通道——文档说 2=已支付，代码里 2 是已发货。',
  domain: 'build',
  layer: '枚举的语义漂移比类型漂移更毒——值合法、含义错',
  part: 'engineer',
  chapterId: 'contract',
  order: 4,
  typeTags: ['contract', 'data', 'process'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」订单平台的接口负责人，物流合作方的紧急电话打到了你的工位。',
    architecture: '订单服务(status 枚举) → 开放接口 → 物流合作方(按 status 语义路由：2=已支付→拣货通道) ｜ 文档站(旧) → 合作方对接代码',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '错误路由统计',
        text: '1,204 单被推送至"已发货"物流通道——但这些订单实际处于"已支付待拣货"。\n合作方按文档 status=2（已支付）做前置校验，实际收到的 2 是"已发货"——通道错乱。',
      },
      {
        type: 'text',
        title: '时间线',
        text: '上月订单服务重构：枚举类从常量类改为 enum，字段顺序重排——status 的 2/3 语义悄然对调。\n文档站未更新（仍是 2=已支付）。类型上一切合法：2 就是 2。',
      },
    ],
    timeline: '枚举重构 PR 上月合入 ｜ 合作方对接上周完成（按旧文档）｜ 错误路由自对接上线累计至今',
    impactHint: '值合法、含义错——类型校验全绿灯，业务语义全红灯。1 和 2 的"含义"是谁定义的？',
  },

  hypotheses: [
    { id: 'h-semantic', text: '枚举语义漂移：重构时 2/3 语义对调（2=已发货），文档未跟上——类型合法但含义错', excludeActionId: 'a-enumdiff' },
    { id: 'h-fieldmap', text: '合作方映射用了废弃字段 orderType 的旧语义', excludeActionId: 'a-fieldmap' },
    { id: 'h-race', text: '订单状态竞态：2/3 状态同时到达，推送顺序错乱', excludeActionId: 'a-ordertrace' },
    { id: 'h-data', text: '历史订单脏数据：status 2/3 混写', excludeActionId: 'a-datacheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '给错误路由画时间线',
      desc: '影响面：错误单的时间分布与枚举重构 PR 的关系',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '错误路由时间线',
        text: '错误单起始：上月重构 PR 上线次日 ✓（精确到天）\n错误模式：全部是 status=2 的单被路由到已发货通道（按新语义 2=SHIPPED，\n合作方按旧文档 2=PAID 校验"已支付"通过后误派）\nstatus=3 的单反向错误（0 单——3 的通道校验恰好兜住）\n→ 起点与重构 PR 对齐：嫌疑人锁定"那次重构"。',
      },
    },
    {
      id: 'a-enumdiff',
      name: '枚举考古：代码 vs 文档逐值对照',
      desc: 'git diff 重构 PR——语义对调的铁证',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-semantic'],
      hypotheses: [{ id: 'h-semantic', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '枚举考古（git diff 重构 PR）',
        text: '代码现状：enum OrderStatus { PAID(3), SHIPPED(2), … }  ← 2=已发货\n文档（旧）：status 2=已支付, 3=已发货\n重构 diff：旧常量类 { PAID(2), SHIPPED(3) } → enum 重排时赋值对调！\n代码内部自洽（写入与读取都是新语义）——只有"对外的 2/3 含义"变了。\n实锤：语义漂移——类型合法（2 就是 2），含义对调。校验器与测试全部绿灯通过。',
      },
    },
    {
      id: 'a-fieldmap',
      name: '核对合作方的字段映射',
      desc: '排除废弃字段误用',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-fieldmap'],
      hypotheses: [{ id: 'h-fieldmap', status: 'excluded' }],
      result: {
        type: 'text',
        title: '字段映射核对',
        text: '合作方读取 status 字段（新字段，映射一致）——没用废弃的 orderType。\n→ 排除字段误用：他们读对了字段，字段里的语义变了。',
      },
    },
    {
      id: 'a-ordertrace',
      name: '抽查错误单的状态机轨迹',
      desc: '排除状态竞态',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-race'],
      hypotheses: [{ id: 'h-race', status: 'excluded' }],
      result: {
        type: 'text',
        title: '状态轨迹核对',
        text: '错误单轨迹：已支付(写入 3) → 推送(携带 3→但对方按 2 校验?)——\n不对，重新对账：服务端推送的是"3"，对方按文档 3=已发货校验通过误派？\n复核：错误单推送值是 2（写入时即 2）——写入侧用了新语义 2=SHIPPED，\n但业务上这些单是"已支付"——写入侧语义整体偏移，非竞态。\n→ 排除竞态：不是推送顺序问题，是语义对调的系统性错位。',
      },
    },
    {
      id: 'a-datacheck',
      name: '核对历史与新订单的数据一致性',
      desc: '排除脏数据',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-data'],
      hypotheses: [{ id: 'h-data', status: 'excluded' }],
      result: {
        type: 'text',
        title: '数据核对',
        text: '重构后新订单写入全部一致（新语义），无混写。\n→ 排除脏数据：数据是"自洽地错"——一致性掩盖了语义漂移，这正是它隐蔽的原因。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急改文档成新语义重新发布',
      desc: '【状态变更】文档站更新为新语义，通知合作方',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '改文档结果（陷阱动作）',
        text: '文档"对了"（与代码一致）。\n代价：① 错误路由的 1,204 单召回方案没着落 ② 合作方历史校验逻辑全按新语义重写，\n历史订单复核再错一轮 ③ "重构改语义"这个根因被文档追认合法化。\n→ 复盘点评：追认错误是最贵的和解——语义的错在代码，修复也在代码。',
      },
    },
    {
      id: 'a-fixrealign',
      name: '修复：枚举语义回正 + 错误单召回',
      desc: '【状态变更】代码枚举回正（2=PAID, 3=SHIPPED）+ 1,204 单召回重派',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 代码枚举对调回正（以文档语义为准——对外契约优先于内部重构惯性）\n② 1,204 单按真实状态召回重派（拣货通道重推）\n③ 回归：全状态样例单 × 合作方联调——每个状态值语义逐一对账通过。',
      },
    },
    {
      id: 'a-fixenum',
      name: '沉淀：枚举契约化规范',
      desc: '【状态变更】对外接口枚举禁用裸数字重排：字符串常量/枚举类名传输；文档从枚举类生成',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '枚举契约化',
        text: '① 对外接口枚举改为字符串字面量（"PAID"/"SHIPPED"）——数字序号不再出现在协议里\n② 文档由枚举类生成（值与含义同源）\n③ 重构规范：枚举重构禁止改变对外值——内部重组不触碰协议。',
      },
    },
    {
      id: 'a-fixsample',
      name: '沉淀：状态机样例单验证',
      desc: '【状态变更】对外对接必做"每个状态值走一单"的样例验证——语义漂移在对接当天现形',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '样例单验证',
        text: '对接 SOP 新增：每个枚举状态值各走一单真实业务，对方回读确认语义。\n语义漂移最隐蔽（类型全绿）——只有"语义级样例"能验出来。对接当天的 10 分钟，省 1,204 单的召回。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-semantic', text: '枚举重构时 status 2/3 语义对调（旧常量类 PAID(2)/SHIPPED(3) → enum PAID(3)/SHIPPED(2)），文档未同步——类型合法含义错，类型校验与测试全绿放行，合作方按旧语义误派 1,204 单', correct: true },
    { id: 'rc-fieldmap', text: '合作方误用废弃字段 orderType 的旧语义', correct: false },
    { id: 'rc-race', text: '订单状态竞态导致推送乱序', correct: false },
    { id: 'rc-data', text: '历史订单 status 2/3 混写脏数据', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '错误单起点精确对齐重构 PR——先锁时间线，再验"那次重构改了什么"。',
      update: '错误模式：status=2 全部被误派——一个值的全员错位，不是个别脏数据。',
      actionId: 'a-impact',
      why: '1⚡︎ 时间线 + 错误模式双重定位：起点=重构日、模式=单值全员错位——"重构动了枚举"的嫌疑直接锁定。',
      conclusion: '嫌疑锁定：枚举语义漂移（h-semantic 升权）。',
    },
    {
      thought: '枚举考古：git diff 重构 PR——代码现状、文档旧貌、重构 diff 三方对质。',
      update: '实锤：2/3 语义对调，代码内部自洽——类型校验全绿放行，语义红灯无人看见。',
      actionId: 'a-enumdiff',
      why: '2⚡︎ 教学核心：语义漂移与类型漂移的本质区别——"2 就是 2"类型校验永远绿灯，但 2 的含义变了。git diff 是考古的铁证：重构的"顺手重排"是对外契约的偷改。',
      conclusion: '根因实锤：重构偷改协议语义。',
    },
    {
      thought: '状态轨迹复核时发现"写入侧整体偏移"——排除竞态的同时修正自己的理解，排查要有自我纠错。',
      update: '排除竞态：不是推送乱序，是写入即偏移——系统性语义错位（脏数据假设同时出局）。',
      actionId: 'a-ordertrace',
      why: '1⚡︎ 排查中的自我纠错值得单独记录：最初"推送携带 3"的推断与数据不符——回到数据修正叙事，比将错就错专业。',
      conclusion: '嫌疑收敛 → 修复方向：代码回正而非文档追认。',
    },
    {
      thought: '字段映射 1⚡︎ 排除；止血陷阱（追认错误）点评；修复（枚举回正+召回）+ 双防线（枚举契约化+样例单）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（语义对调）✓ 修复方向（代码回正）✓ 防线（枚举契约化+样例单验证）✓——机制、方向、防线三层闭合。',
      conclusion: '沉淀：枚举的语义漂移比类型漂移更毒——值合法含义错；对外协议用字符串枚举，语义由文档与代码同源生成。',
    },
  ],

  lessons: [
    {
      text: '枚举的语义漂移比类型漂移更毒：值合法、含义错——类型校验全绿灯，业务语义全红灯。',
      principle: '架构设计：对外接口的枚举用字符串字面量（"PAID"），裸数字序号禁止进协议——数字可被"顺手重排"，字符串自带语义。文档从枚举类生成，值与含义同源；重构规范：内部重组不触碰对外值。',
    },
    {
      text: '代码内部自洽 ≠ 对外契约正确：写入与读取都是"新语义"，只有不知情的对接方按旧语义理解——一致性掩盖漂移。',
      principle: '验证思维："系统内部全绿"恰恰是语义漂移的隐蔽条件——漂移只在与外部世界接触时显形。对外对接必做"语义级样例单"：每个枚举值走一单真实业务，对方回读确认——类型测试验不了语义，语义要用语义验。',
    },
    {
      text: '追认错误是最贵的和解：把文档改成错误的新语义，1,204 单召回无着落、历史校验再错一轮——语义的错在代码，修复也在代码。',
      principle: '产品思维：契约冲突的修复方向要问"谁是历史事实的锚"——文档+合作方的既有理解是锚（除非文档本来错）。为省一次代码回正而追认错误，付出的是召回成本与信任成本的双倍利息。',
    },
  ],
}
