import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 读懂报错 第二批（Caused by 异常链阅读 L2）
 * 教学点：假设思维——异常链从上往下读：最上层是症状，最底层的 Caused by 才是根因；
 * 按表层异常修（加重试）是安慰剂；池水位监控让"耗尽"提前可见。
 * 专家路径：impact(1) + chaindeep(2) + poolmetrics(1) = 4⚡︎
 */
export const causedByCase: DiagnosisCase = {
  id: 'caused-by',
  title: 'Connection reset 只是最后一根稻草',
  intro: '报表导出偶发失败，异常写着 Connection reset——按表层原因加重试无效：真凶在 Caused by 链的最深处。',
  domain: 'runtime',
  layer: '异常链从上往下读——最上层是症状，最底层的 Caused by 才是根因',
  part: 'apprentice',
  chapterId: 'error-reading',
  order: 2,
  typeTags: ['resource', 'capacity'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」报表服务的新任负责人，前任留下一句"偶发失败，加了重试就行"的交接语。',
    architecture: '报表导出服务 → 数据库连接池(20 连接) → MySQL ｜ 高峰时段: 月结批量导出并发 30+',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '失败日志（表层异常）',
        text: 'java.net.SocketException: Connection reset\n  at java.base/java.net.SocketInputStream.read(…)\n  at com.xj.report.ExportDao.queryBigReport(ExportDao.java:140)\n前任的修复：这一层加重试 3 次——失败率从 2% 降到 1.8%，约等于没用。',
      },
      {
        type: 'text',
        title: '完整堆栈（这次学乖了，翻到底）',
        text: 'Caused by: java.net.SocketTimeoutException: Read timed out\nCaused by: com.mysql.cj.exceptions.CJCommunicationsException …\nCaused by: java.sql.SQLTransientConnectionException: HikariPool-1 -\n  Connection is not available, request timed out after 30000ms ← 最底层！',
      },
    ],
    timeline: '失败集中在月结周（批量导出并发 30+）｜ 重试"修复"已存在三个月 ｜ 失败率 1.8% 雷打不动',
    impactHint: '表层写"网络断了"，最底层写"等连接等了 30 秒"——两个故事，信哪一个？',
  },

  hypotheses: [
    { id: 'h-pool', text: '连接池耗尽：请求等连接 30s 超时，被底层包装成 Connection reset——Caused by 最深处才是根因', excludeActionId: 'a-chaindeep' },
    { id: 'h-surface', text: '表层就是真相：网络抖动导致 reset，重试是对的方向（加强版）', excludeActionId: 'a-chainread' },
    { id: 'h-remote', text: '对端 MySQL 真的在重启/抖动，连接被远端重置', excludeActionId: 'a-remoteuptime' },
    { id: 'h-size', text: '大报表数据量触发链路限制，传输被掐断', excludeActionId: 'a-sizecheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '核对失败与重试的关系',
      desc: '影响面：重试三个月为什么无效——失败 shape 复核',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '重试无效性分析',
        text: '失败分布：100% 集中在月结周高峰（并发 30+）；\n重试后再失败率：仍 60%——重试等 30s 还是等不到连接。\n如果真是网络抖动：重试成功率应接近 100%（抖动是瞬时的）。\n→ "重试无效"本身就是证据：问题不是瞬时的，是"资源持续不够"。',
      },
    },
    {
      id: 'a-chainread',
      name: '把表层异常当根因的代价',
      desc: '验证"网络抖动"叙事：它解释不了什么',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-surface'],
      hypotheses: [{ id: 'h-surface', status: 'excluded' }],
      result: {
        type: 'text',
        title: '表层叙事的反驳',
        text: 'Connection reset 的表层解读：网络断了。\n反驳三连：①同机其他连接正常（不是网络断）②失败 100% 集中高峰（不是随机抖动）③重试无效（不是瞬时故障）。\n→ 排除表层叙事：异常的最上层只是"最后的死法"，死因在链条更深处。',
      },
    },
    {
      id: 'a-chaindeep',
      name: '读完整 Caused by 链：最底层见根因',
      desc: '异常链从上往下读——每一层都是上一层的"为什么"',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-pool'],
      hypotheses: [{ id: 'h-pool', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '异常链全文（从上往下读）',
        text: 'L1 SocketException: Connection reset            ← 症状：读响应时连接被重置\nCaused by L2 SocketTimeoutException: Read timed out ← 为什么 reset：等响应超时\nCaused by L3 SQLTransientConnectionException:      ← 为什么超时：等连接等了 30s\n   HikariPool-1 - Connection is not available,\n   request timed out after 30000ms\n→ 因果链完整：池耗尽 → 等连接 30s → 读超时 → reset。\n最底层是"因"，最上层是"果"——按最上层修 = 治疗症状。',
      },
    },
    {
      id: 'a-poolmetrics',
      name: '核对连接池监控',
      desc: '高峰时池的真实水位与等待队列',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '池水位证据',
        text: '月结高峰：活跃连接 20/20（满）、等待线程峰值 34、平均等待 12s（超 30s 即失败）\n慢查询陪伴：单报表查询 8~15s（大结果集）——20 连接 × 10s 级占用 = 吞吐天花板极低\n→ 证据与异常链互相印证：池太小 × 查询太慢 = 高峰必耗尽。',
      },
    },
    {
      id: 'a-remoteuptime',
      name: '核对 MySQL 的重启与存活',
      desc: '排除对端真挂',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-remote'],
      hypotheses: [{ id: 'h-remote', status: 'excluded' }],
      result: {
        type: 'text',
        title: '对端核对',
        text: 'MySQL 90 天零重启；失败时刻连接其他库正常。\n→ 排除对端。',
      },
    },
    {
      id: 'a-sizecheck',
      name: '核对报表数据量与链路限制',
      desc: '排除数据量触发限制',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-size'],
      hypotheses: [{ id: 'h-size', status: 'excluded' }],
      result: {
        type: 'text',
        title: '数据量核对',
        text: '失败样本里也有小报表（几 MB）——数据量与失败无强相关；\n强相关的是"并发数"（高峰 30+）。\n→ 排除数据量：凶手是并发等待，不是单包大小。',
      },
    },
    {
      id: 'a-danger',
      name: '前任方案加强版：重试 3 次改 5 次',
      desc: '【状态变更】加重重试次数与间隔',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重试加强结果（陷阱动作）',
        text: '失败率 1.8% → 1.7%（重试的线程继续占着池的等待队列，反而加剧竞争）。\n→ 复盘点评：往症状上加重药，病没好，药副作用先来了——按表层修 = 安慰剂，还可能有毒。',
      },
    },
    {
      id: 'a-fixpool',
      name: '修复：池参数 + 慢查询治理',
      desc: '【状态变更】池 20→40（对齐并发峰值）、连接回收 30s→5min、大报表改流式分页',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 池 20 → 40（对齐月结并发峰值 30+ 留余量）\n② 大报表查询改流式+分页（单连接占用 10s → 2s）\n③ 重试保留但降为 2 次（作为兜底而非主策略）\n月结周回归：失败率 1.8% → 0%，高峰等待队列峰值 4。',
      },
    },
    {
      id: 'a-fixchain',
      name: '沉淀：异常链阅读规范',
      desc: '【状态变更】规范：读异常先翻到最底 Caused by；"表层加重试"前必须完成归因',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '规范条目',
        text: '① 异常链从上往下读：最上层是症状，最底层 Caused by 才是根因\n② 任何"加急重试"的处置必须先回答"失败的机制是什么"\n③ code review 检查项：catch 里只打最上层异常（丢链）视为缺陷——丢 Caused by = 丢证据。',
      },
    },
    {
      id: 'a-fixmon',
      name: '沉淀：池水位告警',
      desc: '【状态变更】活跃连接 ≥ 80% 或等待线程 > 0 告警——耗尽提前 30 秒可见',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控 v2',
        text: '池水位三级：活跃 ≥ 80% 预警 / 等待线程 > 0 告警 / 拒绝发生 P1。\n下次池要耗尽时，告警比异常早 30 秒——从"事后读链"进化到"事中拦截"。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-pool', text: '连接池耗尽（20 连接 × 月结并发 30+ × 单查询 10s 级）：请求等连接 30s 超时，被底层包装为 Connection reset——表层加重试三个月无效，Caused by 最底层才是根因', correct: true },
    { id: 'rc-surface', text: '网络抖动导致 reset，重试方向正确（表层叙事）', correct: false },
    { id: 'rc-remote', text: '对端 MySQL 重启/抖动重置连接', correct: false },
    { id: 'rc-size', text: '大报表数据量触发链路限制', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '重试三个月无效——"无效"本身就是证据：先核对失败分布与重试成功率的关系。',
      update: '失败集中月结高峰、重试后再失败 60%——不是瞬时故障，是"资源持续不够"。',
      actionId: 'a-impact',
      why: '1⚡︎ 历史修复的无效性是最便宜的证据：它反向排除了整个"瞬时故障"假设族——前任的三个月不是白干，是给你排除了一个方向。',
      conclusion: '表层叙事动摇 → 证据链往深处挖。',
    },
    {
      thought: '表层叙事单独反驳——Connection reset ≠ 网络断：三连反驳（同机其他连接正常/高峰集中/重试无效）。',
      update: '排除表层：reset 只是"最后的死法"。转入异常链深读。',
      actionId: 'a-chainread',
      why: '1⚡︎ 排除最流行的误读要显式做：表层异常太有迷惑性，"网络断了加重试"几乎是条件反射——三连反驳把它关进笼子。',
      conclusion: '表层清场 → 异常链深读。',
    },
    {
      thought: '读完整 Caused by 链——从上往下，每一层都是上一层的"为什么"，最底层才是根因。',
      update: '实锤：reset ← 读超时 ← 等连接 30s ← 池耗尽。因果链四层完整。',
      actionId: 'a-chaindeep',
      why: '2⚡︎ 异常链阅读是本关的教学核心：异常的包装是"洋葱"——外层是死法，内层是死因；按最外层修就是安慰剂。池耗尽藏在链底，只有翻到底的人才能看见。',
      conclusion: '根因实锤 → 用池监控互相印证。',
    },
    {
      thought: '池水位证据与异常链互相印证——两条独立证据链指向同一结论时，因果才可信。',
      update: '活跃 20/20 + 等待 34 线程 + 单查询 10s 级——耗尽机制完全闭合，修复参数也由此得出（池 40/占用 2s）。',
      actionId: 'a-poolmetrics',
      why: '1⚡︎ 双证据链原则：异常链（软件视角）与池监控（资源视角）独立指向同一根因——交叉验证让修复方案一次到位，修复参数直接从证据里读出。',
      conclusion: '因果闭环 → 修复 + 规范 + 监控。',
    },
    {
      thought: '排除对端与数据量、止血陷阱点评、修复三层落地。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】根因（池耗尽）✓ 链条（四层因果）✓ 防线（规范+水位监控）✓——机制、证据、防线三层闭合。',
      conclusion: '沉淀：异常链从上往下读，最底层的 Caused by 才是根因——按最上层修，是给症状发糖。',
    },
  ],

  lessons: [
    {
      text: '异常链从上往下读：最上层是"死法"，最底层的 Caused by 才是"死因"——Connection reset 的背后可以藏着池耗尽。',
      principle: '假设思维：读异常必须翻到 Caused by 链最底层。包装型异常（框架/驱动层层转译）让表层叙事偏离根因好几层——"读到第一层就动手"是新人最贵的习惯。code review 同理：catch 里丢 Caused by 链 = 丢证据。',
    },
    {
      text: '"修复无效"是免费的排除证据：重试三个月失败率不动，说明问题不是瞬时的——历史修复的无效性反证故障类别。',
      principle: '假设思维：接手遗留问题时，先审"已有的修复为什么没用"。瞬时故障重试必有效；持续资源不足重试必无效——重试的无效性把假设空间从"抖动类"整体切到"容量类"。',
    },
    {
      text: '往症状上加重药，副作用可能先到：重试 3 改 5 让更多线程挤进等待队列——治标方案要做副作用推演。',
      principle: '程序设计：任何"缓解类"措施（重试/限流/超时加长）都要推演它对瓶颈资源的二次影响。本例的重试线程本身在占用等待位——缓解措施加剧竞争，是容量问题特有的反直觉。',
    },
  ],
}
