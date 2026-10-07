import { DiagnosisCase } from '../../types/case'

/**
 * B5-1 · data L3
 * 主训思维：验证思维（多因叠加时单指标会误导——单独看每条线都"还行"，合在一起才致命）
 * 次训思维：架构设计（缓存击穿保护 + 慢查询治理必须同时做）
 * 真实原型：缓存击穿遇上新上线的慢查询，DB 被两侧同时夹击
 * 情绪兽设计：惊讶獭（惊讶）——"每条线单独看都还行"
 * 检查单：思维型 3 + 知识型 1
 */
export const doubleStrikeCase: DiagnosisCase = {
  id: 'double-strike',
  title: '每条线都还行，DB 却挂了',
  intro: '大促前压力测试：DB 连接池耗尽、接口全线超时。但你逐条排查——缓存命中率 97% "正常"、慢查询 0 条"正常"、连接数"正常"。每条线都看不出问题。',
  domain: 'data',
  layer: '多因叠加的排错：每条线单独看都"还行"，是因为它们互相掩盖——必须拉全链路同时看',
  part: 'engineer',
  chapterId: 'data',
  order: 6,
  typeTags: ['data', 'cache'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」DBA。大促前全链路压测，DB 连接池耗尽、接口全线超时——但你逐条排查，每条线都"还行"。工程负责人要求 30 分钟内给出结论。',
    architecture: 'App → 商品服务(Redis 缓存) → MySQL(商品表 500 万行)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '压测结果',
        text: 'DB 连接池：耗尽（active 200/max 200）\n接口全线 P99 > 5s\nRedis 缓存命中率 97%（"还行"）\n慢查询日志：0 条（"正常"）',
      },
      {
        type: 'text',
        title: '逐条排查结果',
        text: '缓存命中率 97%（上周 98%，下降 1%）——"还行"\n慢查询 0 条——"正常"\n连接数 200/max 200——"满但没爆"\n线程数正常\n→ 单看每条都还行，合在一起 DB 挂了。',
      },
    ],
    timeline: '昨天上线了商品查询新版本（新增一个多表 JOIN 查询）｜ 同天有两个热门商品key过期 ｜ 压测：今天',
    impactHint: '每条线单独看都"还行"——但"还行"的线合在一起，为什么 DB 挂了？',
  },

  hypotheses: [
    { id: 'h-combo', text: '缓存击穿 + 新慢查询双因叠加：过期 key 的回源请求恰好命中慢查询，放大效应', excludeActionId: 'a-combo' },
    { id: 'h-poolsize', text: '连接池配小了：200 不够，需要扩大', excludeActionId: 'a-poolsize' },
    { id: 'h-cacheonly', text: '纯缓存击穿：只需要加互斥锁和预热', excludeActionId: 'a-cacheonly' },
    { id: 'h-slowonly', text: '纯慢查询：只需要优化那个 JOIN', excludeActionId: 'a-slowonly' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '画全链路时序图',
      desc: '把"还行"的每条线按时间轴叠在一起看',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '全链路时序叠图',
        text: 'T+0s  热门 key 过期 → 回源请求发出\nT+0s  回源命中的查询走新版本（含多表 JOIN）→ 单次 350ms\nT+0s~2s  3000 并发回源 × 350ms 慢查询 = 1000+ 并发连接同时打到 DB\nT+2s  连接池 200 → 1000+ 并发等待 = 全部超时\n→ 单独看：命中率降 1%"还行"、慢查询 0 条"正常"\n叠在一起：击穿放大了慢查询的并发量。',
      },
    },
    {
      id: 'a-combo',
      name: '验证双因叠加的放大效应',
      desc: '单独测试击穿和慢查询，对比合并效果',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-combo'],
      hypotheses: [{ id: 'h-combo', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '叠加验证',
        text: '单独缓存击穿（无新 JOIN）：3000 并发 × 5ms 快查 = 15 并发 DB 连接 → 可扛 ✓\n单独慢查询（无击穿）：50 QPS × 350ms = 18 并发 DB 连接 → 可扛 ✓\n两者叠加：3000 × 350ms = 瞬时 1000+ 并发 DB 连接 → 200 连接池耗尽 ✗\n→ 放大因子 = 击穿的并发量 × 慢查询的耗时。每条线"还行"是因为放大因子只在叠加时出现。',
      },
    },
    {
      id: 'a-poolsize',
      name: '评估扩大连接池',
      desc: '连接池 200 → 1000 能不能解决',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-poolsize'],
      hypotheses: [{ id: 'h-poolsize', status: 'down' }],
      result: {
        type: 'text',
        title: '连接池评估',
        text: '扩大到 1000 连接：\nDB 内存：每连接 ~4MB → 1000 连接 = 4GB（可承受）\nDB CPU：1000 × 350ms 查询 = CPU 打满 → 治标不治本\n→ 扩池只能延迟超时，不能解决"慢查询 × 高并发"的根因。',
      },
    },
    {
      id: 'a-cacheonly',
      name: '评估只加击穿保护',
      desc: '互斥锁 + 预热能不能解决',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cacheonly'],
      hypotheses: [{ id: 'h-cacheonly', status: 'down' }],
      result: {
        type: 'text',
        title: '击穿保护评估',
        text: '互斥锁：只有 1 个请求回源 → 消除击穿放大\n但：那 1 个请求仍然是 350ms 慢查询 → 50 QPS 的慢查询请求还是会缓慢堆积\n→ 击穿保护消除了放大效应，但没消除慢查询本身。',
      },
    },
    {
      id: 'a-slowonly',
      name: '评估只优化慢查询',
      desc: 'JOIN 优化到 5ms 能不能解决',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-slowonly'],
      hypotheses: [{ id: 'h-slowonly', status: 'down' }],
      result: {
        type: 'text',
        title: '慢查询优化评估',
        text: 'JOIN 优化到 5ms：3000 并发 × 5ms = 15 并发 DB 连接 → 可扛 ✓\n但如果未来再加一个慢查询，击穿放大效应又会重现。\n→ 治了"这个慢查询"，但没治"击穿放大"的机制。',
      },
    },
    {
      id: 'a-fixcombo',
      name: '同时修击穿 + 慢查询',
      desc: '【状态变更】互斥锁 + JOIN 优化 + 连接池微调，三管齐下',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '互斥锁（Redis SETNX）+ JOIN 加索引优化到 5ms + 连接池 200→300。\n压测复验：DB 连接峰值 32，接口 P99 回到 45ms，零超时。\n→ 三管齐下：消除放大因子（互斥锁）+ 降低单次耗时（优化）+ 微调缓冲（池）。',
      },
    },
    {
      id: 'a-dmadeep',
      name: 'DBA 深度分析：排除 DB 自身问题',
      desc: 'DB CPU/内存/锁/索引——排除 DB 自身退化',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'DBA 分析',
        text: 'DB CPU 45%（未被连接数打满）、内存充足、锁等待 0、索引全部命中。\n→ DB 自身健康：问题不在 DB 变慢，在"并发连接数"超池。',
      },
    },
    {
      id: 'a-rollback',
      name: '回滚新版本查询代码',
      desc: '【状态变更】回退含多表 JOIN 的商品查询新版本，止血',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果',
        text: '回退新版本查询代码，回源请求从 350ms 降到 5ms。\nDB 连接峰值从 1000+ 降到 15，接口 P99 恢复。\n→ 止血完成；三管齐下的修复在止血后正式上线。',
      },
    },
    {
      id: 'a-metricfix',
      name: '补叠加场景的监控指标',
      desc: '【状态变更】回源并发数 + 回源耗时 P99 两个新指标',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '新指标',
        text: '① 回源并发数：当前正在回源的请求并发量\n② 回源耗时 P99：回源请求的耗时分布\n→ 未来任何一个指标异常，都能立刻看出"是击穿还是慢查询还是叠加"。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-combo', text: '双因叠加：热门 key 过期（击穿）+ 新版本多表 JOIN 慢查询（350ms）同时发生——击穿的 3000 并发回源全部命中 350ms 慢查询，放大为 1000+ 并发 DB 连接，200 连接池秒耗尽', correct: true },
    { id: 'rc-poolsize', text: '连接池配置过小（200 不够），扩大即可', correct: false },
    { id: 'rc-cacheonly', text: '纯缓存击穿，加互斥锁和预热即可', correct: false },
    { id: 'rc-slowonly', text: '纯慢查询，优化 JOIN 即可', correct: false },
  ],

  expertCost: 6,
  restartActionId: 'a-fixcombo',

  expertChain: [
    {
      thought: '单条线"还行"但系统挂了——这说明问题不在任何单条线上，而在"线与线的交叉点"。画全链路时序图，把所有线按时间轴叠放。',
      update: '时序叠图揭示：击穿 + 慢查询在同一秒叠加——击穿放大了慢查询的并发量。',
      actionId: 'a-impact',
      why: '1⚡ 多因叠加的排错不能逐条排查（每条都"正常"），必须把所有线按时间轴叠放，找交叉点。',
      conclusion: '交叉点确认 → 用控制变量法验证放大效应。',
    },
    {
      thought: '控制变量法验证：单独开击穿、单独开慢查询、合并开——三组对照实验。',
      update: '放大因子 = 击穿的 3000 并发 × 慢查询的 350ms 耗时。每条线单独"还行"的原因找到了：放大因子只在叠加时出现。',
      actionId: 'a-combo',
      why: '2⚡ 控制变量实验是多因叠加排错的黄金标准：它把"我觉得是叠加"变成"我证明了叠加"，并量化了放大倍数。',
      conclusion: '双因叠加实锤 + 放大因子量化 → 评估各种修复方案的覆盖度。',
    },
    {
      thought: '三种"只修一个因"的方案逐一评估：扩池治标不治本、只修击穿留慢查询、只修慢查询留击穿——都不充分。',
      update: '三方案均不充分 → 必须三管齐下：互斥锁（消放大）+ JOIN 优化（降耗时）+ 连接池微调（加缓冲）。',
      actionId: 'a-poolsize',
      why: '1⚡ 多因叠加的修复必须同时消除所有因子——只修一个因的方案，在下一次叠加时仍会触发（换个 key、换个慢查询）。',
      conclusion: '三管齐下方案确定 → 执行 + 补监控。',
    },
    {
      thought: '修复 + 补两个叠加场景的监控指标——以后叠加一出现就能立刻看到。',
      update: '停止排查。修复完成 + 监控补齐。',
      actionId: '',
      why: '【停止规则】三管齐下修复 ✓ 压测复验 ✓ 监控补齐 ✓——修复闭环，且为未来同类问题布好了检测线。',
      conclusion: '检查单：多因叠加时单指标必然误导——全链路时序叠图 + 控制变量实验是标准排查法。',
    },
  ],

  lessons: [
    {
      text: '多因叠加时，单条线"还行"恰恰是最大的误导：放大因子只在交叉时出现。',
      principle: '验证思维：排查复杂故障时不要逐条排查——把所有线按时间轴叠放找交叉点，比逐条分析快 10 倍。',
    },
    {
      text: '控制变量实验是多因叠加的黄金标准：单独测每个因、合并测所有因——放大倍数一目了然。',
      principle: '验证思维：控制变量法不是物理课专属——"关掉缓存击穿看看还挂不挂"就是一组控制变量实验，它把"我觉得"变成"我证明了"。',
    },
    {
      text: '缓存击穿保护的真正价值：不是"避免缓存 miss"，而是"避免回源请求的放大效应"——3000 × 350ms = 灾难。',
      principle: '架构设计：互斥锁/逻辑过期/预热不只是缓存优化——它们是 DB 的保护罩。评估缓存方案时，必须评估"回源请求的并发量 × 单次耗时"。',
    },
    {
      text: '多因叠加的修复必须同时消除所有因子：只修一个因的方案，在下一次叠加时仍会触发。',
      principle: '架构设计：多因叠加的修复清单要覆盖全部因子——"三管齐下"（互斥锁/JOIN 优化/连接池）不是过度设计，是消除叠加条件的最小完备方案。',
    },
  ],
}
