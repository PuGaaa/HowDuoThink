import { DiagnosisCase } from '../../types/case'

/**
 * 第 2 章 · 可观测性迷雾 第三批（异步链路追踪断链 L2）
 * 教学点：全栈视野——trace 上下文必须随消息跨进程传播：断链不是异步的宿命，是生产端忘了注入；
 * 观测覆盖率要按"链路段"验收，孤儿 trace 比例是断链的哨兵。
 * 专家路径：impact(1) + msgheader(2) + asynccheck(1) = 4⚡︎
 */
export const traceBreakCase: DiagnosisCase = {
  id: 'trace-break',
  title: '链路追踪到 MQ 就断了：因果线没人接',
  intro: '排查慢订单时，链路追踪到消息队列就断了：异步段全是"孤儿 trace"——一半的排查时间花在人肉续链。',
  domain: 'runtime',
  layer: 'trace 上下文要随消息走——断链不是异步的宿命，是生产端忘了注入',
  part: 'master',
  chapterId: 'observability',
  order: 8,
  typeTags: ['observability', 'messaging', 'process'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」平台的可观测性负责人，一次积分对账排查把你拖进了"人肉续链"的泥潭。',
    architecture: '支付服务(trace 完整) → MQ(order-events) → 积分/通知服务(孤儿 trace) ｜ trace 透传：HTTP 头 ✓，MQ 消息头 ✗',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '追踪平台统计',
        text: 'MQ 消费段 100% 为孤儿 trace（无 parent_trace_id）——每条消息各自生成全新 trace。\n同步链路（HTTP）trace 完整率 99.7%。',
      },
      {
        type: 'text',
        title: '排查体验',
        text: '"积分未到账"排查实录：支付侧 5 分钟定位（trace 一路绿到 MQ 发布）；\nMQ 之后的积分侧花了 40 分钟——靠时间戳 + 订单号在日志里人肉拼接因果。',
      },
    ],
    timeline: '追踪系统上线一年，HTTP 链路从未断过 ｜ MQ 消费端 SDK 支持透传但从未被"喂"过上下文 ｜ 上季度 60% 的 P2 故障涉及异步链路',
    impactHint: '同步链路 99.7% 完整、异步链路 100% 断——不是追踪系统的能力问题，是"喂料"问题。',
  },

  hypotheses: [
    { id: 'h-context', text: '生产端发送 MQ 消息时未注入 trace 上下文（headers 为空），消费端只能自建新 trace', excludeActionId: 'a-msgheader' },
    { id: 'h-sample', text: '采样策略把消费段排除/丢弃，导致链路上看不到该段', excludeActionId: 'a-samplepolicy' },
    { id: 'h-agent', text: '消费者实例的 agent 未装配或版本过旧，不支持 MQ 插件', excludeActionId: 'a-agentver' },
    { id: 'h-async', text: '异步语义天然无因果关联，断链是设计使然（不可修）', excludeActionId: 'a-asynccheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '量化断链的范围与代价',
      desc: '影响面：断链覆盖哪些段、排查代价差多少',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '断链全景',
        text: '断链范围：全部 6 条 MQ 链路（订单/积分/通知/风控/库存/归集），孤儿率 100%\n排查代价对比（上季度 P2 故障复盘）：\n  纯同步链路故障：平均定位 11 分钟\n  涉异步链路故障：平均 52 分钟（其中 ~35 分钟是人肉续链）\n→ 断链不是"体验问题"，是按分钟计费的排查税。',
      },
    },
    {
      id: 'a-msgheader',
      name: '解剖一条消息的上下文携带',
      desc: '生产端注入了吗、消费端接到了吗',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-context'],
      hypotheses: [{ id: 'h-context', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '消息头解剖',
        text: '抓一条订单消息：\nheaders：{} ← 空的！W3C traceparent 缺失\n生产端代码：直接 message.send(body)——没注入 trace 上下文\n消费端 SDK：具备"读 headers 续链"能力（插件已装）——但输入是空的，只能自建新 trace。\n实锤：断点在生产端的"忘注入"，消费端无辜且有能力。',
      },
    },
    {
      id: 'a-asynccheck',
      name: '辨析"异步无因果"的说法',
      desc: '断链是语义必然还是观测缺陷',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-async'],
      hypotheses: [{ id: 'h-async', status: 'excluded' }],
      result: {
        type: 'text',
        title: '语义辨析',
        text: '"异步没有调用栈所以没有因果"是误解：\n业务因果明确存在（订单事件 → 积分入账），时间上也不并发（消息先于消费）。\nW3C Trace Context 规范明确支持消息场景的上下文传播。\n→ 排除"宿命论"：断链是观测缺陷，且是标准方案可修的缺陷。',
      },
    },
    {
      id: 'a-samplepolicy',
      name: '核对采样策略',
      desc: '排除采样丢段',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-sample'],
      hypotheses: [{ id: 'h-sample', status: 'excluded' }],
      result: {
        type: 'text',
        title: '采样核对',
        text: '采样策略：错误与慢 trace 全量保留。孤儿问题 100% 发生（与采样率无关）——\n如果只是采样问题，至少 0.1% 的消息该有完整链路，实际是零。\n→ 排除采样。',
      },
    },
    {
      id: 'a-agentver',
      name: '核对消费端 agent 装配',
      desc: '排除工具侧缺失',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-agent'],
      hypotheses: [{ id: 'h-agent', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'agent 核对',
        text: '消费者实例 agent 版本最新、MQ 插件已激活（日志可见插件加载）。\n→ 排除工具侧：能力在，缺的是"喂给它上下文"的生产端一步。',
      },
    },
    {
      id: 'a-syncpatch',
      name: '临时改同步调用绕开断链',
      desc: '【状态变更】MQ 改为同步 HTTP 调用积分服务，让 trace 连起来',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '同步化结果（陷阱动作）',
        text: 'trace 通了（HTTP 链路完整），"积分未到账"当单查清。\n代价：解耦倒退——积分服务抖动将直接拖慢支付主链路（回到去年大促雪崩的老路），MQ 削峰能力丢失。\n→ 复盘点评：观测不能绑架架构——该修的是注入，不是把异步系统改回同步。',
      },
    },
    {
      id: 'a-fixinject',
      name: '修复：生产端注入 + 消费端续链',
      desc: '【状态变更】发送前注入 trace context 到消息 headers；消费端提取后续链',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 生产端 SDK 统一封装：发送前自动注入 traceparent + baggage（业务已封装，业务代码零改动）\n② 消费端提取 headers 续链：消费 span 挂到上游 trace\n③ 回归：6 条 MQ 链路孤儿率 100% → 0%；"积分未到账"重放排查：5 分钟全链路定位（原 45 分钟）。',
      },
    },
    {
      id: 'a-fixbaggage',
      name: '沉淀：双保险关联键',
      desc: '【状态变更】协议层 trace + 业务层关联键（orderId 进 baggage/消息属性）双通道',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '双保险',
        text: 'trace 上下文（协议层）之外，orderId 作为业务关联键强制进入消息属性与 baggage：\n即使 trace 断了（新组件/新协议），业务键仍可跨系统关联——两条因果线，断一条还有一条。',
      },
    },
    {
      id: 'a-fixaudit',
      name: '沉淀：孤儿 trace 巡检',
      desc: '【状态变更】每日扫描孤儿 trace 比例（> 5% 告警）+ 新增生产者代码审查清单',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '巡检上线',
        text: '孤儿比例看板 + 告警；代码审查清单新增一条：新增任何"跨进程发送"必须确认 trace 注入。\n断链从"上线一年无人知"变成"当天发现"。',
      },
    },
    {
      id: 'a-fixcov',
      name: '沉淀：追踪覆盖率分段验收',
      desc: '【状态变更】覆盖率看板按链路段（HTTP/MQ/定时任务）统计；异步段纳入观测性验收',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '验收 v2',
        text: '"可观测性验收"从"接入了追踪"细化为"每段链路 trace 完整率 ≥ 99%"——\nHTTP 好看掩盖不了 MQ 全断：分段统计让每个盲区无处藏身。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-context', text: 'MQ 生产端发送消息未注入 trace 上下文（消息头为空），消费端虽具备续链能力但只能自建新 trace——6 条异步链路 100% 孤儿，异步故障排查时长 52min vs 同步 11min', correct: true },
    { id: 'rc-sample', text: '采样策略丢弃消费段 trace', correct: false },
    { id: 'rc-agent', text: '消费端 agent 未装配或不支持 MQ', correct: false },
    { id: 'rc-async', text: '异步语义天然无因果，断链不可修', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-fixinject',

  expertChain: [
    {
      thought: '同步 99.7% 完整、异步 100% 断——先量化断链的范围与排查税：它值多少分钟。',
      update: '6 条 MQ 链路全断、异步故障定位 52min vs 11min——断链按分钟计费，优先级成立。',
      actionId: 'a-impact',
      why: '1⚡︎ 量化"人肉续链"的代价是把观测债变成正经待办的关键：52-11=41 分钟/次 × 故障频次，数字让投入有了依据。',
      conclusion: '问题定性：喂料缺失，非能力缺失。',
    },
    {
      thought: '解剖一条消息：生产端注入了吗、消费端接到了吗——断点必在两端之一。',
      update: '实锤：消息头为空，生产端没注入；消费端插件激活、能力齐备——断点在生产端"忘注入"。',
      actionId: 'a-msgheader',
      why: '2⚡︎ 单消息解剖一次分清"两端责任"：断链排查最容易犯的错是去折腾消费端——消息头是空的，铁证把修复指向生产端的统一封装。',
      conclusion: '根因实锤：生产端注入缺失。',
    },
    {
      thought: '"异步无因果"的宿命论要正面辨析——它决定这个问题是"可修"还是"该忍"。',
      update: '排除：业务因果明确存在，W3C 标准支持消息传播——断链是缺陷不是宿命。',
      actionId: 'a-asynccheck',
      why: '1⚡︎ 观念层面的假设也要用证据处理：如果接受了"异步天生断链"，修复就不会立项——辨析宿命论是立项的前提。',
      conclusion: '可修性确认 → 标准方案落地。',
    },
    {
      thought: '采样与 agent 各 1⚡︎ 排除——工具侧两个常见嫌疑清场。',
      update: '采样全保留错误/慢 trace、agent 插件激活——工具侧清白，聚焦数据侧。',
      actionId: 'a-samplepolicy',
      why: '1⚡︎ 排除工具侧是为了防止"升级追踪系统"式浪费：能力都在，修复只是补一次注入——修 10% 的问题不花 100% 的预算。',
      conclusion: '嫌疑收敛单点 → SDK 统一封装修复。',
    },
    {
      thought: '止血不需要（无线上损伤）、修复（注入+续链）、双保险（业务键）、防线（巡检+分段验收）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】断点（生产端）✓ 能力（消费端齐备）✓ 防线（孤儿巡检+分段验收）✓——修复与防复发两层闭合。',
      conclusion: '沉淀：trace 上下文要随消息走——断链不是异步的宿命。观测覆盖率必须按链路段验收，孤儿比例是断链的哨兵。',
    },
  ],

  lessons: [
    {
      text: 'trace 上下文要随消息跨进程传播：断链不是异步的宿命，是生产端忘了注入——W3C 标准明确支持消息场景。',
      principle: '全栈视野：跨进程发送（MQ/定时任务/线程池边界）是 trace 的天然断点，每新增一处就要确认一次注入。SDK 统一封装（自动注入/提取）让业务代码零改动——靠每个开发者记得注入，一年后必然是 6 条链路全断。',
    },
    {
      text: '观测覆盖率必须按链路段验收：HTTP 99.7% 的漂亮数字掩盖了 MQ 100% 全断——分段统计让盲区无处藏身。',
      principle: '可观测性设计："接入了追踪"不等于"追踪有效"。覆盖率看板按段（HTTP/MQ/定时任务/第三方调用）统计完整率，孤儿 trace 比例 > 5% 告警——每一段都是独立的因果线，断一段就盲一段。',
    },
    {
      text: '协议层 trace + 业务层关联键双保险：trace 断了（新组件/新协议）时，orderId 仍能把因果串起来。',
      principle: '防御式观测：两条因果线互为备份——trace 是机器续链（自动），业务键是人肉续链的最后依托（强制进消息属性）。排查的终极兜底不是更聪明的工具，是两套独立且都不可丢弃的关联机制。',
    },
  ],
}
