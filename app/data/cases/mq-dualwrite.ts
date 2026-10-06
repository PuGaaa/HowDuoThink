import { DiagnosisCase } from '../../types/case'

/**
 * 第 5 章 · 消息与异步 第五批（双写不一致 L2）
 * 教学点：架构设计——DB 提交与 MQ 发送是两步，中间没有原子性：本地消息表/事务消息是标准解；
 * 对账兜底 + 失败显式化，三层防线各管一段。
 * 专家路径：impact(1) + codeseq(2) + brokercheck(1) = 4⚡︎
 */
export const mqDualWriteCase: DiagnosisCase = {
  id: 'mq-dualwrite',
  title: '订单落库了，积分消息却消失了',
  intro: '订单落库成功，"积分发放"消息却没了：DB 提交与 MQ 发送是两步——中间进程死掉，谁也不欠谁。',
  domain: 'runtime',
  layer: '两次写入之间没有原子性——消息要和业务数据同生共死',
  part: 'master',
  chapterId: 'messaging',
  order: 9,
  typeTags: ['messaging', 'data', 'race'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」订单平台的架构师，积分系统的对账差异把双写问题摆上了台面。',
    architecture: '下单服务：① DB 事务(订单落库) ② 发送 MQ(积分消息) → 积分消费者(幂等入账)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '积分对账差异',
        text: '日均 230 单：订单表有记录、MQ 无积分消息——积分永远漏发。\n用户侧症状：下单成功但积分不到账（客诉集中在"重试也无效"的订单）。',
      },
      {
        type: 'text',
        title: '时间特征',
        text: '丢失订单的"发送时刻"与实例重启/FullGC 时刻吻合。\n发送日志：这些订单的 send 调用根本从未发生——不是发送失败，是没走到发送。',
      },
    ],
    timeline: '下单代码结构：commit() → send() 顺序两步 ｜ 每周 2~3 次发布重启 + 偶发 FullGC ｜ 问题随重启频率波动',
    impactHint: '消息"没被发送"而不是"发送失败"——在 commit 与 send 之间的那个间隙里，世界发生了什么？',
  },

  hypotheses: [
    { id: 'h-gap', text: '双写间隙：commit 与 send 两步非原子——间隙内进程死亡，消息永远不会发出', excludeActionId: 'a-codeseq' },
    { id: 'h-sendfail', text: '发送失败但异常被静默吞掉（有 send 无记录）', excludeActionId: 'a-sendlog' },
    { id: 'h-broker', text: 'Broker 收到后丢失（持久化缺陷）', excludeActionId: 'a-brokercheck' },
    { id: 'h-consumer', text: '消息消费了但积分落库失败（消费侧丢）', excludeActionId: 'a-consumerside' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '对齐丢失时刻与进程事件',
      desc: '影响面：丢失订单的时刻与什么进程级事件重合',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '时刻对齐（30 个丢失样本）',
        text: '22 例：对齐实例重启时刻（±50ms）——commit 后进程死\n6 例：对齐 FullGC 停顿（>2s）——GC 后请求线程被杀/超时中断\n2 例：对齐 OOM kill\n消费侧：同期零异常（收到的消息 100% 入账）\n→ 丢失全部聚集在"两个写入之间"的进程级事件——间隙实锤。',
      },
    },
    {
      id: 'a-codeseq',
      name: '解剖下单代码的两步时序',
      desc: 'commit 与 send 之间有什么保障——答案是"什么都没有"',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-gap'],
      hypotheses: [{ id: 'h-gap', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '时序解剖',
        text: 'tx.commit(order)          ← DB 已持久\nmq.send(pointsMessage)    ← 3ms 后进程被 kill\n→ 两步是"顺序"不是"事务"：没有任何机制保证"提交过的订单必有消息"。\n间隙概率模型：重启频率 × 窗口 3ms ≈ 0.05%/天 ✓ 与实测 230/46 万单吻合。\n实锤：双写不一致是结构性缺陷——修"小心"没用，要修"原子"。',
      },
    },
    {
      id: 'a-sendlog',
      name: '审计发送失败的异常处理',
      desc: '顺藤摸瓜：send 阶段还有第二个漏洞吗',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-sendfail'],
      hypotheses: [{ id: 'h-sendfail', status: 'down' }],
      result: {
        type: 'text',
        title: '发送审计',
        text: '发现并行缺陷：send 超时异常被 catch 后仅 log.info——日均另有 12 单"发送失败被吞"。\n它解释小部分丢失；主体（230 单）是"根本没走到 send"。\n→ 降权为并行缺陷：两处一起修——投递失败的显式重试与"从未发送"的兜底，机制上可以统一。',
      },
    },
    {
      id: 'a-brokercheck',
      name: '核对 Broker 持久化',
      desc: '排除 Broker 丢消息',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-broker'],
      hypotheses: [{ id: 'h-broker', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'Broker 核对',
        text: '发送日志与 Broker 存储逐条对得上：收到的消息零丢失（刷盘配置同步刷）。\n→ 排除 Broker：它只丢了"从未被托付"的消息。',
      },
    },
    {
      id: 'a-consumerside',
      name: '核对消费侧入账',
      desc: '排除消费丢失',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-consumer'],
      hypotheses: [{ id: 'h-consumer', status: 'excluded' }],
      result: {
        type: 'text',
        title: '消费核对',
        text: '消费者幂等+入账正常；收到的积分消息 100% 落库。\n→ 排除消费侧：断点唯一——生产端的"两步之间"。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急回退为同步调用积分服务',
      desc: '【状态变更】弃 MQ 改同步 RPC 保证"提交即入账"',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回退结果（陷阱动作）',
        text: '漏发归零（同步调用失败会抛错重试）。\n代价：解耦倒退——积分服务抖动直接拖慢下单（回到去年雪崩的老路）；削峰能力丢失。\n→ 复盘点评：一致性不该靠退回耦合解决——原子性的标准解是"消息与业务数据同库同事务"。',
      },
    },
    {
      id: 'a-fixlocal',
      name: '修复：本地消息表（事务内落消息）',
      desc: '【状态变更】订单事务内写"待发消息"记录；独立投递器扫表发送+重试',
      cost: 3,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 订单事务内同库写入 message_outbox（与订单同 commit——原子）\n② 独立投递器：扫表发送 → 成功标记；失败指数退避重试 → 超限进死信告警\n③ 幂等保障不变（消息 ID 去重）\n回归：重启/kill 混沌注入 100 轮——零漏发（消息随订单同生共死）。',
      },
    },
    {
      id: 'a-fixcatch',
      name: '沉淀：发送失败显式化',
      desc: '【状态变更】send 失败进"待重试"而非 log.info；并行缺陷（12 单/天）一并消除',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '显式化',
        text: '直接发送模式保留但失败必须落"待重试表"（与 outbox 同一归宿）。\nlog.info 吞发送异常的写法进 lint 黑名单——"失败要留下会重试的痕迹"。',
      },
    },
    {
      id: 'a-fixrecon',
      name: '沉淀：双向对账制度化',
      desc: '【状态变更】订单表 vs 积分流水的小时级对账，差异自动补发消息',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '对账兜底',
        text: '小时级对账：有订单无积分（且过宽限期）→ 自动补发消息。\n→ 本地消息表管"当下的原子"，对账管"历史的遗漏"——防线纵深，漏网之鱼一小时内有救。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-gap', text: '双写间隙：DB commit 与 MQ send 两步非原子，间隙内进程死亡（重启/FullGC/OOM）则消息永远不会发出——结构性缺陷，日均 230 单漏发积分', correct: true },
    { id: 'rc-sendfail', text: '发送失败异常被 log.info 吞掉（并行缺陷，日均 12 单）', correct: false },
    { id: 'rc-broker', text: 'Broker 收到后持久化丢失', correct: false },
    { id: 'rc-consumer', text: '消息消费成功但积分落库失败', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '丢失全部聚集在"两个写入之间"的进程事件——先对齐时刻：它们和重启/GC 的重合度。',
      update: '22/30 对齐重启、6 例对齐 FullGC——间隙假说有了第一层数据支撑。',
      actionId: 'a-impact',
      why: '1⚡︎ 时刻对齐把"偶发漏发"翻译成"间隙问题"：丢失与进程事件的强相关，直接排除"随机丢"类解释。',
      conclusion: '嫌疑锁定：双写间隙（h-gap 升权）。',
    },
    {
      thought: '解剖两步时序：commit 与 send 之间有什么保障——顺便用概率模型验证间隙理论。',
      update: '实锤：两步之间零保障；重启频率 × 3ms 窗口的理论漏发率与实测吻合——结构性缺陷。',
      actionId: 'a-codeseq',
      why: '2⚡︎ 代码时序 + 概率模型双重实锤：前者证明"没有机制"，后者证明"数字对得上"——结构性缺陷的修复必须是机制（原子化），不能是"提交后尽快发"这类减小窗口的安慰剂。',
      conclusion: '根因实锤：非原子双写。',
    },
    {
      thought: 'send 阶段顺藤摸瓜——"发送失败被吞"是双写问题的孪生兄弟，一起清点。',
      update: '发现并行缺陷：12 单/天的 send 异常被 log.info 吞——两处统一到"待重试"归宿。',
      actionId: 'a-sendlog',
      why: '1⚡︎ 孪生缺陷的清点价值：间隙问题（没走到 send）与失败问题（send 了但没人管）在修复上可以共用一套"落表重试"机制——一起修省一次改造。',
      conclusion: '修复方案统一为本地消息表。',
    },
    {
      thought: 'Broker 与消费侧各 1⚡︎ 排除——两侧清白后，"生产端两步之间"成为唯一断点。',
      update: 'Broker 零丢失、消费 100% 入账——断点唯一，修复聚焦。',
      actionId: 'a-brokercheck',
      why: '1⚡︎ 端到端清场防止修复发散：MQ 链路排查容易"到处加固"——两侧的无责证明让修复精准落在唯一断点。',
      conclusion: '嫌疑收敛 → 本地消息表 + 对账兜底。',
    },
    {
      thought: '止血（回退同步是陷阱）、修复（outbox 原子化）、显式化（失败落表）、兜底（对账补发）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（间隙）✓ 概率（模型吻合）✓ 防线（三层）✓——机制、量化、纵深三层闭合。',
      conclusion: '沉淀：两次写入之间没有原子性——本地消息表让消息与业务数据同生共死，对账让历史遗漏有兜底。解耦与一致性可以兼得，但不可以兼得于"小心翼翼"。',
    },
  ],

  lessons: [
    {
      text: 'DB commit 与 MQ send 之间没有原子性：进程在间隙里死亡，消息永远不会发出——"提交后尽快发"是安慰剂不是方案。',
      principle: '架构设计：跨系统双写的原子性标准解是本地消息表（outbox）：业务数据与消息记录同库同事务提交，独立投递器扫表发送。事务消息/事件溯源同理——消息要与业务数据"同生共死"，而不是"先后出现"。',
    },
    {
      text: '对账是双写的最终防线：订单表 vs 积分流水的对账让"历史遗漏"有一小时内被兜底的命运。',
      principle: '沉淀思维：原子化机制覆盖"当下"，对账覆盖"历史的所有漏洞"（机制 bug、运维失误、未知的边界）。防线分层设计：机制防 99.95%，对账兜剩下的 0.05%——两者缺一，那 0.05% 就是客诉与资损。',
    },
    {
      text: '一致性不能靠退回耦合解决：同步调用"不丢消息"的代价是解耦、削峰、故障隔离全部回退——修原子性，不修解耦。',
      principle: '架构权衡：遇到异步一致性问题时，"改回同步"是最大的陷阱——它把消息丢失换成级联故障。正确方向：让消息与业务数据原子绑定（outbox/事务消息），失败显式化（待重试落表），对账兜底。',
    },
  ],
}
