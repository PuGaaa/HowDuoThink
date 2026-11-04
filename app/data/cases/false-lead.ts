import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const falseLeadCase: DiagnosisCase = {
  id: 'false-lead',
  title: '告警说 B 超时，根因在 A 自己',
  intro: '推荐调用超时，但对端处理仍快。先分开等待调度、获取socket、连接和响应耗时，再核对共享预算。',
  domain: 'concurrency',
  layer: '告警告诉你"哪里在响"，不告诉你"哪里在着火"——第一个告警是最便宜的线索，不是最准确的答案',
  part: 'master',
  chapterId: 'concurrency',
  order: 4,
  typeTags: [
    'concurrency',
    'troubleshooting',
  ],
  difficulty: 3,
  scene: {
    role: '你是「鲜到家」搜索服务的负责人。告警：搜索接口调用推荐服务超时率 30%。你打开推荐服务监控——零异常。两轮排查后，你还没找到根因。',
    architecture: 'App → 搜索服务(同时调推荐/广告/ES) → 推荐服务 + 广告服务 + ES',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '告警',
        text: '搜索服务 → 推荐服务：超时率 30%（P99 > 3s）\n推荐服务监控：QPS 正常、P99 45ms、CPU 15%、零报错\n→ 推荐服务毫发无损。',
      },
      {
        type: 'text',
        title: '搜索服务现状',
        text: 'Node.js18三个origin共用Agent，maxSockets=50（每origin），另显式maxTotalSockets=50（所有origin总量）。本案跨服务争用来自总预算，不是默认maxSockets自然跨origin共享。',
      },
      {
        type: 'log',
        title: '指标采集失败',
        text: '[WARN] recommendation dashboard scrape retry=1。',
      },
      {
        type: 'log',
        title: 'DNS重试',
        text: '[WARN] optional telemetry DNS retry=1。',
      },
      {
        type: 'log',
        title: 'ES归档延期',
        text: '[WARN] ES audit retention task delayed。',
      },
    ],
    timeline: '广告服务昨天发布新版：新增 A/B 测试逻辑（某些请求耗时从 50ms 增到 3s）｜ 告警：推荐服务超时 ｜ 无推荐服务变更',
    impactHint: '推荐服务没问题——但调用它的请求超时了。那"堵"的到底是推荐服务，还是通往推荐服务的路？',
  },
  hypotheses: [
    {
      id: 'h-rec',
      text: '推荐服务有问题（但监控正常——先排除）',
      excludeActionId: 'a-rec',
    },
    {
      id: 'h-pool',
      text: '共享连接池被广告服务的长请求占满，推荐请求排队等连接',
      excludeActionId: 'a-connpool',
    },
    {
      id: 'h-ad',
      text: '推荐请求被错误路由到广告origin，广告慢直接成为推荐响应',
      excludeActionId: 'a-ad',
    },
    {
      id: 'h-es',
      text: 'ES 集群变慢拖累搜索',
      excludeActionId: 'a-es',
    },
  ],
  actions: [
    {
      id: 'a-rec',
      name: '圈定超时发生在哪个阶段',
      desc: '影响面：区分本机排队、连接与对端响应',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-rec',
      ],
      hypotheses: [
        {
          id: 'h-rec',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '推荐服务监控',
        text: '推荐已到达请求P99约45ms；失败trace的3秒主要发生在分配socket前，尚未到推荐端。独立直连同一推荐目标正常。对端零告警不是充分证明，关键是本次失败尚未发送。\n噪声收线：面板采集失败不等于推荐业务慢；独立直连与业务trace已确认45ms以及失败请求尚未发送。',
      },
    },
    {
      id: 'a-connpool',
      name: '查搜索服务的连接池状态',
      desc: '三个下游共享连接池，池子还剩几个坑',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-pool',
      ],
      hypotheses: [
        {
          id: 'h-pool',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'text',
        title: '连接池状态',
        text: '共享Agent配置maxSockets=50/每origin，maxTotalSockets=50/总量。快照广告48活动socket、推荐2，总50；推荐新请求在Agent.requests中等待，不是排在推荐服务内部。\nNode按origin分池，未设置全局总上限时，广告用满自己50不会自动占掉推荐50。这里是显式总预算导致争用。',
      },
    },
    {
      id: 'a-ad',
      name: '查广告服务新版的行为',
      desc: 'A/B 测试哪些请求变慢了',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-ad',
      ],
      hypotheses: [
        {
          id: 'h-ad',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '广告服务 A/B 分析',
        text: '请求host/port与trace均正确，推荐仍指向推荐origin；广告50%请求走3秒分支，是总预算占用的触发源，不是推荐被路由错。\n噪声收线：此解析是遥测域名，不是广告/推荐host；当前两者的请求目标与解析均正确。',
      },
    },
    {
      id: 'a-adqps',
      name: '查广告服务的 QPS 与耗时分布',
      desc: '量化广告服务在连接池上的占坑',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '广告服务 QPS 与耗时',
        text: '3000QPS是整个集群，不是单Agent；故障进程广告约32QPS，50%约3s，慢部分理论占用约16×3=48个socket，与快照同量级。原1500QPS×3s应为4500需求，不是1500，且不能拿集群数字套单进程。',
      },
    },
    {
      id: 'a-es',
      name: '检查 ES 集群状态',
      desc: '排除 ES 变慢',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-es',
      ],
      hypotheses: [
        {
          id: 'h-es',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'ES 监控',
        text: '失败时ES已到达请求P99约12ms；与推荐相同，主要问题是显式总budget被广告占用，而不是ES自身执行变慢。\n噪声收线：归档任务没有占用本搜索索引；该索引实际请求12ms，本机等待发生在socket分配之前。',
      },
    },
    {
      id: 'a-restartsvc',
      name: '重启搜索服务止血',
      desc: '【状态变更】滚动重启释放连接池和长请求',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '滚动重启释放连接池 + 杀掉广告服务的长请求。\n超时率降为 0%。但如果广告服务的 A/B 测试还在，长请求会继续积累——治标。',
      },
    },
    {
      id: 'a-separate',
      name: '拆分连接池验证',
      desc: '【状态变更】三个下游各用独立连接池，验证隔离效果',
      cost: 1,
      gain: 'high',
      effects: [],
      tests: [],
      hypotheses: [],
      danger: false,
      result: {
        type: 'text',
        title: '拆分验证',
        text: '同构仅将每origin预算隔离并明确各自/总量，保持广告慢分支和输入不变，推荐socket排队消失。增大总上限也可能止血，但需评估FD、下游和并发容量；不必无条件建三个Agent。',
      },
    },
    {
      id: 'a-fixad',
      name: '修复广告服务的超时配置',
      desc: '【状态变更】广告服务加 ML 超时 500ms + 降级返回通用广告',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '按业务允许的广告期限做有界排队、请求超时及取消，必要时返回通用广告。调用500ms超时不可能无条件使所有广告P99回60ms，需实际分布验证。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-pool',
      text: '共享Node Agent显式maxTotalSockets=50使三个origin共用全局并发预算；广告慢请求占48槽，推荐请求在发送前等待socket，非推荐端慢',
      correct: true,
    },
    {
      id: 'rc-rec',
      text: '推荐服务本身变慢',
      correct: false,
    },
    {
      id: 'rc-ad',
      text: '推荐被路由到广告origin，直接收到广告慢响应',
      correct: false,
    },
    {
      id: 'rc-es',
      text: 'ES 集群变慢拖累搜索',
      correct: false,
    },
  ],
  expertCost: 7,
  restartActionId: 'a-fixad',
  expertChain: [
    {
      thought: '先按调用阶段分解超时。',
      update: '推荐端快，失败在分socket前。',
      actionId: 'a-rec',
      why: '1⚡对端指标须与实际未发送trace关联。',
      conclusion: '排除推荐执行慢。',
    },
    {
      thought: '读取Agent每origin和总量配置。',
      update: '显式总50被48广告+2推荐占满。',
      actionId: 'a-connpool',
      why: '2⚡默认按origin与显式总预算不能混为一谈。',
      conclusion: '确认共享预算争用。',
    },
    {
      thought: '核对请求目标及慢分支。',
      update: '推荐未走错host，广告只是资源触发源。',
      actionId: 'a-ad',
      why: '2⚡真实触发因素不能误标成错误候选，应排除错误路由命题。',
      conclusion: '排除推荐路由错。',
    },
    {
      thought: '核对ES执行与等待。',
      update: 'ES自身快，未构成先行慢源。',
      actionId: 'a-es',
      why: '1⚡补齐下游反证，避免停止点冒称已查。',
      conclusion: '排除ES自身慢。',
    },
    {
      thought: '保持广告输入仅隔离预算。',
      update: '推荐排队消失。',
      actionId: 'a-separate',
      why: '1⚡单变量隔离支持本机共享资源因果。',
      conclusion: '证据闭合。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】本机socket等待、显式总budget与隔离对照吻合，推荐/ES自身慢和错误路由均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '共享Node Agent显式maxTotalSockets=50使三个origin共用全局并发预算；广告慢请求占48槽，推荐请求在发送前等待socket，非推荐端慢',
    },
  ],
  lessons: [
    {
      text: '超时要拆成排队、连接和响应阶段；对端快不能排除本机发送前等待。',
      principle: '用同trace的socket分配与发送事件定位，不把最先告警的目标当成最初故障。',
    },
    {
      text: 'Node maxSockets按origin，maxTotalSockets才是Agent总量约束；共享Agent不必然跨服务共享同一个50槽池。',
      principle: '先读真实SDK和配置再画资源图。独立Agent或分配总预算都可形成隔离，需结合FD、并发和下游容量决定。',
    },
    {
      text: '速率和预算要在同一进程口径核算；32×50%×3≈48，而不是集群3000直接套本地池。',
      principle: 'Little定律估算需求，不保证过载下的实际并发；快照活动数仍受50总上限约束。',
    },
  ],
}
