import { DiagnosisCase } from '../../types/case'

/**
 * 第 13 章 · 消息与异步 第六批（扩容破坏保序 L3）
 * 教学点：假设思维——"同一 key 永远同一分区"依赖分区数恒定：扩容改分区数 = 重排所有 key；
 * 保序承诺的边界 = 分区拓扑的变更管理。
 * 专家路径：impact(1) + rebalanceaudit(2) + ordercheck(1) = 4⚡︎
 */
export const partitionSplitCase: DiagnosisCase = {
  id: 'partition-split',
  title: '消费者扩容后，同一订单的状态乱了序',
  intro: '为扛大促把订单 topic 从 12 分区扩到 24：扩容后同一订单的"支付/发货"事件开始乱序到达下游。',
  domain: 'runtime',
  layer: '保序承诺的边界 = 分区拓扑——改分区数就是重排所有 key 的家',
  part: 'master',
  chapterId: 'messaging',
  order: 5,
  typeTags: ['messaging', 'capacity', 'race'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」订单事件总线的负责人，一次例行的消费者扩容撕碎了保序承诺。',
    architecture: '订单服务 → 订单事件 topic(原 12 分区, key=orderId, 分区内 FIFO) → 状态服务(按事件顺序维护订单状态机) ｜ 大促扩容: 分区 12→24, 消费者 6→12',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '状态机错乱告警',
        text: '状态服务告警：4.1% 订单出现非法状态跃迁——"已发货"订单收到"支付成功"事件（应忽略）被重新置为已支付；\n部分订单"创建"事件晚于"取消"到达， resurrect 已取消订单。',
      },
      {
        type: 'text',
        title: '时间线',
        text: '扩容完成 14:00；乱序告警 14:05 起（扩容后新产生的事件）。\n扩容前的存量事件顺序正常——问题只发生在"扩容后新写入的事件"。',
      },
    ],
    timeline: '分区扩容 14:00 完成（12→24，为消费者 6→12 的扩容配套）｜ 乱序 14:05 起 ｜ 事件处理代码与消费逻辑零变更',
    impactHint: '扩容前正常、扩容后乱序——"同一 key 同一分区"的承诺，在分区数变化的那一刻还成立吗？',
  },

  hypotheses: [
    { id: 'h-resplit', text: '分区数变化导致 key 重排：同一 orderId 的新事件按新 hash 落到新分区，与旧分区内的事件并行——跨分区无序', excludeActionId: 'a-rebalanceaudit' },
    { id: 'h-consumer', text: '消费者扩容本身乱序：12 个消费者各领任意分区，处理速度差导致跨分区到达乱序', excludeActionId: 'a-consumerspeed' },
    { id: 'h-producer', text: '生产端双写：扩容期间新旧分区数并存，部分实例仍按 12 分区路由', excludeActionId: 'a-producercheck' },
    { id: 'h-bug', text: '状态服务自身的状态机 bug（与扩容巧合）', excludeActionId: 'a-ordercheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '解剖乱序订单的事件落位',
      desc: '影响面：乱序事件在哪个分区、与旧事件的分区关系',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '乱序样本解剖（order#88102）',
        text: '14:00 前：支付事件 → 分区 p7（hash(orderId) % 12 = 7）→ 正常消费 ✓\n14:02：发货事件 → hash % 24 = 19 → 新分区 p19 → 另一消费者先处理！\n状态机视角：发货(14:02 处理) → 支付(14:06 才在 p7 被消费) → 非法跃迁\n→ 同一 orderId 的前后事件分家了：旧事件在旧分区、新事件在新分区——保序在分区边界上断裂。',
      },
    },
    {
      id: 'a-rebalanceaudit',
      name: '审计分区扩容的语义',
      desc: 'hash 域变化审计：12→24 对每个 key 意味着什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-resplit'],
      hypotheses: [{ id: 'h-resplit', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'hash 域审计',
        text: 'hash(orderId) % 12 → hash(orderId) % 24：\n不是"每个 key 平移到新分区"——是全量重排：约 50% key 的新旧落点不同。\n订单 #88102：7 → 19；订单 #88103：3 → 15；…\n关键语义：保序承诺 = "同 key 同分区且分区内 FIFO"——分区数一变，\n承诺对"跨扩容时刻的事件序列"整体失效（旧事件锁死在旧分区，新事件流向新家）。\n实锤：扩容改分区数 = 重排所有 key 的家，跨越变更时刻的 key 序列必然跨分区。',
      },
    },
    {
      id: 'a-ordercheck',
      name: '核对状态服务的乱序防御',
      desc: '状态机有没有版本号/时间戳防御',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-bug'],
      hypotheses: [{ id: 'h-bug', status: 'excluded' }],
      result: {
        type: 'text',
        title: '防御审计',
        text: '状态机按"事件到达顺序"处理，无事件版本号、无时间戳单调性校验——\n乱序到达 = 照单全收。下游零防御放大了上游拓扑变更的伤害。',
      },
    },
    {
      id: 'a-consumerspeed',
      name: '核对消费者处理速度差',
      desc: '排除消费速度差导致的常态乱序',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-consumer'],
      hypotheses: [{ id: 'h-consumer', status: 'excluded' }],
      result: {
        type: 'text',
        title: '速度核对',
        text: '扩容前 12 分区 6 消费者已运行一年，状态机零乱序告警——\n同分区内 FIFO 从未因速度差乱过（同分区天然有序）。\n→ 排除消费速度：乱序只在"跨分区"出现，而跨分区只在扩容后出现。',
      },
    },
    {
      id: 'a-producercheck',
      name: '核对生产端路由实例',
      desc: '排除新旧分区数并存',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-producer'],
      hypotheses: [{ id: 'h-producer', status: 'excluded' }],
      result: {
        type: 'text',
        title: '生产端核对',
        text: '全部生产实例 14:00 后已按 24 分区路由（metadata 刷新确认）。\n→ 排除双写：乱序不是"路由不一致"，是"路由正确但 key 搬家"。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急回退分区数到 12',
      desc: '【状态变更】topic 分区 24→12 回退',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回退结果（陷阱动作）',
        text: '分区回退引发第二次全量 key 重排——正在跨分区过渡的事件再次搬家，\n乱序窗口反而延长；且已扩容的 12 个消费者有一半无分区可领。\n→ 复盘点评：拓扑变更不可逆——回退也是又一次重排。正确动作是"下游临时加固"，不是"拓扑回退"。',
      },
    },
    {
      id: 'a-fixguard',
      name: '修复：状态服务事件防御 + 存量修复',
      desc: '【状态变更】事件携带版本号+状态机单调校验；受影响订单按事件时间重放修复',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 事件体补 eventSeq（订单内单调递增），状态机丢弃 seq ≤ 已处理的乱序事件\n② 4.1% 受影响订单：按事件时间戳重放修复（1.9 万单）\n③ 乱序告警清零，非法跃迁 0。',
      },
    },
    {
      id: 'a-fixtopo',
      name: '沉淀：分区拓扑变更纪律',
      desc: '【状态变更】分区数冻结制度：保序 topic 扩容 = 新 topic 双写迁移，禁止原地改分区数',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '拓扑纪律',
        text: '保序 topic 的分区数 = 契约的一部分：\n扩容正解 = 新 topic（24 分区）双写过渡 → 消费端按事件版本对账 → 旧 topic 只读下线。\n原地改分区数的操作从运维手册删除——"改个数字"会重排所有 key 的家。',
      },
    },
    {
      id: 'a-fixdoc',
      name: '沉淀：保序承诺文档化',
      desc: '【状态变更】事件总线文档明确承诺边界：同 key 同分区内 FIFO；跨分区/跨拓扑变更不保序，消费端必须自带防御',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '承诺边界',
        text: '事件总线契约文档新增"保序的边界"：\n✔ 同 key 同分区内严格 FIFO\n✘ 跨分区不保序　✘ 拓扑变更窗口不保序　✘ 重放/迁移不保序\n消费端义务：带版本号防御乱序——承诺写清楚，防御才有人做。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-resplit', text: '分区扩容 12→24 使 hash 域全量重排（约 50% key 换分区）：同一订单跨扩容时刻的事件序列分家——旧事件锁死旧分区、新事件流向新分区并行消费，状态机无版本防御照单全收，4.1% 订单非法跃迁', correct: true },
    { id: 'rc-consumer', text: '消费者处理速度差导致跨分区常态乱序', correct: false },
    { id: 'rc-producer', text: '扩容期间生产端新旧分区数并存双写', correct: false },
    { id: 'rc-bug', text: '状态服务自身状态机逻辑 bug', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '扩容前正常、扩容后乱序——样本解剖先看"乱序的事件各自住在哪个分区"。',
      update: '同一订单的支付在旧 p7、发货在新 p19——保序在分区边界上断裂。',
      actionId: 'a-impact',
      why: '1⚡︎ 事件落位解剖是消息类故障的验尸：症状（状态机乱）→ 骨骼（事件分区分布），一张图看出"分家"。',
      conclusion: '嫌疑锁定：分区重排（h-resplit 升权）。',
    },
    {
      thought: '审计 hash 域：12→24 不是平移，是全量重排——对每个 key 意味着什么。',
      update: '实锤：约 50% key 换分区；保序承诺对"跨扩容时刻的序列"整体失效——机制级结论。',
      actionId: 'a-rebalanceaudit',
      why: '2⚡︎ 教学核心：保序 = "同 key 同分区 + 分区内 FIFO"的合取，分区数变 = 前半句失效——这个机制一旦理解，"扩容为什么会乱序"从直觉困惑变成数学必然。',
      conclusion: '根因实锤：拓扑变更撕裂保序。',
    },
    {
      thought: '消费速度 1⚡︎ 排除——一年零告警的历史证明同分区从不乱。',
      update: '速度差排除：乱序专属"跨分区"——进一步坐实拓扑归因。',
      actionId: 'a-consumerspeed',
      why: '1⚡︎ 历史数据是最便宜的排除：扩容前一年零乱序 = 同分区 FIFO 从未失信——把矛头精确指向"跨分区"这个唯一新变量。',
      conclusion: '归因收窄完成。',
    },
    {
      thought: '生产端/状态机各 1⚡︎ 排除；拓扑回退陷阱点评；下游防御 + 拓扑纪律 + 承诺文档。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（hash 重排）✓ 放大（下游无防御）✓ 防线（版本防御+拓扑纪律+边界文档）✓——机制、放大、防线三层闭合。',
      conclusion: '沉淀：保序承诺的边界 = 分区拓扑——改分区数就是重排所有 key 的家，消费端必须自带乱序防御。',
    },
  ],

  lessons: [
    {
      text: '分区数一变，所有 key 重排家：保序 = "同 key 同分区 + 分区内 FIFO"，改分区数让前半句对跨变更序列整体失效。',
      principle: '假设思维：保序 topic 的分区数是契约的一部分，不是容量参数。扩容正解 = 新 topic 双写迁移（事件带版本号对账），原地改分区数 = 撕裂所有跨变更时刻的序列——拓扑回退也是又一次重排，不可逆。',
    },
    {
      text: '下游必须自带乱序防御：事件带单调 seq + 状态机丢弃过期事件——上游承诺再硬，也硬不过拓扑变更。',
      principle: '程序设计：任何依赖"事件顺序"的状态机都要有版本号防御（eventSeq 单调校验）。防御的收益在拓扑变更/重放/迁移时兑现——4.1% 的非法跃迁，每一单都是"上游永远有序"这个假设的欠条。',
    },
    {
      text: '承诺要写清边界：同 key 同分区内 FIFO ✔，跨分区/拓扑变更/重放 ✘——承诺文档化，防御才有人做。',
      principle: '架构设计：事件总线的保序承诺必须文档化边界条件。含糊的承诺（"我们保序"）让下游裸奔；显式的边界（三种不保序场景）让每个消费者自己回答"我需要什么级别的防御"——契约的清晰度决定系统的防御深度。',
    },
  ],
}
