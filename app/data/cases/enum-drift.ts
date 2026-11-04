import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const enumDriftCase: DiagnosisCase = {
  id: 'enum-drift',
  title: 'status仍是合法整数，订单却进错通道',
  intro: '合作方收到的状态值类型合法，业务路由却在服务端重构后反转。对照同一订单的业务状态与协议含义。',
  domain: 'build',
  layer: '枚举的语义漂移比类型漂移更毒——值合法、含义错',
  part: 'engineer',
  chapterId: 'contract',
  order: 4,
  typeTags: [
    'contract',
    'data',
    'process',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」订单平台的接口负责人，物流合作方的紧急电话打到了你的工位。',
    architecture: '订单服务(status 枚举) → 开放接口 → 物流合作方(按 status 语义路由：2=已支付→拣货通道) ｜ 文档站(旧) → 合作方对接代码',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '错误路由统计',
        text: '重构后1204笔已支付待拣货的新订单，在服务端业务状态PAID下被编码为status=3。合作方遵循已发布契约3=SHIPPED，将它们路由到已发货通道；实际尚未发货。',
      },
      {
        type: 'text',
        title: '时间线',
        text: '旧公开契约2=PAID、3=SHIPPED。上月重构时对外映射改为PAID(3)、SHIPPED(2)；合作方未变更。类型校验仍全部通过。',
      },
    ],
    timeline: '重构上线当日合作方已在运行；之后1204笔PAID事件被错派，所有样本均为重构后新订单。',
    impactHint: '值合法、含义错——类型校验全绿灯，业务语义全红灯。1 和 2 的"含义"是谁定义的？',
  },
  hypotheses: [
    {
      id: 'h-semantic',
      text: '枚举语义漂移：重构时 2/3 语义对调（2=已发货），文档未跟上——类型合法但含义错',
      excludeActionId: 'a-enumdiff',
    },
    {
      id: 'h-fieldmap',
      text: '合作方映射用了废弃字段 orderType 的旧语义',
      excludeActionId: 'a-fieldmap',
    },
    {
      id: 'h-race',
      text: '订单状态竞态：2/3 状态同时到达，推送顺序错乱',
      excludeActionId: 'a-ordertrace',
    },
    {
      id: 'h-data',
      text: '历史订单脏数据：status 2/3 混写',
      excludeActionId: 'a-datacheck',
    },
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
        text: '错误从重构上线开始；1204笔业务状态PAID的订单都发出status=3，消费者按既有契约3=SHIPPED走已发货通道。其他状态未改值，无同类错误。\n先区分业务状态、传输整数和消费方含义，不能在不同证据里交换2/3。',
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
      tests: [
        'h-semantic',
      ],
      hypotheses: [
        {
          id: 'h-semantic',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '枚举考古（git diff 重构 PR）',
        text: '旧契约/旧映射：PAID→2，SHIPPED→3；重构后序列化映射：PAID→3，SHIPPED→2。业务库存记录仍使用稳定字符串PAID/SHIPPED，本次只改了对外数字编码。\n同一新订单业务状态PAID，JSON输出3，合作方按旧契约解释SHIPPED。仅恢复对外映射后，相同PAID样例输出2并进入拣货通道。',
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
      tests: [
        'h-fieldmap',
      ],
      hypotheses: [
        {
          id: 'h-fieldmap',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '字段映射核对',
        text: '合作方读取JSON的status字段，没有读取orderType；该字段从既有公开契约沿用，不是本次新字段。',
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
      tests: [
        'h-race',
        'h-data',
      ],
      hypotheses: [
        {
          id: 'h-race',
          status: 'excluded',
        },
        {
          id: 'h-data',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '状态轨迹核对',
        text: '单订单trace：支付成功写业务状态PAID→生成唯一事件E1→发送status=3；无第二状态事件、无重发或乱序。1204个错误样本均为重构后新订单，存储业务状态均PAID，无历史数字2/3混写。',
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
      tests: [
        'h-data',
      ],
      hypotheses: [
        {
          id: 'h-data',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '数据核对',
        text: '本案持久化业务状态为稳定字符串，所有错误样本均为重构后新建PAID订单。错误发生在对外数值编码，历史数字混写不能解释。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急改文档成新语义重新发布',
      desc: '【状态变更】文档站更新为新语义，通知合作方',
      cost: 9,
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
        text: '保留当前对外数字值及其语义，建立显式且不可随顺序改变的映射并生成契约样例。新接口可评估字符串枚举，但把既有number直接改string也是破坏性变更，必须版本化迁移，不能作为无成本修复。',
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
    {
      id: 'rc-semantic',
      text: '重构仅改变对外数字编码为PAID→3、SHIPPED→2，破坏既有2=PAID/3=SHIPPED契约；已支付样例被消费者按SHIPPED错误路由',
      correct: true,
    },
    {
      id: 'rc-fieldmap',
      text: '合作方误用废弃字段 orderType 的旧语义',
      correct: false,
    },
    {
      id: 'rc-race',
      text: '订单状态竞态导致推送乱序',
      correct: false,
    },
    {
      id: 'rc-data',
      text: '历史订单 status 2/3 混写脏数据',
      correct: false,
    },
  ],
  expertCost: 5,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '对齐一笔订单的三个状态层。',
      update: '业务PAID→传输3→消费者SHIPPED。',
      actionId: 'a-impact',
      why: '1⚡分开业务状态、传输值和消费含义，防止自相矛盾。',
      conclusion: '核对映射变更。',
    },
    {
      thought: '比较旧契约和新编码并复验。',
      update: '只恢复编码就回到正确通道。',
      actionId: 'a-enumdiff',
      why: '2⚡单变量对照证明语义漂移，而非类型错误。',
      conclusion: '确认映射破坏。',
    },
    {
      thought: '检查事件序列与存储状态。',
      update: '唯一事件，无乱序；全为新订单，存储PAID。',
      actionId: 'a-ordertrace',
      why: '1⚡同一trace与样本集合同时反证竞态和历史混写。',
      conclusion: '排除竞态与脏数据。',
    },
    {
      thought: '读取消费字段映射。',
      update: '沿用status，未用orderType。',
      actionId: 'a-fieldmap',
      why: '1⚡读对字段仍会理解错协议，因此需要独立核对。',
      conclusion: '其余候选排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】同一订单的编码对照成立，乱序、历史混写及字段误用均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '重构仅改变对外数字编码为PAID→3、SHIPPED→2，破坏既有2=PAID/3=SHIPPED契约；已支付样例被消费者按SHIPPED错误路由',
    },
  ],
  lessons: [
    {
      text: '枚举的类型和值都合法，含义仍可能变化。对外值与业务含义的映射是契约，不应随内部重构改变。',
      principle: '数字或字符串均可作为稳定协议，关键是显式固定值与语义。已有数字改字符串会破坏消费者，不能把字符串当成免迁移的万能方案。',
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
