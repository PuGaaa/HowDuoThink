import { DiagnosisCase } from '../../types/case'

/**
 * 第 9 章 · 消息与异步 第三批（重平衡风暴 L2）
 * 教学点：假设思维——消费者被"请"出组的两个时钟：session timeout（心跳）与 max.poll.interval（拉取间隔）；
 * 单批处理时间必须有预算；慢消息隔离是组稳定性的前提。
 * 专家路径：impact(1) + pollaudit(2) + repro(1) = 4⚡︎
 */
export const rebalanceStormCase: DiagnosisCase = {
  id: 'rebalance-storm',
  title: '消费每 10 分钟停摆一次：有人在群里被反复"请出去"',
  intro: '订单消息消费每 10 分钟规律性停摆：消费者组反复重平衡——处理慢的实例总在关键时刻被"请"出群。',
  domain: 'runtime',
  layer: '留在消费者组里有两个时钟——心跳之外，还有拉取间隔的死线',
  part: 'master',
  chapterId: 'messaging',
  order: 7,
  typeTags: ['messaging', 'config', 'capacity'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」订单消息消费链路的负责人，一张规律得诡异的消费暂停曲线摆在你面前。',
    architecture: '订单 MQ(24 分区) → 消费者组(6 实例, session 10min, max.poll.interval 5min, 单批 500 条) → 业务处理',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '消费者组日志',
        text: 'Rebalance 事件：每 10 分钟精确触发一次，单次全组停摆约 40s。\n被移出的实例：总是同一个——处理"风控审核消息"最慢的那个。',
      },
      {
        type: 'text',
        title: '连带伤害',
        text: '重平衡期间全组暂停消费；被移出实例的分区消息重投给其他实例（部分重复处理）。\n停摆 6 次/小时 × 40s ≈ 8% 吞吐蒸发，重复消费引发下游幂等告警。',
      },
    ],
    timeline: '上周单批拉取量从 100 调到 500（消费提速改造）｜ 重平衡风暴自此开始 ｜ 业务量增长使风控审核消息处理耗时翻倍',
    impactHint: '重平衡的触发者是谁？被移出的实例"死"在哪一个时钟上——心跳，还是别的什么？',
  },

  hypotheses: [
    { id: 'h-polltimeout', text: '单批处理耗时超过 max.poll.interval(5min)：消费者被判定"失去响应"触发重平衡', excludeActionId: 'a-pollaudit' },
    { id: 'h-session', text: 'session timeout 过短：网络抖动导致心跳丢失被误判失活', excludeActionId: 'a-sessioncfg' },
    { id: 'h-broker', text: 'Broker 积压过大主动迁移分区引发重平衡', excludeActionId: 'a-brokermove' },
    { id: 'h-deploy', text: '滚动发布期间的正常重平衡被误读为故障', excludeActionId: 'a-deploylog' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '对齐重平衡时刻与实例行为',
      desc: '影响面：每次重平衡时，被移出实例正在干什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '重平衡时刻画像（6 个周期）',
        text: '每次被移出的实例在移出前：正在处理一批含风控审核消息的批次（处理中）\n该实例的 poll 间隔：上一次 poll 到被移出 = 5.2~6.1 分钟\n其余 5 实例 poll 间隔：< 1 分钟（心跳正常）\n→ 被移出的不是"心跳丢了"的实例，是"拉取间隔超时"的实例——两个时钟要分开看。',
      },
    },
    {
      id: 'a-pollaudit',
      name: '审计消费参数与单批耗时',
      desc: 'max.poll.interval 与真实批处理时间的对账',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-polltimeout'],
      hypotheses: [{ id: 'h-polltimeout', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '参数对账',
        text: 'max.poll.interval.ms = 300s（5 分钟死线）\n单批实测：500 条中含 1~2 条风控审核消息（各 2~3min 人工模式响应）\n→ 慢批总耗时 5.4~6.1min > 300s 死线\n机制闭环：处理超时 → 组协议判定"失活" → 移出 + 分区重分配 →\n该实例位点未提交，消息重投 → 其他实例接手后又遇到慢消息 → 下一轮再有人超时——风暴自持。',
      },
    },
    {
      id: 'a-repro',
      name: '受控复现：批大小与重平衡的关系',
      desc: '500 条触发，100 条不触发——调参实验钉死因果',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '对照实验',
        text: '单批 500 条（含慢消息）：重平衡 100% 在 5~6min 后触发\n单批 100 条（含慢消息）：处理 < 2min，零重平衡\n单批 500 条（剔除慢消息）：处理 40s，零重平衡\n→ 变量分离完成：触发条件 = 批处理时间 > max.poll.interval。上周"提速改造"把批调大，恰好把死线踩穿。',
      },
    },
    {
      id: 'a-sessioncfg',
      name: '核对 session timeout 与心跳日志',
      desc: '排除心跳侧误判',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-session'],
      hypotheses: [{ id: 'h-session', status: 'excluded' }],
      result: {
        type: 'text',
        title: '心跳核对',
        text: 'session.timeout.ms = 10min 充足；心跳线程日志连续无中断——心跳由独立线程发送，不受批处理阻塞。\n→ 排除心跳侧：踢出的依据是 poll 超时，不是心跳丢失。',
      },
    },
    {
      id: 'a-brokermove',
      name: '核对 Broker 侧分区迁移记录',
      desc: '排除 Broker 主动迁移',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-broker'],
      hypotheses: [{ id: 'h-broker', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'Broker 核对',
        text: 'Broker 无 preferred leader election / 分区迁移记录；全部重平衡由消费者组侧发起（poll 超时）。\n→ 排除 Broker。',
      },
    },
    {
      id: 'a-deploylog',
      name: '核对发布窗口与重平衡时刻',
      desc: '排除发布期正常重平衡',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-deploy'],
      hypotheses: [{ id: 'h-deploy', status: 'excluded' }],
      result: {
        type: 'text',
        title: '发布核对',
        text: '近两周无发布；重平衡时刻与发布记录零重叠。\n→ 排除部署扰动。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急把 max.poll.interval 调到 30 分钟',
      desc: '【状态变更】死线放宽，重平衡立刻停止',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '调参结果',
        text: '重平衡停止，消费恢复连续。\n代价：单批卡死时最长 30 分钟无消费进度、无重分配——故障的"自愈机制"被关掉了。\n→ 治标：死线是保护机制，放宽它等于把熔断器焊死。',
      },
    },
    {
      id: 'a-fixbatch',
      name: '修复：批大小回落 + 慢消息隔离',
      desc: '【状态变更】单批 100 条；风控审核消息转独立消费者组',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 单批回落 100 条：批处理 P99 回到 40s（死线的 13%）\n② 风控审核消息按类型路由到独立消费者组（独立并发度与超时预算）——慢者自慢，快组不陪\n③ 回归：连续 24h 零重平衡，重复消费告警清零。',
      },
    },
    {
      id: 'a-fixbudget',
      name: '沉淀：单批处理时间预算',
      desc: '【状态变更】规范：批处理 P99 ≤ max.poll.interval × 1/3；超预算先拆批或异步化',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '预算制度',
        text: '消费组配置检查单新增：批大小 × 单条 P95 耗时 ≤ interval × 1/3（三倍安全边际）。\n"提速改造"调大批次前必须过这条预算——上周的改造若有此检查，风暴不会发生。',
      },
    },
    {
      id: 'a-fixguard',
      name: '沉淀：重平衡分类监控',
      desc: '【状态变更】重平衡频率与原因分类告警（poll 超时 / 心跳丢失 / 主动离开）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控 v2',
        text: '重平衡事件按原因打标上报；poll 超时类 > 0 即告警（它意味着有批踩线）。\n预期外重平衡本身就是异常信号——风暴在第一个周期就会被抓住。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-polltimeout', text: '单批拉取量调大（100→500）后，含风控审核慢消息的批次处理 5.4~6.1min 超过 max.poll.interval(5min)：消费者被组协议判定失活移出——重平衡风暴自持循环，叠加位点未提交导致重复消费', correct: true },
    { id: 'rc-session', text: 'session timeout 过短，网络抖动误判实例失活', correct: false },
    { id: 'rc-broker', text: 'Broker 积压触发分区主动迁移', correct: false },
    { id: 'rc-deploy', text: '滚动发布期间的正常重平衡被误读', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '重平衡规律得诡异——先对齐时刻：每次被移出的实例当时在干什么、它的 poll 间隔多长。',
      update: '被移出实例 poll 间隔 5.2~6.1min（其余 < 1min）——死线嫌疑从"心跳"转向"拉取间隔"。',
      actionId: 'a-impact',
      why: '1⚡︎ 消费者组有两个时钟（心跳/poll），被踢出的依据必须先分辨是哪个——对齐时刻与行为，时钟归属立刻清晰。',
      conclusion: '嫌疑锁定：max.poll.interval 超时（h-polltimeout 升权）。',
    },
    {
      thought: '参数对账：单批真实处理时间 vs 死线——把"以为的配置"和"实际的耗时"放在一起。',
      update: '实锤：慢批 5.4~6.1min > 300s；上周批大小 100→500 恰好踩穿死线——风暴自持机制完整。',
      actionId: 'a-pollaudit',
      why: '2⚡︎ 参数对账揭示改造的隐性代价：调大批次是"提速"，但它把批处理时间推过死线——每个配置参数都连着一个保护机制，动它之前要问"这个数字在保护什么"。',
      conclusion: '根因实锤：批处理时间超死线。',
    },
    {
      thought: '对照实验分离变量：批大小、慢消息两个维度各自扫一遍——因果钉死同时产出修复参数。',
      update: '100 条零触发、剔除慢消息零触发——批处理时间 > interval 是充要条件；回落 100 条即修复方向。',
      actionId: 'a-repro',
      why: '1⚡︎ 二维对照实验一次回答"是哪个变量、阈值在哪、怎么修"——复现实验的产出不止因果，还有修复的验收参数。',
      conclusion: '因果钉死 → 修复分两层。',
    },
    {
      thought: '心跳/Broker/发布三个常规嫌疑各 1⚡︎ 排除——尤其心跳丢失，是重平衡最常见的误判方向。',
      update: '心跳线程独立无中断、Broker 无迁移、无发布窗口——三个假设有证据排除。',
      actionId: 'a-sessioncfg',
      why: '1⚡︎ 排除"最常见解释"要最先做：心跳丢失的叙事最顺手，证据也最容易拿到——先关掉它，剩下的才是需要实验的。',
      conclusion: '嫌疑收敛单点。',
    },
    {
      thought: '止血（放宽死线，代价自知）、修复（批回落+慢隔离）、制度（时间预算+分类监控）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（批超死线）✓ 变更源（提速改造）✓ 防线（预算检查单）✓——机制、来源、防复发三层闭合。',
      conclusion: '沉淀：消费者组里有两个时钟，批处理预算 ≤ interval 的三分之一。慢消息要隔离——组协议对"慢"的惩罚是把整个组拖进风暴。',
    },
  ],

  lessons: [
    {
      text: '留在消费者组里有两个时钟：session timeout（心跳，独立线程）与 max.poll.interval（拉取间隔，受批处理阻塞）——踢出的依据要分辨清楚。',
      principle: '程序设计：心跳线程不受批处理影响，poll 超时才随批处理走。批处理时间预算 ≤ interval × 1/3（三倍安全边际）；调大批次/单条变慢前先过预算检查——每个超时参数都在保护什么，动它之前要回答。',
    },
    {
      text: '重平衡风暴是自持循环：慢批被踢 → 分区重投 → 接手者又遇慢消息 → 再有实例超时——慢消息隔离是打断循环的唯一办法。',
      principle: '架构设计：消费者组对"慢"的惩罚是集体性的。慢消息（人工审核/外部慢调用）必须隔离到独立消费者组或独立 topic，让慢者自慢——共享组的吞吐由最慢的那条消息决定。',
    },
    {
      text: '放宽超时是焊死熔断器：死线触发重平衡是"自愈机制"，调大它停止风暴的同时也关掉了故障转移——治标要看清代价。',
      principle: '止血权衡：紧急调参前先问"这个机制在保护什么、放宽后风险窗口多大"。本例的 30min 死线意味着单批卡死时 30 分钟无消费进度且无重分配——止血可用，修复（拆批+隔离）必须跟上。',
    },
  ],
}
