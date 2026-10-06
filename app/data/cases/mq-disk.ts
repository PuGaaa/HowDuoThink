import { DiagnosisCase } from '../../types/case'

/**
 * 第 9 章 · 消息与异步 第四批（存储清理策略缺失 L2）
 * 教学点：沉淀思维——"设置 TTL"不等于"会删除"：标记与物理清理是两套机制；
 * 存储容量按"写入速率 × 保留期"算账；清理任务的执行健康度也要被监控。
 * 专家路径：impact(1) + retentioncfg(2) + volumetrend(1) = 4⚡︎
 */
export const mqDiskCase: DiagnosisCase = {
  id: 'mq-disk',
  title: 'TTL 设了三天，磁盘堆了三百 TB',
  intro: 'MQ 集群磁盘使用率 91% 告警：消息 TTL 明明是 3 天——过期删除机制，从来没跑过。',
  domain: 'runtime',
  layer: 'TTL 是标记，清理是执行——两个机制缺一不可',
  part: 'master',
  chapterId: 'messaging',
  order: 8,
  typeTags: ['messaging', 'resource', 'process'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」消息平台的运维负责人，91% 的磁盘告警让整个集群站在悬崖边。',
    architecture: 'MQ 集群(3 broker × 4TB SSD) → 全部业务 topic ｜ 消息策略：TTL 3 天（上线时配置）',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '集群状态',
        text: '磁盘使用率 91%（告警线 85%）且日均 +1.5%。\n连带：page cache 被挤占，写入吞吐从 200MB/s 掉到 130MB/s，生产端开始报限流。',
      },
      {
        type: 'text',
        title: '反直觉之处',
        text: '消息 TTL 3 天是上线第一天就配好的；\n按"3 天保留"算，磁盘占用应稳定在 ~20TB——实际堆了 300TB，且还在涨。',
      },
    ],
    timeline: '集群上线 14 个月 ｜ 磁盘线性增长全程无告警（85% 线是上个月才加的）｜ TTL 配置从未变更 ｜ 清理策略配置状态：从未有人看过',
    impactHint: 'TTL 是 3 天，堆积是 300TB——"过期"和"删除"之间，断了一环。哪一环？',
  },

  hypotheses: [
    { id: 'h-retention', text: '清理策略未启用：TTL 只给消息打标记，过期段（segment）的物理删除从未执行', excludeActionId: 'a-retentioncfg' },
    { id: 'h-volume', text: '业务流量大涨，写入速度超过了清理速度', excludeActionId: 'a-volumetrend' },
    { id: 'h-disk', text: '磁盘硬件劣化，写入变慢导致堆积（io 问题）', excludeActionId: 'a-diskhealth' },
    { id: 'h-other', text: '快照/备份等其他文件挤占磁盘，不是消息本身', excludeActionId: 'a-dirusage' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '给磁盘占用画一张来源画像',
      desc: '影响面：哪些 topic 占了多少、随时间怎么涨',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '磁盘占用画像',
        text: '按 topic 排序：\ndead-letter-test（无消费者的测试死信）：  88TB  ← 无 TTL 无清理\norder-events 主 topic：                   96TB  ← TTL 3 天，按理 ≤ 20TB\n积分/通知/归集…：合计 116TB\n增长曲线：14 个月线性增长 ~10TB/天 = 全量写入速率\n→ 全部都是"消息日志段"，没有异物；且增长速率 = 写入速率——像是一天都没删过。',
      },
    },
    {
      id: 'a-retentioncfg',
      name: '审计清理策略的真实状态',
      desc: 'TTL 与物理删除之间，配置了什么、执行了什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-retention'],
      hypotheses: [{ id: 'h-retention', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '清理链路审计',
        text: '① 消息级 TTL=3 天：已配置——但 TTL 只是"消费时跳过过期消息"的标记，不删文件\n② 段（segment）清理策略：retention.ms 未设置（默认无限）+ 删除任务未启用\n③ 清理任务执行记录：空——14 个月从未运行过一次\n实锤：TTL（标记）与 retention（物理删除）是两套机制——第一套配了，第二套连默认都没给。',
      },
    },
    {
      id: 'a-volumetrend',
      name: '核对写入流量的趋势',
      desc: '排除"流量涨了清不过来"',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-volume'],
      hypotheses: [{ id: 'h-volume', status: 'excluded' }],
      result: {
        type: 'text',
        title: '流量核对',
        text: '写入速率 14 个月平稳（±8%），无台阶式增长。\n增长的是"堆积"，不是"写入"——分母（清理）是零，不是"变小了"。\n→ 排除流量解释。',
      },
    },
    {
      id: 'a-dirusage',
      name: '核对目录级占用构成',
      desc: '排除其他文件挤占',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-other'],
      hypotheses: [{ id: 'h-other', status: 'excluded' }],
      result: {
        type: 'text',
        title: '目录核对',
        text: 'du 逐目录统计：日志段占 96%，备份/快照/系统文件合计 4%。\n→ 排除异物挤占：堆的就是消息本身。',
      },
    },
    {
      id: 'a-diskhealth',
      name: '核对磁盘健康与写入延迟',
      desc: '排除硬件劣化',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-disk'],
      hypotheses: [{ id: 'h-disk', status: 'excluded' }],
      result: {
        type: 'text',
        title: '磁盘核对',
        text: 'SMART 全绿、写入延迟 P99 3ms 正常。\n吞吐下降是 page cache 被挤占的"症状"，不是病因——磁盘没坏，只是满了。\n→ 排除硬件。',
      },
    },
    {
      id: 'a-riskmodel',
      name: '算清悬崖账：距打满还有几天',
      desc: '容量模型 + 最坏场景的决策依据',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '悬崖账',
        text: '当前 91%，日均 +1.5% → 6 天后 100%，broker 拒写\n最坏场景：死信堆积 + 大促写入高峰 → 可能提前到 4 天\n修复窗口约束：清理 88TB 测试死信需停写窗口（或限速删除）\n→ 悬崖账决定行动顺序：先删大头（test 死信）止血，再启用机制，再补监控。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急手动删除测试死信 88TB',
      desc: '【状态变更】停写窗口内人工清理无消费者 topic',
      cost: 2,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '手动清理结果',
        text: '双复核（topic 名单 × 双人确认）后清理 88TB，使用率 91% → 62%，集群脱离悬崖。\n风险记录：人工删除窗口内误删风险最高——两个 30 秒的"未过期段"靠双重确认拦下。\n→ 人肉清理是悬崖上的手术：能做一次，不能做制度。',
      },
    },
    {
      id: 'a-fixretention',
      name: '修复：分级保留策略落地',
      desc: '【状态变更】业务 topic 7 天 / 死信 30 天 / 测试 24h + 段大小规范化',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '策略落地',
        text: '① 分级 retention：按 topic 分级设置（业务 7d / 死信 30d / 测试 1d）\n② 段大小规范化：1GB 滚动（段是删除的最小单位，太大=删不动）\n③ 稳态验证：磁盘使用率稳定在 34%（写入速率 × 最长保留期 的理论值 ±5%）。',
      },
    },
    {
      id: 'a-fixquota',
      name: '沉淀：topic 配额与准入',
      desc: '【状态变更】新 topic 准入表：预期写入速率 × 保留期 = 预留空间；测试 topic 强制短 TTL',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '准入制度',
        text: '新 topic 创建必须填：预期写入速率、保留期、保留空间预算——三者乘法对不上集群余量不批。\n测试/临时 topic 默认 24h 保留 + 标注负责人——"被遗忘的 topic"从源头减少。',
      },
    },
    {
      id: 'a-fixmon',
      name: '沉淀：容量水位 + 清理健康度双监控',
      desc: '【状态变更】磁盘 75/85% 两级告警 + 清理任务执行成功率/最近执行时间监控',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控 v2',
        text: '① 水位告警：75% 预警 / 85% 告警（这次 85% 线是事后补的，等它生效）\n② 清理健康度：清理任务"最近成功执行时间"超过 24h 即告警——机制失联当天发现，而不是 14 个月。\n→ 机制本身也要被观测：负责删除的东西死了，比磁盘满更早值得知道。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-retention', text: '清理策略从未启用：TTL 只是"消费侧跳过过期消息"的标记，物理删除依赖的 segment retention 未配置且删除任务 14 个月未运行——全量写入持续堆积 300TB（page cache 被挤占致吞吐降 35%）', correct: true },
    { id: 'rc-volume', text: '业务流量大涨超过清理速度', correct: false },
    { id: 'rc-disk', text: '磁盘硬件劣化写入变慢导致堆积', correct: false },
    { id: 'rc-other', text: '快照/备份文件挤占磁盘空间', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: 'TTL 3 天 vs 堆积 300TB——先画磁盘占用画像：堆的是什么、按什么速率涨。',
      update: '全是消息日志段；增长速率 = 写入速率——"一天都没删过"的形状，清理嫌疑直接拉满。',
      actionId: 'a-impact',
      why: '1⚡︎ 占用画像同时回答"堆的什么"（排除异物）与"怎么涨的"（排除流量）——一张图把嫌疑空间压到一个机制。',
      conclusion: '嫌疑锁定：清理链路（h-retention 升权）。',
    },
    {
      thought: '审计清理链路：TTL、retention、删除任务三层各配了什么、执行了什么。',
      update: '实锤：TTL 有（标记）、retention 无（默认无限）、删除任务 14 个月零执行——标记与删除断链。',
      actionId: 'a-retentioncfg',
      why: '2⚡︎ 机制分层审计揭示认知盲区："配了 TTL 就会删"是普遍误解——TTL 与物理清理是两套机制，断链处正是"以为配过"的那层。配置审计要查到"执行记录"才算数。',
      conclusion: '根因实锤：清理从未执行。',
    },
    {
      thought: '流量趋势核对——"写入太多清不过来"是本类问题最常见的辩护，要用数据关掉它。',
      update: '写入 14 个月平稳：增长的是堆积不是写入——辩护不成立。',
      actionId: 'a-volumetrend',
      why: '1⚡︎ 排除"最常被提起的辩护"要优先：流量论一旦成立，修复就会滑向"扩容磁盘"——把"清理为零"的事实钉死，修复才不会买更多悬崖。',
      conclusion: '嫌疑收敛单点。',
    },
    {
      thought: '目录构成与磁盘健康各 1⚡︎ 排除——异物与硬件两个旁支清场；悬崖账定行动顺序。停止收集。',
      update: '日志段 96%、磁盘健康——清场完毕；6 天悬崖 → 先删大头止血、再启机制、再补监控。',
      actionId: 'a-dirusage',
      why: '1⚡︎ 悬崖账（剩余天数 vs 修复耗时）决定行动排序：机制建设再正确，也排在"先活下来"后面——止血、修复、防线的顺序由数字给出。',
      conclusion: '行动序列确定 → 三步走。',
    },
    {
      thought: '止血（手动清理 88TB）、修复（分级 retention）、制度（配额准入）、观测（水位+清理健康度）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（清理未启用）✓ 容量（乘法账）✓ 防线（双监控）✓——个案、制度、观测三层闭合，行动顺序由悬崖账给出。',
      conclusion: '沉淀：TTL 是标记，清理是执行——"配过"要查到执行记录才算数。存储容量 = 写入速率 × 保留期，这道乘法要在准入时算，而不是悬崖边。',
    },
  ],

  lessons: [
    {
      text: 'TTL 是标记，清理是执行："消费时跳过过期消息"与"物理删除释放磁盘"是两套机制——只配前者，堆积是必然。',
      principle: '沉淀思维：任何"配置了 X 就会 Y"的认知都要验到执行记录层——配置审计的终点是"任务最近成功执行时间"。清理机制自身要被监控（执行成功率/最近执行），负责删除的东西死了，比磁盘满更早值得知道。',
    },
    {
      text: '存储容量是一道乘法：写入速率 × 保留期 = 稳态占用——这道账要在 topic 准入时算，而不是悬崖边上算。',
      principle: '架构设计：准入表（预期写入 × 保留期 × 预留空间）让容量在创建时对齐；分级保留（业务/死信/测试不同 TTL）+ 段大小规范化让清理有可执行的粒度。没有准入的集群，每一个"临时 topic"都是未来的 88TB。',
    },
    {
      text: '悬崖账决定行动顺序：剩余天数与修复耗时的对比给出止血→修复→防线的排序——机制建设再正确，也排在活下来后面。',
      principle: '运维决策：容量危机的处理顺序由数字驱动：悬崖账（91%+1.5%/天 = 6 天）→ 止血选"减最大头"（88TB 死信）→ 修复选"机制落地" → 防线选"水位+健康度双监控"。顺序错了（先建机制），悬崖不等人。',
    },
  ],
}
