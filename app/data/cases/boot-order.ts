import { DiagnosisCase } from '../../types/case'

/**
 * 第 7 章 · 配置与启动 第二批（启动期依赖失败被吞 L2）
 * 教学点：程序设计——启动期依赖失败被 catch 吞掉 = 半初始化：核心依赖 fail-fast，
 * 非核心依赖显式降级 + 健康上报；"启动成功"必须有精确定义。
 * 专家路径：impact(1) + bootlog(2) + poolcheck(1) = 4⚡︎
 */
export const bootOrderCase: DiagnosisCase = {
  id: 'boot-order',
  title: '发布后一半功能"没醒"：启动成功的假象',
  intro: 'DB 维护窗口后重启应用：启动全绿，但缓存预热、消息监听等一半功能没醒——启动期失败被 catch 吞掉了。',
  domain: 'deploy',
  layer: '启动成功必须有精确定义——核心依赖 fail-fast，非核心显式降级',
  part: 'engineer',
  chapterId: 'config-boot',
  order: 2,
  typeTags: ['config', 'dependency', 'process'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」订单服务的后端，一次例行的 DB 维护窗口让你的服务"活着，但没完全活"。',
    architecture: '订单服务(启动时: 连 DB / 预热本地缓存 / 启动 MQ 监听 / 拉取配置快照) → DB(维护窗口内主从切换)',
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
        text: '启动日志里藏着 3 条 WARN：\n"cache warmup failed, skipped" / "MQ listener start failed, will not retry"\n它们被 try-catch 包裹——启动继续了，但一半功能永远没醒。',
      },
    ],
    timeline: 'DB 维护窗口 01:00-01:20 ｜ 应用 01:05 重启（DB 切换中）｜ 01:30 用户反馈"通知收不到" ｜ 02:00 定位到启动日志',
    impactHint: '"启动成功"的定义是什么？进程活着 = 功能都活着吗？启动日志里那 3 条 WARN 是这题的答案。',
  },

  hypotheses: [
    { id: 'h-swallow', text: '启动期依赖失败被 catch 吞掉：预热/监听器半初始化，应用"假活"——启动成功的定义有漏洞', excludeActionId: 'a-bootlog' },
    { id: 'h-pool', text: '连接池初始连接获取失败，首波请求排队超时', excludeActionId: 'a-poolcheck' },
    { id: 'h-cachepoison', text: '预热失败时把空数据写进了缓存，运行时读到空', excludeActionId: 'a-cachecheck' },
    { id: 'h-dns', text: '主从切换后 DNS/连接串残留旧实例，写请求发往已下线的库', excludeActionId: 'a-dnscheck' },
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
      tests: ['h-swallow'],
      hypotheses: [{ id: 'h-swallow', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '启动日志解剖',
        text: '01:05:12  [WARN]  cache warmup failed (Connection refused), skipped\n01:05:12  [WARN]  MQ listener start failed, will not retry\n01:05:13  [WARN]  config snapshot fetch failed, using empty\n01:05:14  [INFO]  Application started successfully   ← "成功"的假象\n代码解剖：三个组件的启动逻辑都是 try{ init() } catch(e){ log.warn } ——\nDB 维护窗口内全部失败被吞，应用"成功"启动。\n实锤：半初始化——进程活着，一半的功能死在了起跑线，且没有重试、没有健康上报。',
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
      tests: ['h-pool'],
      hypotheses: [{ id: 'h-pool', status: 'excluded' }],
      result: {
        type: 'text',
        title: '连接池核对',
        text: '连接池懒加载模式：首请求才建连接——01:30 时 DB 已恢复，核心读写全部正常。\n→ 排除连接池：它"躲过"了维护窗口（懒加载），也解释了核心功能为何正常。',
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
      tests: ['h-cachepoison'],
      hypotheses: [{ id: 'h-cachepoison', status: 'down' }],
      result: {
        type: 'text',
        title: '缓存核对',
        text: '预热代码失败分支写入了"空对象"占位（防止穿透）——运行时读到空缓存数据，\n即便后续重跑预热，占位键存在导致跳过——放大器实锤。\n→ 列入整改：失败不得写占位，或占位带短 TTL。',
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
      tests: ['h-dns'],
      hypotheses: [{ id: 'h-dns', status: 'excluded' }],
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
      cost: 1,
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
        text: '① 核心依赖（DB/配置）：启动失败 → 终止进程（fail-fast，交给重启策略）\n② 非核心（预热/监听）：失败 → 实例标记 degraded + 后台指数重试 + 成功后自愈\n③ MQ 监听去掉 "will not retry"，改为持续重连\n混沌回归：DB 不可用窗口启动 → 核心实例快速失败重排（不假活）；恢复后 3 分钟内全部自愈。',
      },
    },
    {
      id: 'a-fixreadiness',
      name: '沉淀：就绪探针带上依赖健康',
      desc: '【状态变更】/healthz 汇报各组件状态（core/degraded），degraded 不接流量并告警',
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
    { id: 'rc-swallow', text: '启动期三个组件（缓存预热/MQ 监听/配置快照）的依赖失败被 try-catch 吞成 WARN：DB 维护窗口内重启 → 半初始化假活，无重试无健康上报——"启动成功"的定义缺少组件级语义', correct: true },
    { id: 'rc-pool', text: '连接池初始连接失败导致首波请求超时', correct: false },
    { id: 'rc-cachepoison', text: '预热失败写入空占位缓存且跳过重预热（放大器）', correct: false },
    { id: 'rc-dns', text: '主从切换后 DNS/连接串残留旧库', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '功能"活着/没醒"的分级是第一动作：正常与失败的分组，指向它们启动期的差异。',
      update: '没醒的功能全部在启动期碰过 DB（维护窗口），正常的功能启动时不碰 DB——分级结果直指启动期交互。',
      actionId: 'a-impact',
      why: '1⚡︎ 分级把"一半功能没醒"变成"启动期碰依赖的功能没醒"——分组特征直接锁定时间窗（启动期）与空间（依赖交互）。',
      conclusion: '嫌疑锁定：启动期失败被吞（h-swallow 升权）。',
    },
    {
      thought: '重读启动日志——"Application started successfully"的上一行往往就是真相。',
      update: '实锤：3 条 WARN 对应 3 个没醒的组件，全部被 catch 吞掉且无重试——半初始化假活。',
      actionId: 'a-bootlog',
      why: '2⚡︎ 教学核心：启动日志的 INFO 成功语句会掩盖 WARN 的失败清单——"启动成功"若无组件级定义，就只是进程级的自我安慰。catch-吞-异常在启动期比运行期更危险：它没有第二次机会。',
      conclusion: '根因实锤：半初始化假活。',
    },
    {
      thought: '连接池/缓存占位/DNS 三个假设逐个定权——核心为何正常、放大器在哪、残留是否存在。',
      update: '懒加载让核心躲过窗口、占位缓存是放大器、DNS 清白——三层结构（根因/放大器/无关）清晰。',
      actionId: 'a-poolcheck',
      why: '1⚡︎ 多层定权防止"一锅修"：根因（吞异常）与放大器（占位缓存）修复方式完全不同——定权让修复清单各就各位。',
      conclusion: '定权完成 → 分级修复。',
    },
    {
      thought: '止血（重启靠运气）、修复（两级启动）、语义（就绪分级）、流程（窗口 runbook）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（catch 吞启动失败）✓ 定义（启动成功的组件级语义）✓ 防线（探针分级+runbook）✓——机制、语义、防线三层闭合。',
      conclusion: '沉淀：启动成功必须有精确定义——核心依赖 fail-fast，非核心显式降级 + 健康上报；半初始化的"假活"比崩溃更难被发现。',
    },
  ],

  lessons: [
    {
      text: '启动期 catch 吞掉依赖失败 = 半初始化假活：进程健康、探针通过、一半功能死在起跑线且无重试无上报。',
      principle: '程序设计：启动期与运行期的异常处理策略必须不同——运行期可吞可重试，启动期失败要么 fail-fast（核心）要么显式降级（非核心，标记 degraded + 后台重试）。"will not retry" 是启动日志里最危险的短语。',
    },
    {
      text: '"启动成功"必须有精确定义：进程活 + 核心组件就绪 + 非核心组件状态可见（degraded 标记）——三层缺一不可。',
      principle: '可观测性设计：健康端点分级汇报 core/degraded，就绪探针只认 core，degraded 接流量但告警。没有组件级定义的"启动成功"是进程的自我表扬——功能是否真的活着，要看每个组件的初始化结果。',
    },
    {
      text: '失败不得写占位：预热失败时把"空数据"写进缓存，等于给故障上了锁——占位必须有短 TTL 或干脆不写。',
      principle: '程序设计：防御性占位（防空穿透）与故障态的边界要清晰——"数据暂缺"是短暂状态，用短 TTL 占位；"初始化失败"是异常状态，不写任何占位。占位错写会让修复后的重试也被跳过（键存在即跳过）。',
    },
  ],
}
