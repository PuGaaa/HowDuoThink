import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const bootOrderCase: DiagnosisCase = {
  id: 'boot-order',
  title: '发布后一半功能"没醒"：启动成功的假象',
  intro: '维护后端口和探针都正常，订单通知却没有恢复。先区分进程存活与组件就绪。',
  domain: 'deploy',
  layer: '启动成功必须有精确定义——核心依赖 fail-fast，非核心显式降级',
  part: 'engineer',
  chapterId: 'config-boot',
  order: 2,
  typeTags: [
    'config',
    'dependency',
    'process',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」订单服务的后端，一次例行的 DB 维护窗口让你的服务"活着，但没完全活"。',
    architecture: '订单服务：缓存预热、订阅游标和业务配置快照均读取DB；监听器读到游标后才注册MQ消费。普通请求按需借DB连接。',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '发布后现象',
        text: 'DB 维护结束，应用重启"成功"（进程健康、端口监听、探针通过）。\n但上线后：商品缓存全部 miss（预热失败）、订单状态变更通知不发（MQ 监听未启动）——核心下单/查询正常。',
      },
      {
        type: 'text',
        title: '启动日志的真相',
        text: '启动日志中有cache warmup failed、MQ listener start failed、config snapshot fetch failed三条WARN；随后记录Application started successfully。另有日志归档重试WARN。',
      },
    ],
    timeline: 'DB 维护窗口 01:00-01:20 ｜ 应用 01:05 重启（DB 切换中）｜ 01:30 用户反馈"通知收不到" ｜ 02:00 定位到启动日志',
    impactHint: '把受影响的业务路径与启动时间线对齐，避免把端口存活当作所有组件就绪。',
  },
  hypotheses: [
    {
      id: 'h-swallow',
      text: '启动期依赖失败被 catch 吞掉：预热/监听器半初始化，应用"假活"——启动成功的定义有漏洞',
      excludeActionId: 'a-bootlog',
    },
    {
      id: 'h-pool',
      text: '连接池初始连接获取失败，首波请求排队超时',
      excludeActionId: 'a-poolcheck',
    },
    {
      id: 'h-cachepoison',
      text: '预热失败时把空数据写进了缓存，运行时读到空',
      excludeActionId: 'a-cachecheck',
    },
    {
      id: 'h-dns',
      text: '主从切换后 DNS/连接串残留旧实例，写请求发往已下线的库',
      excludeActionId: 'a-dnscheck',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '给功能做"活着/没醒"分级',
      desc: '影响面：哪些功能正常、哪些没醒、它们启动时的共同点',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '功能存活分级',
        text: '正常 ✓：下单/查询/支付回调（核心读写，运行时才建连接）\n没醒 ✗：商品缓存预热（全 miss）、订单状态 MQ 监听（未启动）、配置快照（空）\n共同点：没醒的功能全部在"启动阶段"做过依赖交互——它们撞上了维护窗口；\n正常的功能启动时不碰 DB。\n→ 分级的结果指向"启动期交互"——那 3 条 WARN 的分量陡增。',
      },
    },
    {
      id: 'a-bootlog',
      name: '重读启动日志：WARN 里藏着死亡名单',
      desc: '启动期 catch 吞掉的异常，逐条还原',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-swallow',
        'h-cachepoison',
      ],
      hypotheses: [
        {
          id: 'h-swallow',
          status: 'confirmed',
        },
        {
          id: 'h-cachepoison',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '启动日志解剖',
        text: '01:05:12缓存预热读DB被拒绝；01:05:12监听器读DB订阅游标被拒绝，未执行MQ注册；01:05:13业务配置快照读DB被拒绝。\n三个init的catch仅记录WARN后返回，无状态上报或重试；缓存失败分支没有写入空对象，样本键均不存在。01:05:14打印started。\n日志归档WARN来自独立定时器，重试成功；不参与上述初始化调用链。',
      },
    },
    {
      id: 'a-poolcheck',
      name: '核对连接池状态',
      desc: '排除核心读写受影响',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-pool',
        'h-dns',
      ],
      hypotheses: [
        {
          id: 'h-pool',
          status: 'excluded',
        },
        {
          id: 'h-dns',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '连接池核对',
        text: '01:30连接池活跃4、空闲16、等待0，抽样读写成功。实际连接peer为新主VIP，旧主已下线且无残留连接。故当前池排队和旧地址不能解释持续缺失的监听注册。',
      },
    },
    {
      id: 'a-cachecheck',
      name: '核对预热失败后的缓存内容',
      desc: '确认放大器：空数据是否被写入',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-cachepoison',
      ],
      hypotheses: [
        {
          id: 'h-cachepoison',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '缓存核对',
        text: '失败分支只记日志，不写占位；样本缓存键均不存在。读取时回源可成功，缺的是启动预热，不是空对象把重试锁死。',
      },
    },
    {
      id: 'a-dnscheck',
      name: '核对主从切换的连接串',
      desc: '排除 DNS/连接串残留',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-dns',
      ],
      hypotheses: [
        {
          id: 'h-dns',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'DNS 核对',
        text: '连接串走 VIP（主从切换 VIP 漂移），01:20 后新连接全部指向新主——核心读写正常也旁证。\n→ 排除连接残留。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急重启全部实例（DB 已就绪后）',
      desc: '【状态变更】凌晨批量重启，赌一次"干净启动"',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重启结果',
        text: 'DB 已恢复，重启后全部组件初始化成功——功能"全部醒来"。\n但这依赖运气：重启时 DB 恰好健康。若维护窗口再延长，重启一次醒一半。\n→ 止血可一次，不可成瘾——启动逻辑要修成"不靠运气"。',
      },
    },
    {
      id: 'a-fixboot',
      name: '修复：启动分两级——核心 fail-fast，非核心显式降级',
      desc: '【状态变更】核心依赖(DB)失败即终止启动；非核心(预热/监听)标记 degraded + 后台重试',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '按本业务契约：订单通知监听和业务配置快照是核心能力，初始化失败则不就绪，停止接流量并按受控策略重试；不可只让进程活着。缓存预热可降级，显式上报并在依赖恢复后重试。\n同构演练中延长DB故障窗口，确认核心未就绪时不会误接业务流量。',
      },
    },
    {
      id: 'a-fixreadiness',
      name: '沉淀：就绪探针带上依赖健康',
      desc: '【状态变更】核心监听/配置未就绪不接流量，缓存预热可显式降级',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '就绪语义',
        text: '健康端点分级：core 组件失败 = 不就绪（不接流量）；\n非核心失败 = 就绪但打 degraded 标记（接流量 + 告警）。\n"启动成功"从此有精确定义：进程活 + 核心就绪 + 非核心状态可见。',
      },
    },
    {
      id: 'a-fixrunbook',
      name: '沉淀：维护窗口启动顺序 runbook',
      desc: '【状态变更】依赖就绪确认（DB/VIP/配置中心）→ 应用分批启动 → 组件健康抽查——窗口 SOP 三步',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'runbook',
        text: '维护窗口 SOP：\n① 依赖就绪确认（DB 连通 + VIP 漂移完成 + 配置中心可用）\n② 应用分批启动（10% → 50% → 100%，批间健康抽查）\n③ 组件级健康抽查（预热样本/监听样本/快照样本）。\n窗口期启动从"赌运气"变成"按手册"。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-swallow',
      text: '启动期三个组件（缓存预热/MQ 监听/配置快照）的依赖失败被 try-catch 吞成 WARN：DB 维护窗口内重启 → 半初始化假活，无重试无健康上报——"启动成功"的定义缺少组件级语义',
      correct: true,
    },
    {
      id: 'rc-pool',
      text: '连接池初始连接失败导致首波请求超时',
      correct: false,
    },
    {
      id: 'rc-cachepoison',
      text: '预热失败写入空占位缓存且跳过重预热（放大器）',
      correct: false,
    },
    {
      id: 'rc-dns',
      text: '主从切换后 DNS/连接串残留旧库',
      correct: false,
    },
  ],
  expertCost: 4,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '按业务功能划分影响面。',
      update: '缺失功能都在启动阶段读DB。',
      actionId: 'a-impact',
      why: '1⚡功能分组能定位共同的初始化时间窗。',
      conclusion: '重点读取启动组件记录。',
    },
    {
      thought: '把WARN与初始化代码对应。',
      update: 'DB失败后未注册监听、未重试；没有写空缓存。',
      actionId: 'a-bootlog',
      why: '2⚡异常时间线与失败分支同时证明半初始化，并反证空占位。',
      conclusion: '确认吞失败，排除缓存污染。',
    },
    {
      thought: '核对恢复后的连接状态。',
      update: '池无等待，新连接指向新主。',
      actionId: 'a-poolcheck',
      why: '1⚡当前池统计和实际peer共同排除池排队与旧地址。',
      conclusion: '其余解释排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】启动失败被忽略且无重试已确认，缓存占位、池等待和旧地址均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '启动期三个组件（缓存预热/MQ 监听/配置快照）的依赖失败被 try-catch 吞成 WARN：DB 维护窗口内重启 → 半初始化假活，无重试无健康上报——"启动成功"的定义缺少组件级语义',
    },
  ],
  lessons: [
    {
      text: '启动期 catch 吞掉依赖失败 = 半初始化假活：进程健康、探针通过、一半功能死在起跑线且无重试无上报。',
      principle: '无论启动期还是运行期，都不能只吞异常。按业务契约决定失败、重试或显式降级；核心能力未就绪必须反映到readiness。',
    },
    {
      text: '"启动成功"必须有精确定义：进程活 + 核心组件就绪 + 非核心组件状态可见（degraded 标记）——三层缺一不可。',
      principle: '可观测性设计：健康端点分级汇报 core/degraded，就绪探针只认 core，degraded 接流量但告警。没有组件级定义的"启动成功"是进程的自我表扬——功能是否真的活着，要看每个组件的初始化结果。',
    },
    {
      text: '初始化失败与合法空数据要分开表示。本案没有写空占位，不能把未发生的缓存污染列为已证实放大器。',
      principle: '复盘只写已取得的证据。预热是否核心、监听是否可降级由业务契约决定；不能按组件名称一概判定。',
    },
  ],
}
