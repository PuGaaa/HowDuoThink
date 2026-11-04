import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const cacheReviewCase: DiagnosisCase = {
  id: 'cache-review',
  title: '上线前的缓存方案评审',
  intro: '商品详情缓存拟上线，价格要求一分钟内更新。审查旧价格能否流入成交，再把容量风险与当前正确性缺口分开。',
  domain: 'data',
  layer: '缓存设计的取舍：先问业务时效，再定技术参数',
  part: 'engineer',
  chapterId: 'data',
  order: 4,
  typeTags: [
    'data',
    'architecture',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」的后端负责人，评审会上被指派"挑刺"——找出这个方案未来会出事的地方。',
    architecture: 'App → 详情页服务 → Redis(方案新增) → MySQL(商品表 500 万行)',
    tag: '评审现场',
    symptoms: [
      {
        type: 'error',
        title: '方案文档 · 关键句',
        text: '详情页 QPS 峰值 8000，读:写 = 100:1。\n引入 Redis 缓存，TTL 30 分钟。\nDB 读压力预计下降 95%，接口 P99 预计 < 50ms。',
      },
      {
        type: 'text',
        title: '现网事实',
        text: '业务要求促销改价一分钟内生效，结算必须使用当前有效价格；这是本次发布的明确验收条件。去年改价投诉作为教学背景，不是本题已验证生产事实。',
      },
      {
        type: 'log',
        title: '推荐位缓存告警',
        text: '[WARN] recommendation banner cache miss；评审样例还记录此条。',
      },
    ],
    timeline: '方案评审明天举行 ｜ 双 11 预热 11 天后开始 ｜ 去年大促出现过价格投诉与一次临时救火',
    impactHint: '这不是故障排查——是在故障发生之前，把种子找出来。最值钱的问句是："什么情况下这个设计会出事？"',
  },
  hypotheses: [
    {
      id: 'h-price',
      text: '没有主动失效，且结算直接用30分钟缓存价，存在违反现价成交约束的路径',
      excludeActionId: 'a-orderpath',
    },
    {
      id: 'h-avalanche',
      text: '只有缓存集中过期时才会价格错，平稳低流量无价格风险',
      excludeActionId: 'a-avalanche',
    },
    {
      id: 'h-stampede',
      text: '只要互斥回源即可保证改价一分钟生效，不必主动失效',
      excludeActionId: 'a-stampede',
    },
    {
      id: 'h-cap',
      text: '只要Redis与DB容量够大，就能消除命中旧值的成交风险',
      excludeActionId: 'a-capacity',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '问清价格的业务时效要求',
      desc: '评审第一问：什么数据错不起、多久不能错',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [
        {
          id: 'h-price',
          status: 'up',
        },
      ],
      result: {
        type: 'text',
        title: '业务约束',
        text: '运营明确：促销改价必须分钟级生效——价格是资损红线数据。\n→ TTL 30 分钟与分钟级时效直接冲突，头号嫌疑成立。',
      },
    },
    {
      id: 'a-orderpath',
      name: '查下单链路的价格读取来源',
      desc: '旧价会不会真的流到用户手里',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-price',
      ],
      hypotheses: [
        {
          id: 'h-price',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '下单链路代码',
        text: '方案结算代码直接读取sku缓存price并charge，无有效价版本校验。教学样例：t0价格100，t1运营改DB为80，缓存仍100且到t0+30min才到期；t1+2min低流量订单仍按100收费。\n该路径违反当前有效价成交和一分钟展示时效；是否最终产生资损还取决于促销方向和赔付口径，不预先编金额。\n噪声收线：推荐位使用独立key，不进入sku.price或结算charge；本例低流量且价格命中旧值，推荐位miss不改变收费100的路径。',
      },
    },
    {
      id: 'a-ttl',
      name: '追问 TTL 30 分钟的依据',
      desc: '这个数字是怎么定出来的',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '方案作者的回答',
        text: '"读多写少的场景一般就设 30 分钟。"\n→ 拍脑袋：没有业务输入，没有评估改价时效——参数缺的不是值，是对齐过程。',
      },
    },
    {
      id: 'a-avalanche',
      name: '追问预热与过期策略',
      desc: '大促零点，这批缓存会发生什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-avalanche',
      ],
      hypotheses: [
        {
          id: 'h-avalanche',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '教学单用户回放：无并发、无批量过期，缓存稳定命中旧价仍在2分钟后收费100。故价格错误不依赖雪崩。\n统一TTL仅在写入/预热时刻集中时才会集中到期；没有预热本身不意味着旧缓存同时过期。雪崩应另做容量回放。',
      },
    },
    {
      id: 'a-stampede',
      name: '追问热点 key 的回源保护',
      desc: '同一个 key 失效瞬间，一千个请求谁来读库',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-stampede',
      ],
      hypotheses: [
        {
          id: 'h-stampede',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '互斥回源只在缓存miss时协调重建；本样例一直hit旧值，不进入锁或回源路径。仅加互斥不改变30分钟旧价窗口，排除其能单独保证一分钟生效。',
      },
    },
    {
      id: 'a-capacity',
      name: '追问大促峰值容量与降级',
      desc: '3 倍峰值时这套设计还站得住吗',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-cap',
      ],
      hypotheses: [
        {
          id: 'h-cap',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '同一低流量样例中Redis和DB均有容量余量，但hit仍返回旧价100。扩容不会主动失效，排除容量足够就能消除旧值成交风险。\n大促3倍峰值的容量与限流仍需独立验证，未压测不能说一定不可用。',
      },
    },
    {
      id: 'a-history',
      name: '查同类问题的历史记录',
      desc: '去年那次价格投诉是怎么收场的',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-price',
      ],
      hypotheses: [
        {
          id: 'h-price',
          status: 'up',
        },
      ],
      result: {
        type: 'text',
        title: '事故工单归档',
        text: '去年大促 D-1：批量改价后 2 小时内 300+ 价格投诉 → 临时用"逐个删缓存"脚本救火，2 小时清完。\n→ 同类问题发生过、靠人肉救过火——新方案把它做成了常态，而不是修掉了它。',
      },
    },
    {
      id: 'a-benefit',
      name: '评估方案本身的收益',
      desc: '方向对不对，别把 baby 和洗澡水一起倒掉',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '收益评估',
        text: '高读写比说明缓存可能减轻DB负担，但95%命中率和P99<50ms均只是方案目标，尚未实测。收益方向可讨论，数值不能当已验证事实。',
      },
    },
    {
      id: 'a-minfix',
      name: '开出最小修正清单',
      desc: '让方案达到可上线状态的必改项',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '评审结论 · 修正清单',
        text: '先补阻断项：改价事务提交后触发可靠失效/版本更新，并在结算按当前有效价校验，验证一分钟时效和并发更新。\n再独立验证缓存集中到期、热点miss回源及峰值容量。修正清单是建议，不能代替这些验证已执行。',
      },
    },
    {
      id: 'a-approve',
      name: '按原方案批准上线',
      desc: '【状态变更】不做修改直接过审',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '批准结果',
        text: '方案原样过审上线。\n双 11 零点：改价投诉爆发 + 缓存集中过期 DB 过载——你批准的不是方案，是排期表上的故障。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-price',
      text: '结算直接使用30分钟缓存旧价，改价没有主动失效或现价校验；低流量下也能违反一分钟生效与当前有效价成交约束',
      correct: true,
    },
    {
      id: 'rc-avalanche',
      text: '价格错只会在缓存雪崩时发生，平稳流量无风险',
      correct: false,
    },
    {
      id: 'rc-stampede',
      text: '仅加互斥回源即可保证改价一分钟生效',
      correct: false,
    },
    {
      id: 'rc-cap',
      text: '容量足够即可消除命中旧价格的成交风险',
      correct: false,
    },
  ],
  expertCost: 8,
  restartActionId: 'a-approve',
  expertChain: [
    {
      thought: '先确认时效和结算约束。',
      update: '一分钟展示、当前有效价成交。',
      actionId: 'a-impact',
      why: '1⚡业务约束使TTL参数有评判依据。',
      conclusion: '追踪价格到收费。',
    },
    {
      thought: '执行低流量的改价样例。',
      update: 'DB80而缓存100，2分钟后仍按100收费。',
      actionId: 'a-orderpath',
      why: '2⚡错误价格真实流入收费，比单说TTL长更有决定性。',
      conclusion: '确认当前发布阻断。',
    },
    {
      thought: '去掉过期风暴仍复现。',
      update: '单用户稳定命中也出错。',
      actionId: 'a-avalanche',
      why: '2⚡反例排除价格问题只来自雪崩。',
      conclusion: '排除仅过期风暴。',
    },
    {
      thought: '检查命中时互斥是否执行。',
      update: 'hit不走回源，锁无法改变旧值。',
      actionId: 'a-stampede',
      why: '1⚡机制边界反证单加互斥即可达标。',
      conclusion: '排除仅加互斥。',
    },
    {
      thought: '在容量有余的相同样例复验。',
      update: '无资源瓶颈仍旧价收费。',
      actionId: 'a-capacity',
      why: '2⚡容量可用与值新鲜是独立约束。',
      conclusion: '其余候选排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】低流量旧价成交路径成立，雪崩唯一解释、互斥单独解决和容量解决三种方案均被反例排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '结算直接使用30分钟缓存旧价，改价没有主动失效或现价校验；低流量下也能违反一分钟生效与当前有效价成交约束',
    },
  ],
  lessons: [
    {
      text: '缓存参数不是技术题：TTL 多少分钟，答案在业务时效里——先问"什么数据错不起、多久不能错"，再写技术方案。',
      principle: '技术参数没有业务输入就是拍脑袋。读多写少只决定"要不要缓存"，数据时效与资损容忍度才决定"怎么缓存"。',
    },
    {
      text: '加缓存 = 给系统引入一个新状态机：过期、预热、击穿、容量四张卷子必答，少答一张就是未来某次故障的种子。',
      principle: '缓存设计清单：主动失效策略（谁负责失效）、预热（冷启动谁扛）、击穿保护（热点 key 互斥）、容量（峰值倍数）。四问过全，方案才算完整。',
    },
    {
      text: '评审会上最值钱的问句是"什么情况下这个设计会出事"，而不是"这个设计有什么好处"。',
      principle: '评审需要作者与评审者共同论证收益与风险，不能把“作者只会讲好处”当人性定律。以可复验样例及明确约束裁决，不把预测事故写成必然事实。',
    },
    {
      text: '历史救火记录是免费的评审意见：上次靠人肉救火的地方，这次一定还会着。',
      principle: '临时脚本救过的火，说明系统缺一个正式机制。评审前翻历史工单，等于提前拿到答案。',
    },
  ],
}
