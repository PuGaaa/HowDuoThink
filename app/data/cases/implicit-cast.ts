import { DiagnosisCase } from '../../types/case'

/**
 * 第 3 章 · 数据的脾气 第三批（隐式类型转换索引失效 L2）
 * 教学点：程序设计——隐式类型转换让"看起来会用索引"的 SQL 全表扫描；
 * EXPLAIN 断言进上线门禁；"隐式转换三坑"（类型/字符集/排序规则）是索引杀手清单。
 * 专家路径：impact(1) + explain(2) + analyize(1) = 4⚡︎
 */
export const implicitCastCase: DiagnosisCase = {
  id: 'implicit-cast',
  title: '一条数字字面量，让百万行索引作废',
  intro: '客服查询接口上线后主库 CPU 翻倍：一条 SQL 用数字查 VARCHAR 手机号——隐式转换让索引整个作废。',
  domain: 'data',
  layer: '索引是为"类型一致"建的——一次隐式转换就够它作废',
  part: 'engineer',
  chapterId: 'data',
  order: 9,
  typeTags: ['data', 'resource', 'verification'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」会员平台的 DBA 兼后端，新接口上线 2 小时后主库 CPU 翻倍的告警落在你头上。',
    architecture: '客服后台 → 会员查询服务 → MySQL 会员表(3200 万行, phone VARCHAR(20), 索引 idx_phone)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '慢查询与 CPU',
        text: 'EXPLAIN：SELECT ... WHERE phone = 13800001234 → type=ALL（全表扫描），rows=32,000,000\n主库 CPU：35% → 155%，与该接口调用量线性同步爬升。',
      },
      {
        type: 'text',
        title: '困惑点',
        text: 'idx_phone 索引明明存在；代码 review 没发现问题；\n同样的表结构，去年上线的"邮箱查询"接口（email VARCHAR + 字符串参数）一直是 2ms 的快查询。',
      },
    ],
    timeline: '查询接口今天上午上线 ｜ CPU 告警 2 小时后触发 ｜ MySQL 5.7（隐式转换规则：字符串列与数字比较时，列值转数字逐行计算）',
    impactHint: '同表同结构的两个查询一快一慢——对比它们的差异，索引"看不看得上"这次查询？',
  },

  hypotheses: [
    { id: 'h-cast', text: '隐式类型转换：数字字面量 vs VARCHAR 列，MySQL 将列值逐行转数字——索引失效全表扫描', excludeActionId: 'a-explain' },
    { id: 'h-stat', text: '统计信息过期，优化器选错执行计划', excludeActionId: 'a-analyze' },
    { id: 'h-lock', text: '查询引发锁等待，连接堆积放大 CPU', excludeActionId: 'a-lockcheck' },
    { id: 'h-cache', text: '查询无缓存层，重复全表扫描叠加（纯容量问题）', excludeActionId: 'a-cachecheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '对比快慢两个查询的 SQL',
      desc: '影响面：同表同索引，差异在哪个字符',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '快慢对照',
        text: '慢（4.2s/次）：WHERE phone = 13800001234      ← 数字字面量\n快（2ms/次）：  WHERE email = "user@example.com" ← 字符串字面量\n同表、同类 VARCHAR 列、同类索引——唯一差异：比较值的"类型"。\n→ 索引没坏，是它"认不出"这个查询。',
      },
    },
    {
      id: 'a-explain',
      name: 'EXPLAIN 对比 + 转换规则验证',
      desc: '两条 SQL 的执行计划与类型转换行为',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cast'],
      hypotheses: [{ id: 'h-cast', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '执行计划对照 + 机制验证',
        text: '慢查询：type=ALL, rows=32M —— 全表扫描\n快查询：type=ref, rows=1  —— 索引命中\nMySQL 规则：字符串列与数字比较 → 把"列"转成数字逐行算（ CAST(phone AS DOUBLE) ）\n→ 列被函数包裹，索引存储的是字符串序，无法服务数字比较 → idx_phone 作废。\n复现修复：WHERE phone = "13800001234"（字符串）→ type=ref, rows=1，2ms。\n实锤：一行代码的类型差异 = 2000 倍的性能差。',
      },
    },
    {
      id: 'a-analyze',
      name: '核对统计信息与强制索引实验',
      desc: '排除优化器选错计划',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-stat'],
      hypotheses: [{ id: 'h-stat', status: 'excluded' }],
      result: {
        type: 'text',
        title: '优化器核对',
        text: 'ANALYZE TABLE 刚跑过；FORCE INDEX(idx_phone) 强制走索引——依然慢（转换在列上，索引帮不上）。\n→ 排除优化器：不是"不想用索引"，是"用不了"。',
      },
    },
    {
      id: 'a-lockcheck',
      name: '核对锁等待',
      desc: '排除锁放大',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-lock'],
      hypotheses: [{ id: 'h-lock', status: 'excluded' }],
      result: {
        type: 'text',
        title: '锁核对',
        text: 'data_locks 无等待；慢查询是只读 SELECT 不持锁。\n→ 排除锁问题：CPU 是纯扫描消耗。',
      },
    },
    {
      id: 'a-cachecheck',
      name: '评估缓存层缺口',
      desc: '评估"加缓存"是不是正解',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'down' }],
      result: {
        type: 'text',
        title: '缓存评估',
        text: '查询确实无缓存，加缓存能挡住重复查询。\n→ 降权为次因：但每一条首次查询仍要 4.2s 全表扫——"每笔都慢"的根因必须修 SQL，缓存只是止痛片。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急对该接口限流到 10 QPS',
      desc: '【状态变更】网关对新接口限流，保住主库',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '限流结果',
        text: 'CPU 回落至 60%，其他业务恢复。\n代价：客服查询排队 30s+，一线效率腰斩——限流是"减少伤害"不是"消除伤害"。',
      },
    },
    {
      id: 'a-fixparam',
      name: '修复：参数类型修正 + 全仓同类扫描',
      desc: '【状态变更】phone 参数改 String 传递；扫描同类"字符串列 vs 数字比较"模式',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 修复参数类型：phone 以 String 绑定 → 2ms\n② 全仓扫描：找出 4 处同类隐患（orderNo/userId 外部入参直接拼数字比较），逐个修正\n③ 回归 EXPLAIN：全部 type=ref。',
      },
    },
    {
      id: 'a-fixgate',
      name: '沉淀：SQL 上线 EXPLAIN 门禁',
      desc: '【状态变更】新 SQL 上线前自动 EXPLAIN 断言：type ≠ ALL 且 rows < 10 万',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '门禁上线',
        text: 'SQL 审核流水线：解析上线 SQL → EXPLAIN → 断言执行计划。\n这次的事故若有门禁，会在合并前 10 分钟被拦下——而不是上线 2 小时后由 CPU 告警揭发。',
      },
    },
    {
      id: 'a-fixmon',
      name: '沉淀：全表扫描实时告警',
      desc: '【状态变更】慢查询日志流式分析：rows > 10 万的全表扫描/分钟 告警',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '告警上线',
        text: '全表扫描速率告警（阈值：> 5 次/分钟）——\n下次任何一个新接口拖出全表扫描，5 分钟内有人知道，而不是 2 小时。',
      },
    },
    {
      id: 'a-fixedu',
      name: '沉淀："隐式转换三坑"进研发规范',
      desc: '【状态变更】字符串列 vs 数字、字符集不一致、COLLATION 不同——三个索引杀手清单化',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '规范条目',
        text: '索引失效三坑：① 类型不一致（本例）② 关联列字符集不一致 ③ COLLATION 不同。\n规范：外部入参以数据库列类型为准绑定；join 两列的类型/字符集/排序规则必须一致——写进 code review 检查单。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-cast', text: 'phone VARCHAR(20) 列与数字字面量比较：MySQL 将列值逐行 CAST 成数字，idx_phone 无法服务——每查询全表扫描 3200 万行（4.2s），CPU 随调用量线性爆涨', correct: true },
    { id: 'rc-stat', text: '统计信息过期导致优化器选错执行计划', correct: false },
    { id: 'rc-lock', text: '锁等待导致连接堆积放大 CPU', correct: false },
    { id: 'rc-cache', text: '查询无缓存导致重复扫描叠加（次因）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '同表同索引一快一慢——先对比两条 SQL 本身：差异往往小到一个字符。',
      update: '唯一差异：比较值的类型（数字 vs 字符串）——"索引认不认"的第一嫌疑出现。',
      actionId: 'a-impact',
      why: '1⚡︎ 快慢对照是最便宜的二分法：环境相同、结构相同、索引相同，剩下的变量就是"类型"——程序设计思维在数据层的用武之地。',
      conclusion: '嫌疑锁定：隐式类型转换（h-cast 升权）。',
    },
    {
      thought: 'EXPLAIN 对比 + 转换规则验证：把"猜测"升级为"执行计划证据 + 数据库规则引用"。',
      update: '实锤：列被 CAST 包裹索引作废；字符串参数立刻 type=ref rows=1——一行类型 2000 倍差距。',
      actionId: 'a-explain',
      why: '2⚡︎ EXPLAIN 是 SQL 排查的显微镜：它给出的不是"可能慢"，而是"计划怎么走的"；配合类型转换规则的引用，修复从"试试看"变成"确定性的一行改动"。',
      conclusion: '根因实锤 → 排除优化器与锁。',
    },
    {
      thought: '统计信息假设要专门排除——"优化器选错计划"是最常被提起的解释，不关掉它修复就会跑偏成 ANALYZE。',
      update: '强制索引依然慢：转换在列上，任何索引都帮不上——优化器清白。',
      actionId: 'a-analyze',
      why: '1⚡︎ FORCE INDEX 实验一举两得：排除优化器假设 + 证明"这不是计划问题而是可用性问题"——修复方向从"调优"转到"改代码"。',
      conclusion: '嫌疑收敛单点。',
    },
    {
      thought: '锁与缓存各留一笔：锁清白；缓存缺口降权为次因——止痛片不能替代手术。',
      update: '锁排除；缓存降权——"每笔都慢"的根因必须修 SQL 本身。',
      actionId: 'a-cachecheck',
      why: '1⚡︎ "加个缓存"是性能问题的万能诱惑：它改变症状的频率但不改变单次的荒谬——根因分层（每笔慢 vs 重复慢）决定修复的先后。',
      conclusion: '修复清单：参数修正 + 同类扫描 + 门禁。',
    },
    {
      thought: '止血（限流）、修复（类型+全仓扫描）、门禁（EXPLAIN 断言）、观测（全表扫描告警）、规范（三坑清单）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（列被 CAST）✓ 同类面（4 处隐患）✓ 防线（门禁+告警）✓——个案、家族、防线三层闭合。',
      conclusion: '沉淀：索引是为类型一致建的——一次隐式转换就够它作废。SQL 的性能问题先看执行计划，再看类型与字符集，最后才谈加缓存。',
    },
  ],

  lessons: [
    {
      text: '索引是为"类型一致"建的：字符串列与数字比较时，列被逐行 CAST，索引整个作废——一行代码 2000 倍性能差。',
      principle: '程序设计：隐式转换三坑进 review 清单——类型不一致（字符串列 vs 数字）、关联列字符集不一致、COLLATION 不同。外部入参以数据库列类型为准绑定；"看起来会走索引"永远要用 EXPLAIN 验证。',
    },
    {
      text: 'SQL 上线要有执行计划门禁：EXPLAIN 断言（type ≠ ALL、rows < 阈值）在合并前拦住，而不是上线后由 CPU 告警揭发。',
      principle: '验证思维：SQL 的正确性靠测试，性能靠执行计划——两者都该是合并门禁。慢查询的发现时点决定它的代价：合并前 10 分钟 vs 上线 2 小时，差的是一套自动化断言。',
    },
    {
      text: '快慢对照是最便宜的二分法：同表同索引的两个查询，差异小到一个字符——把变量缩小到不能再小，根因自己现形。',
      principle: '假设思维：性能排查先找"天然对照组"（同类接口/同结构查询），差异即嫌疑。对照组的存在让"猜测"变成"对照实验"——尤其当直觉（索引存在所以快）与事实（全表扫描）相悖时。',
    },
  ],
}
