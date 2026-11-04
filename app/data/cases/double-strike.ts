import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const doubleStrikeCase: DiagnosisCase = {
  id: 'double-strike',
  title: '每条线都还行，DB 却挂了',
  intro: '缓存miss比例只变了一点，回源查询也没达到慢日志阈值，连接池却耗尽。把回源速率和持有时间放在同一时间窗核算。',
  domain: 'data',
  layer: '到达速率与持有时间共同决定资源需求，分开聚合指标和故障窗口',
  part: 'engineer',
  chapterId: 'data',
  order: 6,
  typeTags: [
    'data',
    'cache',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」DBA。大促前全链路压测，DB 连接池耗尽、接口全线超时——但你逐条排查，每条线都"还行"。工程负责人要求 30 分钟内给出结论。',
    architecture: 'App → 商品服务(Redis 缓存) → MySQL(商品表 500 万行)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '压测结果',
        text: '连接池active200/max200，另有排队，接口P99>5s。全站Redis命中97%，故障热点窗口回源3000次/秒；慢日志阈值1s，350ms查询不会被记录。',
      },
      {
        type: 'text',
        title: '逐条排查结果',
        text: '全站聚合命中率不能代表故障key；连接池200/200已是饱和，绝非正常。查询执行350ms小于1秒日志阈值，只说明日志未收录，不代表性能充分。',
      },
      {
        type: 'log',
        title: '监控采集重试',
        text: '[WARN] metrics push retry；池饱和时也出现。',
      },
    ],
    timeline: '昨天新增JOIN；压测同一10秒窗口两个热点key到期且无请求合并；今天复放三个受控组合。',
    impactHint: '每条线单独看都"还行"——但"还行"的线合在一起，为什么 DB 挂了？',
  },
  hypotheses: [
    {
      id: 'h-combo',
      text: '无回源合并与350ms查询叠加，3000QPS×0.35s=1050个所需并发，超200池',
      excludeActionId: 'a-combo',
    },
    {
      id: 'h-poolsize',
      text: '只扩大连接池到1000就足够，不需评估数据库承载或其他因子',
      excludeActionId: 'a-poolsize',
    },
    {
      id: 'h-cacheonly',
      text: '只有缓存miss能解释，查询5ms和350ms对连接需求没有实质差别',
      excludeActionId: 'a-cacheonly',
    },
    {
      id: 'h-slowonly',
      text: '只有查询变慢能解释，回源50QPS和3000QPS对需求没有实质差别',
      excludeActionId: 'a-slowonly',
    },
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
        text: '故障窗口回源速率3000次/秒，每次持连接约0.35秒，假设流量稳定且无排队时所需并发L=λW=1050。实际最多200连接在执行，其余等待；不是实际建立1000个连接。\n对照常态回源50QPS。慢日志1s阈值漏掉350ms查询，全站97%聚合命中率掩盖了热点窗口。',
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
      tests: [
        'h-combo',
        'h-cacheonly',
        'h-slowonly',
      ],
      hypotheses: [
        {
          id: 'h-combo',
          status: 'confirmed',
        },
        {
          id: 'h-cacheonly',
          status: 'excluded',
        },
        {
          id: 'h-slowonly',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '叠加验证',
        text: '同构固定10秒输入窗口：A保留3000QPS、查询5ms，所需并发约15；B回源50QPS、查询350ms，约17.5；C同时3000QPS与350ms，约1050需求，实际200执行、队列上升并超时。\n速率QPS×秒才得到并发需求，不能把3000个已并发请求再乘耗时。C在两个因素叠加时超出池预算。\n噪声收线：对照输入和连接持有数由本地计数器完整记录，监控上送在独立进程，不参与Redis回源或SQL执行。',
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
      tests: [
        'h-poolsize',
      ],
      hypotheses: [
        {
          id: 'h-poolsize',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '连接池评估',
        text: '1050个理论并发需求仍大于1000，且必须测数据库在该并发下服务时间是否恶化；不能凭每连接固定4MB推断可承载。提高池上限不是已证明充分的方案。',
      },
    },
    {
      id: 'a-cacheonly',
      name: '评估只加击穿保护',
      desc: '核对同速率不同耗时的对照，判断查询是否也是因子',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-cacheonly',
      ],
      hypotheses: [
        {
          id: 'h-cacheonly',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '击穿保护评估',
        text: 'A与C只改变查询耗时，需求由15→1050；故不能说只有miss重要。请求合并可消除本次一个充分条件，可能足以止血，但查询预算仍需治理。',
      },
    },
    {
      id: 'a-slowonly',
      name: '评估只优化慢查询',
      desc: '核对同耗时不同速率的对照，判断回源是否也是因子',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-slowonly',
      ],
      hypotheses: [
        {
          id: 'h-slowonly',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '慢查询优化评估',
        text: 'B与C只改变回源速率，需求17.5→1050；故不能说只有查询耗时重要。把查询优化到5ms可止血本次故障，不等于未来永不需要热点保护。',
      },
    },
    {
      id: 'a-fixcombo',
      name: '同时修击穿 + 慢查询',
      desc: '【状态变更】先消除当前过载的充分条件，再按预算补长期保护',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '根据实测先降低回源放大或单次耗时，任一项足以先让需求回到200内。正式修复补请求合并、查询预算和峰值回归；是否把池200改300须另有容量依据，不能自动列入最小充分方案。',
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
        text: '故障中DB实际活跃执行连接上限200，CPU45%、无锁等待；性能瓶颈可表现为连接被I/O持有，CPU没满不能直接说数据库完全健康。',
      },
    },
    {
      id: 'a-rollback',
      name: '回滚新版本查询代码',
      desc: '【状态变更】回退含多表 JOIN 的商品查询新版本，止血',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果',
        text: '回退JOIN使查询恢复5ms，在相同3000QPS输入下并发需求约15，池排队消失。该状态变更可作为止血，但不作为已执行取证的一部分。',
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
    {
      id: 'rc-combo',
      text: '故障窗口3000QPS回源与350ms持连接时间叠加，理论需求1050超200池；实际200执行、其余排队，两个因素单独均不超预算',
      correct: true,
    },
    {
      id: 'rc-poolsize',
      text: '只扩大到1000即可保证解决，无需容量验证',
      correct: false,
    },
    {
      id: 'rc-cacheonly',
      text: '只有缓存miss重要，查询耗时对连接需求无实质影响',
      correct: false,
    },
    {
      id: 'rc-slowonly',
      text: '只有查询耗时重要，回源速率对连接需求无实质影响',
      correct: false,
    },
  ],
  expertCost: 4,
  restartActionId: 'a-fixcombo',
  expertChain: [
    {
      thought: '先统一故障窗口的速率与持有时间。',
      update: '3000QPS×0.35s=1050需求，实际200执行。',
      actionId: 'a-impact',
      why: '1⚡单位一致才可用容量模型，不能并发数再乘耗时。',
      conclusion: '核对组合效应。',
    },
    {
      thought: '运行三个控制变量组合。',
      update: 'A15、B17.5、C1050，只有C超200。',
      actionId: 'a-combo',
      why: '2⚡相同窗口对照同时证明两个因子都重要。',
      conclusion: '确认组合，排除两个单因无关论。',
    },
    {
      thought: '核对单扩1000的充分性。',
      update: '仍小于1050需求，DB承载也未验证。',
      actionId: 'a-poolsize',
      why: '1⚡不能用固定每连接内存或直觉宣布扩池充分。',
      conclusion: '其余候选排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】三组同构对照和单位一致的容量模型成立，两个单因无关论及扩1000充分论均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '故障窗口3000QPS回源与350ms持连接时间叠加，理论需求1050超200池；实际200执行、其余排队，两个因素单独均不超预算',
    },
  ],
  lessons: [
    {
      text: '连接并发需求≈到达速率×持有时间，单位应是QPS×秒；实际执行数仍受200池上限约束。',
      principle: 'Little定律在稳定窗口下帮助估算，过载排队会改变等待时间。分开需求、已执行和等待数，不把1050需求冒充1050已建连接。',
    },
    {
      text: '1秒慢日志阈值不会收录350ms查询；聚合97%命中率不能代表故障热点的回源速率。',
      principle: '日志阈值与聚合口径会遮蔽局部负载。记录故障key、时间窗、回源QPS、持有时长及池等待，再做受控对照。',
    },
    {
      text: '双因叠加不意味着必须同时修掉所有因子才能止血，先消除一个充分条件也可能恢复。',
      principle: '本题将耗时降为5ms或合并热点回源均可降低当前需求；长期修复按风险覆盖选择，扩池须有数据库预算，不能把三管齐下当无条件最短方案。',
    },
  ],
}
