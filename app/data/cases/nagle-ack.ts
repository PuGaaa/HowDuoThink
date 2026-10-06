import { DiagnosisCase } from '../../types/case'

/**
 * 第 11 章 · 网络深处 第三批（Nagle × 延迟确认互等 L2）
 * 教学点：全栈视野——两个"各自正确"的 TCP 优化相遇会互等出 40ms；
 * 延迟指纹（精确 40ms 整数倍）直指定时器；低延迟 RPC 必须 TCP_NODELAY。
 * 专家路径：impact(1) + packetpair(2) + repro(1) = 4⚡︎
 */
export const nagleAckCase: DiagnosisCase = {
  id: 'nagle-ack',
  title: '风控接口偶发 40ms 整数倍延迟',
  intro: '风控接口偶发 40ms 整数倍延迟：不丢包不重传，延迟精确落在 40/80/120ms——像有人定时按了暂停。',
  domain: 'network',
  layer: '两个各自正确的优化相遇会互等——TCP_NODELAY 是低延迟 RPC 的底线配置',
  part: 'master',
  chapterId: 'network',
  order: 6,
  typeTags: ['network', 'config'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」风控链路的负责人，一个"整数倍延迟"的曲线让你头皮发麻。',
    architecture: '支付服务(小请求 8~200B) → 内网 → 风控引擎(响应 2KB+, 上月升级后分两次 write) ｜ 双方 TCP 均默认配置(Nagle 开)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '延迟分布',
        text: '4% 请求延迟异常：精确的 40ms / 80ms / 120ms——全部是 40 的整数倍，无一例外。\n不丢包、不重传、内网 RTT 0.8ms。',
      },
      {
        type: 'text',
        title: '触发条件',
        text: '只发生在"小请求 + 大响应"场景；大请求（> 1KB）零延迟。\n时间点：风控引擎上月升级之后开始出现。',
      },
    ],
    timeline: '风控引擎上月升级：响应改为"先写头、再写体"两次 write ｜ 40ms 毛刺自此出现 ｜ 双端 TCP 参数从未调过',
    impactHint: '延迟精确落在 40ms 的整数倍——这不是"慢"，是"有人在等一个定时器"。谁在等谁？',
  },

  hypotheses: [
    { id: 'h-nagle', text: 'Nagle 算法与对端延迟确认互等：未满段等 ACK，对端攒着不 ACK——40ms 定时器合谋', excludeActionId: 'a-packetpair' },
    { id: 'h-gc', text: '风控引擎偶发 GC 停顿恰好 40ms', excludeActionId: 'a-gccheck' },
    { id: 'h-thread', text: '引擎线程池调度周期 40ms，请求在队列里排队', excludeActionId: 'a-schedcheck' },
    { id: 'h-qdisc', text: '中间网络设备排队/缓冲延迟', excludeActionId: 'a-qdisccheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '分析延迟的数值指纹与触发条件',
      desc: '影响面：哪些请求延迟、延迟值有什么规律',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '延迟指纹',
        text: '延迟值分布：40ms × 71%、80ms × 24%、120ms × 5%——100% 为 40 整数倍\n触发场景：小请求(8~200B) + 大响应(2KB+)；大请求零延迟\n时间相关性：引擎升级后出现\n→ "整数倍定时器"指纹：不是资源不足（那会是无规律长尾），是协议行为在等某个固定 tick。',
      },
    },
    {
      id: 'a-packetpair',
      name: '逐包时序分析：谁在等谁',
      desc: '抓包看收发节奏，重建互等闭环',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-nagle'],
      hypotheses: [{ id: 'h-nagle', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '逐包时序（一次 40ms 延迟）',
        text: 't0      支付服务发出 8B 请求\nt0.8ms  引擎收到，处理 0.2ms，开始写 2KB 响应\n        第一段 1460B（满段）立即发出 ✓\n        第二段 540B（未满 MSS）→ Nagle：未满段必须等对端 ACK 才能发 → 攒住\nt0.8~40.8ms 支付服务 delayed ACK：没有数据要回，ACK 延迟确认定时器 40ms 才触发\nT+40ms  ACK 到达引擎 → 第二段才发出 → 总延迟 ≈ 40ms\n→ Nagle（等 ACK 攒小包）× 延迟确认（攒着不 ACK）= 互等合谋。两个优化各自正确，相遇即死锁 40ms。',
      },
    },
    {
      id: 'a-repro',
      name: '受控实验：关掉任何一端会怎样',
      desc: '单端 TCP_NODELAY 即破局——因果的最终确认',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '四象限实验',
        text: '两端 Nagle 开（现状）：40ms 延迟 100% 复现\n引擎关 Nagle（TCP_NODELAY）：延迟 0%\n支付服务关 Nagle：延迟 0%\n两端全关：0%\n→ 任意一端关闭即破局——互等结构实锤；同时揭示修复不需要"全关"，破掉合谋即可。',
      },
    },
    {
      id: 'a-gccheck',
      name: '核对引擎 GC 记录',
      desc: '排除 GC 停顿',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-gc'],
      hypotheses: [{ id: 'h-gc', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'GC 核对',
        text: 'GC 停顿 P99 3ms，无 40ms 级停顿记录；延迟时刻与 GC 时间轴无对齐。\n→ 排除 GC。',
      },
    },
    {
      id: 'a-schedcheck',
      name: '核对引擎线程调度',
      desc: '排除 40ms 调度周期',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-thread'],
      hypotheses: [{ id: 'h-thread', status: 'excluded' }],
      result: {
        type: 'text',
        title: '调度核对',
        text: '线程池排队微秒级；无 40ms 周期的定时任务。\n→ 排除应用层调度。',
      },
    },
    {
      id: 'a-qdisccheck',
      name: '核对中间网络设备',
      desc: '排除设备排队',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-qdisc'],
      hypotheses: [{ id: 'h-qdisc', status: 'excluded' }],
      result: {
        type: 'text',
        title: '中间链路核对',
        text: '同主机其他服务无此延迟；交换机无丢包/排队记录。\n→ 排除中间设备：嫌疑只剩两端主机的 TCP 栈行为。',
      },
    },
    {
      id: 'a-danger',
      name: '全局关闭支付服务所有连接的 Nagle',
      desc: '【状态变更】一刀切 TCP_NODELAY 全量连接',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '一刀切结果',
        text: '延迟消失。代价：内网包量 +30%（小包不再合并），带宽与网卡中断上升；\n大流量批量场景吞吐下降 8%。\n→ 复盘点评：低延迟连接该关 Nagle，批量吞吐连接不该——一刀切把两种场景混为一谈。',
      },
    },
    {
      id: 'a-fixnodelay',
      name: '修复：RPC 连接 TCP_NODELAY + 引擎响应单次写出',
      desc: '【状态变更】风控客户端连接开启 NODELAY；引擎响应合并为一次 write',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 风控 RPC 客户端 TCP_NODELAY（低延迟连接标配）\n② 引擎侧响应聚合为一次 write（先头后体的两次 write 是上月升级引入的触发器）\n回归：40ms 毛刺 0%；内网包量仅 +2%（NODELAY 只开了 RPC 连接）。',
      },
    },
    {
      id: 'a-fixwrite',
      name: '沉淀：响应写出规范',
      desc: '【状态变更】写法规范：小响应聚合单次写出/显式 flush；禁"半段响应等 ACK"模式',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '写法规范',
        text: '框架层统一：响应组装完成后单次写出（或显式 flush）；\n代码评审清单新增：禁止对同一响应多次 write 小段——每次分段都是一次"给 Nagle 递刀"。',
      },
    },
    {
      id: 'a-fixlat',
      name: '沉淀：RPC 基线默认 TCP_NODELAY',
      desc: '【状态变更】RPC 框架默认 NODELAY；连接参数登记表同步更新',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '基线更新',
        text: 'RPC 框架默认 TCP_NODELAY（低延迟场景禁 Nagle），批量传输场景显式开启 Nagle 并注明理由。\n连接参数登记表更新——"谁在等谁的定时器"从此有账可查。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-nagle', text: 'Nagle（未满段等 ACK）× 对端延迟确认（40ms 才 ACK）互等：引擎两次 write 后第二段攒住等 ACK——小请求大响应场景 4% 请求延迟 40ms 整数倍', correct: true },
    { id: 'rc-gc', text: '引擎偶发 40ms GC 停顿', correct: false },
    { id: 'rc-thread', text: '线程池 40ms 调度周期排队', correct: false },
    { id: 'rc-qdisc', text: '中间网络设备排队延迟', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '延迟精确是 40ms 整数倍——先读这个指纹：什么机制会长出"固定 tick 的整数倍"。',
      update: '定时器指纹 + 只发生在小请求大响应 + 引擎升级后出现——应用层资源问题解释不了整数倍，协议层"等定时器"的嫌疑最大。',
      actionId: 'a-impact',
      why: '1⚡︎ 数值指纹是最诚实的线索：GC/排队/设备延迟是无规律长尾，"精确 40ms 整数倍"指向某个固定 tick 的定时器——指纹把嫌疑空间直接缩到协议行为。',
      conclusion: '嫌疑锁定：TCP 层互等（h-nagle 升权）。',
    },
    {
      thought: '逐包时序重建：把一次 40ms 拆成一帧一帧的收发节奏——谁在攒、谁在等，一目了然。',
      update: '实锤：第二段 540B 被 Nagle 攒住等 ACK，支付服务 delayed ACK 40ms 才回——互等闭环完整。',
      actionId: 'a-packetpair',
      why: '2⚡︎ 逐包分析是 TCP 行为问题的显微镜：两个优化（Nagle/延迟确认）各自正确、相遇互等——只有逐包才能看见"等"发生在哪一帧。',
      conclusion: '根因实锤：Nagle × delayed ACK 合谋。',
    },
    {
      thought: '四象限实验定因果与修法：关掉任何一端会不会破局。',
      update: '单端关闭即归零——互等结构确认；同时发现修复不必一刀切（破局即可，不必全关）。',
      actionId: 'a-repro',
      why: '1⚡︎ 实验同时产出因果和修复的精度的：互等结构意味着"拆散双方任一即可"——修复可以按连接粒度精确处理，避免全局一刀切的代价。',
      conclusion: '修复方向：RPC 连接 NODELAY + 响应单次写出。',
    },
    {
      thought: 'GC/调度/设备三个 40ms 嫌疑各 1⚡︎ 排除——留证以防"其实是不是 GC"的老话重提。',
      update: 'GC 停顿微秒级、无 40ms 调度周期、中间设备无排队——三个假设有证据排除。',
      actionId: 'a-gccheck',
      why: '1⚡︎ "整倍数延迟"最容易被误读成 GC——GC 是延迟排查的万能背锅侠，必须用数据把它请出嫌疑名单。',
      conclusion: '嫌疑收敛单点。',
    },
    {
      thought: '止血（一刀切有代价）、修复（RPC NODELAY + 单次写出）、沉淀（写法规范+基线默认）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（互等合谋）✓ 触发器（两次 write）✓ 修法精度（按连接粒度）✓——机制、触发器、修复三层闭合。',
      conclusion: '沉淀：两个各自正确的优化相遇会互等——Nagle 与 delayed ACK 是 TCP 的经典合谋。低延迟 RPC 的底线配置：TCP_NODELAY + 响应单次写出。',
    },
  ],

  lessons: [
    {
      text: '延迟指纹自证机制：精确的 40ms 整数倍不是"慢"，是"在等一个固定 tick 的定时器"——GC/排队/设备延迟都是无规律长尾。',
      principle: '验证思维：延迟分布的形状是排查的第一证据——整数倍指纹直指定时器互等（Nagle × delayed ACK 是经典）。先读指纹定性质，再逐包定位——"慢"的原因可以从分布形状读出来。',
    },
    {
      text: '两个各自正确的优化相遇会互等：Nagle（攒小包省开销）与 delayed ACK（攒 ACK 省包）单看都是好优化，相遇即 40ms 死锁。',
      principle: '全栈视野：系统性能问题常来自"默认配置的组合"，而非任何单一错误。低延迟 RPC 的底线：客户端 TCP_NODELAY；写端响应单次写出（两次 write 是给 Nagle 递刀）——升级时新增的"分段写出"就是这次的触发器。',
    },
    {
      text: '互等结构的修复不必一刀切：拆散双方任意一方即破局——按连接粒度精确处理，避免全局开关的吞吐代价。',
      principle: '程序设计：修复精度来自对机制结构的理解。四象限实验（关哪端都破局）既确认因果，也把修复从"全局关 Nagle"（包量 +30%）缩小到"RPC 连接 NODELAY + 批量场景保留"——实验的产出不止因果，还有代价最优的修法。',
    },
  ],
}
