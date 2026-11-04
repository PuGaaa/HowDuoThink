import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const slowQueryCase: DiagnosisCase = {
  id: 'slow-query',
  title: '商品列表页越来越慢',
  intro: '运营反馈商品列表页从毫秒级变成 3~5 秒，而且还在持续恶化；商品详情页不受影响。',
  domain: 'data',
  layer: 'EXPLAIN 是 SQL 排查的显影液；数据增长不是根因，是放大器',
  part: 'engineer',
  chapterId: 'data',
  order: 3,
  typeTags: [
    'data',
    'capacity',
    'config',
  ],
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
    {
      id: 'h-index',
      text: '查询条件缺少匹配索引，每次都在全表扫描',
      excludeActionId: 'a-explain',
    },
    {
      id: 'h-volume',
      text: '商品数据量自然增长，查询变慢是必然的',
      excludeActionId: 'a-volumecmp',
    },
    {
      id: 'h-lock',
      text: '其他大事务锁表，读请求被阻塞',
      excludeActionId: 'a-lockcheck',
    },
    {
      id: 'h-hw',
      text: '数据库服务器资源不足（CPU/IO 打满）',
      excludeActionId: 'a-hostmetric',
    },
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
      hypotheses: [
        {
          id: 'h-hw',
          status: 'down',
        },
      ],
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
        text: 'Rows_examined4800000/Rows_sent20=240000，说明访问很多行才返回少量结果。这个比例本身不能证明无索引（低选择性索引也可能扫描多），需结合EXPLAIN与索引定义。',
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
      tests: [
        'h-index',
      ],
      hypotheses: [
        {
          id: 'h-index',
          status: 'up',
        },
      ],
      result: {
        type: 'code',
        title: 'EXPLAIN 输出',
        text: 'type=ALL，key=NULL，估算rows=4800000，Extra=Using where; Using filesort。\n本计划采用全表访问和额外排序。filesort表示不能直接由索引满足顺序，可能在内存完成，也可能用临时磁盘文件，不能仅凭这个词断言落盘。',
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
      tests: [
        'h-index',
        'h-volume',
      ],
      hypotheses: [
        {
          id: 'h-index',
          status: 'confirmed',
        },
        {
          id: 'h-volume',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: 'SHOW INDEX FROM products',
        text: '现有索引PRIMARY(id)、idx_title(title)，缺(category_id,status,created_at)；字段与参数均INT。\n同一500万行同构副本、相同负载，仅增加匹配索引后查询不再全表访问，整体P99由3.5s降至180ms。增长放大扫描代价，但慢并非数据增长不可避免。',
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
      tests: [
        'h-lock',
      ],
      hypotheses: [
        {
          id: 'h-lock',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '锁等待监控',
        text: '同窗performance_schema无该查询的行锁或元数据锁等待，慢日志Lock_time为0；该普通SELECT使用RC一致性读。本案证据不支持锁阻塞，MVCC也不意味着任何情况下都不等元数据锁。',
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
      tests: [
        'h-hw',
      ],
      hypotheses: [
        {
          id: 'h-hw',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '服务器水位',
        text: '同窗CPU35%、磁盘util45%、无swap；独立点查延迟稳定，增加索引的同负载对照消除该查询慢化。排除整体CPU/IO饱和是主因，但单独一个平均利用率不足以排除资源问题。',
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
      tests: [
        'h-volume',
      ],
      hypotheses: [
        {
          id: 'h-volume',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '增长曲线 vs 慢化曲线',
        text: '数据300万→500万，新增排序查询后扫描代价被放大；在相同500万行副本只增加索引即可降延迟，反证“增长必然只能变慢”。不再用300万行80ms与500万行3.5s假装只有行数变化。',
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
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '经评审在低峰增加复合索引并观察锁、IO与回退条件；Online DDL也可能短暂等待元数据锁，不能承诺无阻塞或固定4分钟。\n本题同构对照P99为180ms，不代表所有500万行表的保证。新增索引还需评估写放大、空间和现有索引冗余。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-index',
      text: '查询条件 (category_id, status, created_at) 无匹配索引，500 万行全表扫描 + filesort',
      correct: true,
    },
    {
      id: 'rc-volume',
      text: '商品数据量自然增长，查询变慢不可避免',
      correct: false,
    },
    {
      id: 'rc-lock',
      text: '其他大事务锁表阻塞了读请求',
      correct: false,
    },
    {
      id: 'rc-hw',
      text: '数据库服务器 CPU/IO 资源不足',
      correct: false,
    },
  ],
  expertCost: 6,
  restartActionId: 'a-fixindex',
  expertChain: [
    {
      thought: '区分单查询和全库。',
      update: '列表慢，独立点查正常。',
      actionId: 'a-impact',
      why: '1⚡范围帮助排序假设，不能直接宣布资源候选排除。',
      conclusion: '核对计划。',
    },
    {
      thought: '阅读访问方式和排序。',
      update: 'ALL、keyNULL与额外排序。',
      actionId: 'a-explain',
      why: '2⚡计划定位访问路径，不把filesort误读成必然落盘。',
      conclusion: '缺匹配索引成为主候选。',
    },
    {
      thought: '核对索引并做同数据对照。',
      update: '缺匹配索引；仅加索引使同数据延迟下降。',
      actionId: 'a-tablestruct',
      why: '1⚡已有诊断材料与同构对照证明可优化，反证增长必然。',
      conclusion: '确认索引，排除增长不可避免。',
    },
    {
      thought: '核对实际锁等待。',
      update: '行锁和元数据锁等待均无。',
      actionId: 'a-lockcheck',
      why: '1⚡MVCC不是无条件免锁，实际等待证据才是反证。',
      conclusion: '排除锁等待。',
    },
    {
      thought: '核对同窗资源与独立点查。',
      update: '整体资源未饱和，点查稳定。',
      actionId: 'a-hostmetric',
      why: '1⚡资源与对照证据联合支持排除整体资源故障。',
      conclusion: '其余候选排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】匹配索引缺失及同数据优化对照成立，增长必然、锁和整体资源解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '查询条件 (category_id, status, created_at) 无匹配索引，500 万行全表扫描 + filesort',
    },
  ],
  lessons: [
    {
      text: '扫描/返回比240000说明访问放大，不能单独证明缺索引；聚合、低选择性与排序也会提高这个比值。',
      principle: '结合实际SQL、EXPLAIN及SHOW INDEX判断。EXPLAIN的rows是估算，慢日志Rows_examined是执行统计，不能把两者当同一精确计数。',
    },
    {
      text: 'EXPLAIN 是 SQL 排查的显影液：type=ALL + key=NULL + Using filesort 三指纹同时出现必须处理。',
      principle: 'Using filesort不代表必然磁盘排序；ALL也不是任何小表都必须整改。本题500万行且超出业务延迟目标，才有明确优化必要。',
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
