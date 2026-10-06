import { DiagnosisCase } from '../../types/case'

/**
 * 第 2 章 · 数据的脾气（慢查询 L2）
 * 教学点：EXPLAIN 是 SQL 排查的显影液；"全表扫描"与"索引失效"要靠表结构区分；
 * 数据增长不是根因，是放大器。
 * 专家路径：impact(1) + slowlog(1) + explain(2) + tablestruct(1) = 5⚡︎
 */
export const slowQueryCase: DiagnosisCase = {
  id: 'slow-query',
  title: '商品列表页越来越慢',
  intro: '运营反馈商品列表页从毫秒级变成 3~5 秒，而且还在持续恶化；商品详情页不受影响。',
  domain: 'data',
  layer: 'EXPLAIN 是 SQL 排查的显影液；数据增长不是根因，是放大器',
  part: 'engineer',
  chapterId: 'data',
  order: 3,
  typeTags: ['data', 'capacity', 'config'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」电商的商品服务后端，运营把一张慢页面截图甩进了值班群。',
    architecture: 'App → 商品服务 → MySQL(商品表 products，500 万行)',
    symptoms: [
      {
        type: 'error',
        title: '慢查询日志（摘录）',
        text: '# Query_time: 3.2  Lock_time: 0  Rows_sent: 20  Rows_examined: 4800000\nSELECT * FROM products\nWHERE category_id = 12 AND status = 1\nORDER BY created_at DESC LIMIT 20 OFFSET 0;',
      },
      {
        type: 'text',
        title: '业务影响',
        text: '列表页 P99 从 200ms 涨到 3.5s，还在缓慢恶化；\n商品详情页（按 ID 查单条）完全正常。',
      },
    ],
    timeline: '近两周逐渐恶化 ｜ 三周前上线"按最新排序"功能 ｜ 商品总量从 300 万涨到 500 万',
    impactHint: '只有一条 SQL 慢，还是整个库都慢？这两个答案通向完全不同的排查方向。',
  },

  hypotheses: [
    { id: 'h-index', text: '查询条件缺少匹配索引，每次都在全表扫描', excludeActionId: 'a-explain' },
    { id: 'h-volume', text: '商品数据量自然增长，查询变慢是必然的', excludeActionId: 'a-volumecmp' },
    { id: 'h-lock', text: '其他大事务锁表，读请求被阻塞', excludeActionId: 'a-lockcheck' },
    { id: 'h-hw', text: '数据库服务器资源不足（CPU/IO 打满）', excludeActionId: 'a-hostmetric' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定慢查询范围',
      desc: '是所有查询都慢，还是只有列表页这一条',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [{ id: 'h-hw', status: 'down' }],
      result: {
        type: 'text',
        title: '影响范围',
        text: '仅列表页这一条 SQL 慢；按 ID 查详情、类目聚合计数等其他查询全部正常。\n→ 不是数据库整体退化，是这条 SQL 自身的问题。',
      },
    },
    {
      id: 'a-slowlog',
      name: '读慢查询日志关键指标',
      desc: '看 Query_time 与 Rows_examined / Rows_sent 的比值',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'log',
        title: '慢查询日志',
        text: 'Query_time: 3.2  Rows_sent: 20  Rows_examined: 4800000\n→ 扫了 480 万行只返回 20 条，比值 24 万倍——全表扫描的指纹。',
      },
    },
    {
      id: 'a-explain',
      name: 'EXPLAIN 分析执行计划',
      desc: '看走了哪个索引、扫描行数、排序方式',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-index'],
      hypotheses: [{ id: 'h-index', status: 'up' }],
      result: {
        type: 'code',
        title: 'EXPLAIN 输出',
        text: 'type: ALL\nkey: NULL\nrows: 4800000\nExtra: Using where; Using filesort\n→ type=ALL 且 key=NULL：没有命中任何索引，\n还附带 filesort（排序也在内存外完成）。',
      },
    },
    {
      id: 'a-tablestruct',
      name: '查表结构与现有索引',
      desc: '确认是"索引不存在"还是"索引存在但失效"',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-index'],
      hypotheses: [{ id: 'h-index', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'SHOW INDEX FROM products',
        text: 'Key_name: PRIMARY(id), idx_title(title)\ncategory_id: INT，查询传入也是 INT（无隐式转换）\n→ 索引根本不存在，不是"存在但失效"。\n缺 (category_id, status, created_at) 复合索引。',
      },
    },
    {
      id: 'a-lockcheck',
      name: '查 InnoDB 锁等待',
      desc: '排除其他事务锁表阻塞',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-lock'],
      hypotheses: [{ id: 'h-lock', status: 'excluded' }],
      result: {
        type: 'text',
        title: '锁等待监控',
        text: '无任何锁等待记录；且 SELECT 在 RC 隔离级别下是无锁读（MVCC 快照读）。\n→ 不是被锁，是真的在一行行扫。',
      },
    },
    {
      id: 'a-hostmetric',
      name: '查数据库服务器资源水位',
      desc: 'CPU / 磁盘 IO / 内存是否有瓶颈',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-hw'],
      hypotheses: [{ id: 'h-hw', status: 'down' }],
      result: {
        type: 'text',
        title: '服务器水位',
        text: 'CPU 35%、磁盘 IO util 45%、内存无 swap。\n机器很闲——是这条 SQL 自己在空转，不是资源不够。',
      },
    },
    {
      id: 'a-volumecmp',
      name: '对比数据量增长曲线',
      desc: '数据涨了多少，慢化和涨速是否同步',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-volume'],
      hypotheses: [{ id: 'h-volume', status: 'down' }],
      result: {
        type: 'text',
        title: '增长曲线 vs 慢化曲线',
        text: '数据 300 万 → 500 万（三周），页面延迟 200ms → 3.5s。\n回看历史慢日志：300 万行时同样是 type=ALL，当时 80ms"还不算慢"。\n→ 增长只是放大器：问题一直存在，是数据量让它从可容忍变成灾难。',
      },
    },
    {
      id: 'a-cachehit',
      name: '查列表页缓存命中率',
      desc: '看是不是缓存失效导致打到 DB',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '缓存命中率',
        text: '列表页接口设计为每次实时查 DB（运营要求实时库存状态），根本不经过缓存。\n→ 缓存命中率 0% 是设计如此，与本次慢化无关。',
      },
    },
    {
      id: 'a-fixindex',
      name: '在线添加复合索引',
      desc: '【状态变更】低峰期为 products 添加 (category_id, status, created_at) 复合索引',
      cost: 6,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '低峰期 Online DDL 添加复合索引（500 万行约 4 分钟，期间控制 IO）。\nEXPLAIN 复查：type=ref, key=idx_cat_status_time, rows: 420。\n列表页 P99 回落到 180ms，filesort 消失。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-index', text: '查询条件 (category_id, status, created_at) 无匹配索引，500 万行全表扫描 + filesort', correct: true },
    { id: 'rc-volume', text: '商品数据量自然增长，查询变慢不可避免', correct: false },
    { id: 'rc-lock', text: '其他大事务锁表阻塞了读请求', correct: false },
    { id: 'rc-hw', text: '数据库服务器 CPU/IO 资源不足', correct: false },
  ],

  expertCost: 5,
  restartActionId: 'a-fixindex',

  expertChain: [
    {
      thought: '列表页慢但按 ID 查正常——先分岔：是这一条 SQL 的问题，还是整个库在退化。',
      update: '只有列表页这一条 SQL 慢 → 排除数据库整体问题，聚焦这条 SQL 自身。',
      actionId: 'a-impact',
      why: '1⚡︎ 圈范围决定排查方向：单条 SQL 慢看执行计划，全库慢才看服务器资源——顺序反了会白烧预算。',
      conclusion: '单条 SQL 慢 → 排查方向锁定这条 SQL 的执行方式。',
    },
    {
      thought: '慢查询日志里 Rows_examined/Rows_sent = 24 万倍，先确认扫描效率。',
      update: '扫 480 万行返回 20 条——全表扫描的指纹，接下来看执行计划证实。',
      actionId: 'a-slowlog',
      why: '1⚡︎ 扫描行数与返回行数的比值是慢查询第一指纹，一条日志就能判断"扫多了"，成本极低。',
      conclusion: '全表扫描方向确认 → 用 EXPLAIN 看完整执行计划。',
    },
    {
      thought: 'EXPLAIN 是显影液：走没走索引、扫多少行、排序怎么做的，一次全暴露。',
      update: 'type=ALL + key=NULL + filesort → 三指纹齐全，但 key=NULL 有两种可能：索引不存在，或索引存在却失效（隐式转换/函数包裹）。',
      actionId: 'a-explain',
      why: '2⚡︎ EXPLAIN 一次执行同时暴露索引命中、扫描行数、排序方式，是 SQL 排查里信息密度最高的单个动作。',
      conclusion: '没走任何索引 + filesort → 还需区分"没有索引"还是"索引失效"。',
    },
    {
      thought: '查表结构和现有索引：如果索引存在，要查类型转换和函数包裹；如果不存在，就是建索引的事。',
      update: '现有索引只有主键和 title；category_id 是 INT、传入也是 INT，无隐式转换——索引根本不存在。',
      actionId: 'a-tablestruct',
      why: '1⚡︎ "不存在"与"失效"的修法完全不同（建新索引 vs 改写 SQL），表结构一查就定，避免修复方向走错。',
      conclusion: '索引不存在实锤 → 修复方案：新建 (category_id, status, created_at) 复合索引。',
    },
    {
      thought: '证据闭合：全表扫描（EXPLAIN）+ 索引不存在（表结构）+ 数据增长只是放大器（历史对比）。停止收集。',
      update: '停止。修复：低峰期 Online DDL 加复合索引，等值列在前、排序列在后。',
      actionId: '',
      why: '根因与修复方案都已明确；继续查锁、查服务器都是已排除的方向，不再产生新信息。',
      conclusion: '加索引后 P99 回落 180ms。检查单：新 SQL 上线前必须 EXPLAIN，数据量翻倍前复查慢查询。',
    },
  ],

  lessons: [
    {
      text: 'Rows_examined / Rows_sent 的比值是慢查询第一指纹：比值越大越缺索引。',
      principle: '扫描行数与返回行数的比值直接反映索引效率——比值接近 1 是理想状态，比值上万则几乎必然在逐行扫描。读慢日志先看这两个数，比看执行时间更能定位问题。',
    },
    {
      text: 'EXPLAIN 是 SQL 排查的显影液：type=ALL + key=NULL + Using filesort 三指纹同时出现必须处理。',
      principle: 'EXPLAIN 一次执行同时暴露索引命中（type/key）、预估扫描行数（rows）、排序方式（Extra）——单个动作的信息密度最高，是 SQL 排查的标配第二步。',
    },
    {
      text: 'key=NULL 有两种可能：索引不存在，或索引存在但失效（隐式转换/函数包裹/前导通配）——表结构一查就定。',
      principle: '不存在的索引用"建"来修，失效的索引用"改写 SQL"来修，方向完全不同。EXPLAIN 之后必须查 SHOW INDEX 与字段类型，才能确定修复动作。',
    },
    {
      text: '数据增长不是根因，是放大器：300 万行时就存在的全表扫描，拖到 500 万行才爆发。',
      principle: '全表扫描在数据少时"还不算慢"不等于没问题——它只是还没到爆发的量级。新 SQL 上线前必须 EXPLAIN，并在容量规划里预留扫描行数的增长预算。',
    },
  ],
}
