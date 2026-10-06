import { DiagnosisCase } from '../../types/case'

/**
 * 第 9 章 · 消息与异步 结业评审（评审现场 L3）
 * 教学点：架构设计——事件总线的四张必答卷：保序（分区键）、隔离（消费组）、契约（schema 版本）、兜底（死信+对账）；
 * 评审现场：在故障发生之前把种子找出来。收益由作者证明，风险由评审证明。
 * 专家路径：orderproof(2) + dropprobe(2) + slowprobe(1) + schemaprobe(1) + benefit(1) + histreview(1) = 8⚡︎
 */
export const mqBusReviewCase: DiagnosisCase = {
  id: 'mq-bus-review',
  title: '订单事件总线方案评审',
  intro: '「订单事件上总线」方案明天终审：16 个下游要订阅订单事件。方案很漂亮——你的工作是在它出事之前找出种子。',
  domain: 'runtime',
  layer: '事件总线把一次调用变成一份承诺——发出去的每个事件都要到、要对、要有序',
  part: 'master',
  chapterId: 'messaging',
  order: 6,
  typeTags: ['messaging', 'architecture'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」的资深架构师，评审会上被指派"挑刺"——找出这个方案未来会出事的地方。',
    architecture: '订单服务 → 事件总线(MQ, 单 topic: order-events) → 16 个下游订阅(库存/积分/风控/数据分析/外部合作方…)',
    tag: '评审现场',
    symptoms: [
      {
        type: 'error',
        title: '方案文档 · 关键句',
        text: '① 单 topic 承载全部订单事件，"全局公平"不设分区键\n② 事件体：订单全量字段（60+），JSON 直传\n③ 消费失败重试 3 次（约 30s 窗口），仍失败则丢弃\n④ 订单服务只管发布——"发布成功即责任完成"',
      },
      {
        type: 'text',
        title: '现网事实',
        text: '16 个下游处理能力差异巨大：库存服务 800 条/s，数据分析平台 50 条/s；其中 3 个是外部合作方系统（网络抖动分钟级常见）。\n订单字段变更频率：每月 2~3 次。\n历史：去年大促，点对点调用架构出现过"库存慢拖垮订单"的雪崩。',
      },
    ],
    timeline: '方案评审明天举行 ｜ 双 11 在 30 天后 ｜ 改造动机：16 对点对点调用的维护成本已不可持续',
    impactHint: '这不是故障排查——是在故障发生之前把种子找出来。最值钱的问句仍是："什么情况下这个设计会出事？"',
  },

  hypotheses: [
    { id: 'h-ordering', text: '无分区键导致同一订单的事件乱序：取消先于支付被下游处理，状态机错乱', excludeActionId: 'a-orderproof' },
    { id: 'h-slowconsumer', text: '16 个下游共享单 topic 无隔离：50 条/s 的慢消费者积压拖垮所有下游', excludeActionId: 'a-slowprobe' },
    { id: 'h-schema', text: '全量字段直传且无版本管理：每月改字段 = 16 个下游联锁升级', excludeActionId: 'a-schemaprobe' },
    { id: 'h-drop', text: '重试 3 次后丢弃：外部合作方分钟级抖动必然超窗，事件丢失后下游状态永久漂移', excludeActionId: 'a-dropprobe' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '问清下游对事件顺序的真实要求',
      desc: '评审第一问：哪些下游错不起、错的样子是什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '业务约束盘点',
        text: '库存/积分/风控：按订单生命周期流转——"取消事件不能在支付事件之前被处理"是正确性要求，不是优化项。\n现网点对点时代：调用时序隐式保序；曾发生"取消先到，库存回滚了还没扣的库存"事故 2 次。\n→ 乱序不是理论风险，是发生过的事。总线化会把它放大还是解决？',
      },
    },
    {
      id: 'a-orderproof',
      name: '追问分区键设计',
      desc: '同一订单的事件，会不会被投到不同分区',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-ordering'],
      hypotheses: [{ id: 'h-ordering', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '"单 topic 无分区键"——方案作者确认。\n追问：同一订单的"创建/支付/取消"三个事件落在不同分区、被不同消费者并行处理？\n——"理论上会，但下游应该能自己处理吧。"\n→ 下游没有时钟、没有全局序，"自己处理"无从谈起。保序责任必须由总线承担：分区键 = orderId，这是阻断级缺陷。',
      },
    },
    {
      id: 'a-slowprobe',
      name: '追问订阅隔离与消费组设计',
      desc: '一个下游慢，别的下游要不要陪葬',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-slowconsumer'],
      hypotheses: [{ id: 'h-slowconsumer', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '16 个下游共享同一 topic、无独立消费组/队列。\n推演：数据分析（50 条/s）对 8000 QPS 的事件流必然积压 → 共享队列水位上涨 →\n库存等服务被迫与它一起排队（或被背压拖慢）。\n→ 慢消费者隔离缺失：去年"库存慢拖垮订单"的雪崩，换了个形态可以复发。',
      },
    },
    {
      id: 'a-schemaprobe',
      name: '追问事件 schema 的版本管理',
      desc: '订单加一个字段，16 个下游怎么办',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-schema'],
      hypotheses: [{ id: 'h-schema', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '"全量字段 JSON 直传，没做版本号；字段每月改 2~3 次。"\n推演：订单服务新增/改名字段 → 16 个下游的反序列化/校验逐一适配——\n每月 2~3 次的 16 方联锁发布，任何一个下游跟不上就消费报错积压。\n→ 契约管理缺失：事件是发布给别人的承诺，不是自己的内存对象。',
      },
    },
    {
      id: 'a-dropprobe',
      name: '追问重试耗尽后的去向',
      desc: '外部合作方抖动 5 分钟，这 5 分钟的事件去哪了',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-drop'],
      hypotheses: [{ id: 'h-drop', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '"重试 3 次（30s 窗口）后丢弃。"\n追问：合作方网络抖动分钟级常见，30s 窗口必然不够——丢掉的事件找得回来吗？\n——"……没设计补偿。"\n推演：丢事件 = 下游状态永久漂移（积分没加、风控没记），且"发布成功即责任完成"让丢失无人知晓。\n→ 兜底缺失：死信 + 对账补偿是事件总线的生存底线，不是可选项。',
      },
    },
    {
      id: 'a-benefit',
      name: '评估方案本身的收益',
      desc: '方向对不对——别把 baby 和洗澡水一起倒掉',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '收益评估',
        text: '解耦收益真实：16 对点对点调用的维护成本、发布联锁、故障传染是现实痛点；\n事件驱动方向正确，去年大促雪崩也证明了现状需要改。\n→ 评审结论不应是否决——是保留方向、补齐四张答卷。',
      },
    },
    {
      id: 'a-histreview',
      name: '对照去年大促事故复盘',
      desc: '上次的病根，新方案治了吗',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '历史对照',
        text: '去年事故：点对点同步调用，库存慢 → 订单线程池堆积 → 雪崩。\n复盘改进项里有"故障隔离"——新方案若无订阅隔离，\n慢消费者传染只是从"线程池"换成了"共享队列"。\n→ 上次的复盘结论是免费的评审意见：隔离必须写进终版方案。',
      },
    },
    {
      id: 'a-minfix',
      name: '开出最小修正清单',
      desc: '让方案达到可上线状态的必改项',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-ordering', 'h-slowconsumer', 'h-schema', 'h-drop'],
      hypotheses: [
        { id: 'h-ordering', status: 'confirmed' },
        { id: 'h-slowconsumer', status: 'confirmed' },
        { id: 'h-schema', status: 'confirmed' },
        { id: 'h-drop', status: 'confirmed' },
      ],
      result: {
        type: 'text',
        title: '评审结论 · 修正清单',
        text: '① 分区键 = orderId（保序，阻断级）\n② 下游各自消费组 + 独立队列（隔离，慢者自慢）\n③ 事件 schema 加版本号 + 只传核心增量字段 + 兼容承诺（只加不改，两版过渡）\n④ 死信队列 + 每日对账补偿替代"3 次后丢弃"\n⑤ 慢消费者配额与积压告警\n→ 五项补齐后有条件通过；保序为上线阻断项。',
      },
    },
    {
      id: 'a-approve',
      name: '按原方案批准上线',
      desc: '【状态变更】不做修改直接过审',
      cost: 3,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '批准结果',
        text: '原方案过审。双 11 预演：合作方抖动丢事件、积分与风控状态漂移、分析平台积压拖慢全体。\n你批准的不是方案，是 16 个下游的排期表故障。',
      },
    },
    {
      id: 'a-veto',
      name: '整体否决，退回点对点架构',
      desc: '【状态变更】否决事件总线，维持现状',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '否决结果（陷阱动作）',
        text: '方向被否，16 对点对点调用继续缠着——下次大促，"库存慢拖垮订单"的雪崩照旧。\n→ 复盘点评：发现五个缺陷的正确产出是修正清单，不是否决票。把 baby 和洗澡水一起倒掉，是评审的另一种失职。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-ordering', text: '核心阻断缺陷：单 topic 无分区键，同一订单的创建/支付/取消事件可乱序到达——下游状态机错乱（资损级），必须分区键=orderId 后才能上线', correct: true },
    { id: 'rc-slowconsumer', text: '真实风险：16 下游共享单 topic 无隔离，慢消费者积压传染全体', correct: false },
    { id: 'rc-schema', text: '真实风险：全量字段无版本管理，字段变更加重 16 方联锁发布', correct: false },
    { id: 'rc-drop', text: '真实风险：重试 30s 窗口后丢弃且无对账补偿，外部抖动必丢事件', correct: false },
  ],

  expertCost: 8,
  restartActionId: 'a-approve',

  expertChain: [
    {
      thought: '评审第一问照例要业务约束：16 个下游，谁对"事件顺序"有正确性要求？',
      update: '库存/积分/风控按生命周期流转，乱序是资损级；且点对点时代已发生 2 次同类事故——保序是硬约束。',
      actionId: 'a-impact',
      why: '1⚡ 买到设计边界：先知道谁错不起，才能判断"无分区键"是风格问题还是阻断缺陷——约束不同，评审结论完全不同。',
      conclusion: '保序确立为正确性红线 → 检验方案怎么保证它。',
    },
    {
      thought: '拿红线拷问方案：分区键设计在哪？同一订单的事件会不会被并行投递？',
      update: '实锤：单 topic 无分区键，乱序必然存在——阻断级缺陷成立。',
      actionId: 'a-orderproof',
      why: '2⚡ 评审的核心动作是"把红线对到设计上"：红线有了、设计没有对应机制，缺陷就是实锤而非猜想——这一步买到的是正确性闭环。',
      conclusion: '保序缺陷实锤 → 顺藤检查可用性与契约。',
    },
    {
      thought: '正确性之外问存活与协作：慢消费者会不会拖垮别人？schema 变更谁买单？丢的事件找得回吗？',
      update: '三项全部确认：无隔离（雪崩可复发）、无版本（16 方联锁）、3 次后丢弃（外部抖动必丢且无人知晓）。',
      actionId: 'a-dropprobe',
      why: '2⚡ 评审要同时覆盖"会不会错"与"扛不扛得住/丢不丢得起"：丢弃+无补偿的组合在"发布即免责"的语义下最危险——错误是暂时的，丢失是永久的。',
      conclusion: '四张答卷三张空白：隔离/契约/兜底全部缺失。',
    },
    {
      thought: '方向与历史对齐：解耦收益是否真实？去年的复盘教训新方案吸收了吗？',
      update: '收益真实、方向正确；历史教训（故障隔离）未被吸收——结论应是有条件通过，不是否决。',
      actionId: 'a-benefit',
      why: '1⚡ 评审的公允性来自两头都验：只挑刺会逼死好方案，只看收益会放过种子——收益与风险各归其位，结论才有分量。',
      conclusion: '修正清单可以开出了。',
    },
    {
      thought: '五项修正清单开列：保序（阻断）+ 隔离 + 契约 + 兜底 + 配额。停止追问。',
      update: '停止。',
      actionId: '',
      why: '【评审停止规则】四张必答卷全部核验完毕（保序/隔离/契约/兜底），继续追问不会发现新的结构性缺陷——评审的产出是清单，不是完美。',
      conclusion: '有条件通过：分区键为上线阻断项，其余四项为双 11 前必改。检查单：事件总线的四张必答卷——保序、隔离、契约、兜底。',
    },
  ],

  lessons: [
    {
      text: '事件总线的四张必答卷：保序（分区键）、隔离（独立消费组）、契约（schema 版本）、兜底（死信+对账）——少答一张就是未来某次故障的种子。',
      principle: '架构设计：事件总线把一次调用变成一份长期承诺。保序答"到了要对"，隔离答"慢者自慢"，契约答"变了不炸"，兜底答"丢了能找"。四问过全，方案才算完整——与缓存设计四问同构：引入新基础设施就是引入新状态机。',
    },
    {
      text: '"重试 3 次后丢弃"在"发布成功即责任完成"的语义下最危险：错误是暂时的（会重试），丢失是永久的（没人知道）。',
      principle: '兜底设计：外部依赖的抖动时长要按分钟级评估，30s 的重试窗口是仪式不是保护。丢事件必须有去处（死信）+ 有人对账（补偿任务）+ 有告警（深度/速率）——三件套齐全，"最终一致"才有底气说出口。',
    },
    {
      text: '评审的产出是修正清单，不是否决票：发现五个缺陷的正确动作是补齐它们，把好方向连同缺陷一起否掉是评审的另一种失职。',
      principle: '产品思维：方向收益与边界缺陷分开记账——"有条件通过 + 阻断项清单"才是专业结论。评审者的职责是用反例拷问边界，作者保留收益论证权；各司其职，方案才能在打磨中活下来。',
    },
  ],
}
