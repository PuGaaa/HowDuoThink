import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const oversellRaceCase: DiagnosisCase = {
  id: 'oversell-race',
  title: '100 件库存卖出了 137',
  intro: '限量100件的商品产生137笔不同订单，库存为-37。先核对账本与入口，再检查并发扣减是否原子。',
  domain: 'concurrency',
  layer: '竞态：检查与扣减是两步，并发下两步之间世界会变',
  part: 'master',
  chapterId: 'concurrency',
  order: 1,
  typeTags: [
    'race',
    'capacity',
    'timing',
  ],
  difficulty: 2,
  scene: {
    role: '你是订单系统后端，大促秒杀活动结束后的盘点会议上，财务报出一个噩梦般的数字。',
    architecture: '秒杀服务→MySQL权威库存和订单；Redis仅缓存库存展示/粗略读提示，不承担原子预扣或唯一准入。',
    symptoms: [
      {
        type: 'error',
        title: '盘点结果',
        text: '商品 S-2049 库存 100 件，实际成交 137 单，DB 库存字段 = -37。\n超卖订单集中在 20:00:00 ~ 20:00:03 的 3 秒内。',
      },
      {
        type: 'text',
        title: '当时的服务状态',
        text: '秒杀期间无报错、无超时——系统"看起来"完全正常。\n活动结束后一切指标恢复正常。',
      },
      {
        type: 'log',
        title: '图片预热告警',
        text: '[WARN] banner thumbnail prefetch 404；秒杀日志中还夹有此条。',
      },
    ],
    timeline: '20:00 秒杀开始 ｜ 20:00:03 库存售罄 ｜ 上周为秒杀新写的扣库存代码上线',
    impactHint: '先确认超卖订单的分布：时间、用户、是否重复。',
  },
  hypotheses: [
    {
      id: 'h-race',
      text: '扣库存逻辑是"先查再扣"两步，并发下竞态穿透',
      excludeActionId: 'a-code',
    },
    {
      id: 'h-dup',
      text: '脚本/双击导致同一用户重复下单',
      excludeActionId: 'a-dup',
    },
    {
      id: 'h-cache',
      text: 'Redis初始库存比DB多37，错误的初始库存直接造成超卖',
      excludeActionId: 'a-redis',
    },
    {
      id: 'h-stat',
      text: '盘点口径错误，实际没有超卖',
      excludeActionId: 'a-impact',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '圈定超卖订单分布',
      desc: '超卖订单的时间与用户分布',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-stat',
        'h-dup',
      ],
      hypotheses: [
        {
          id: 'h-stat',
          status: 'excluded',
        },
        {
          id: 'h-dup',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '订单分布',
        text: '订单明细137笔、不同支付流水/用户且无重试重复；活动初始DB库存100，未补货，137次有效扣减后为-37。137笔是真实承诺，不是已发出137件实物。',
      },
    },
    {
      id: 'a-orderlog',
      name: '读毫秒级订单时间线',
      desc: '看成交瞬间的时间规律',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '毫秒时间线（节选）',
        text: '同一进程内trace和DB语句审计：库存剩1时，多个请求先完成普通SELECT并读到1；随后各自执行stock=stock-1，最后37次将0扣到-37。\n日志墙钟先后只是线索，决定性证据是相同数据库快照值与随后每条已提交UPDATE，不从时间戳 alone宣布竞态。',
      },
    },
    {
      id: 'a-redis',
      name: '对比 Redis 预扣数与 DB 成交数',
      desc: '两套账本是否一致',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-cache',
      ],
      hypotheses: [
        {
          id: 'h-cache',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '两套账本',
        text: '活动初始Redis和DB均为100；Redis只提供展示提示，路由未要求获取原子令牌。权威准入依靠DB下列SELECT/UPDATE。排除“初始两库差37”，不再声称Redis严格放100请求却能有137次独立成交。\n噪声收线：告警仅属图片预取，不读写sku库存或准入令牌；初始库存与DB事务审计独立。',
      },
    },
    {
      id: 'a-code',
      name: '读 DB 扣库存代码',
      desc: '看扣减是原子的还是两步的',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-race',
      ],
      hypotheses: [
        {
          id: 'h-race',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '扣库存代码（上周上线的秒杀版）',
        text: '事务中先普通SELECT stock，if>0再UPDATE stock=stock-1 WHERE id=2049，且无stock>0谓词/受保护锁读；INSERT订单与扣减同事务。UPDATE本身有行锁，但检查已在锁前发生。\n同构将库存设1、两个事务都先读1，再依次UPDATE，两者均插单、库存-1；仅改条件UPDATE并以affected rows=1才插单，第二笔不通过。唯一订单键不能单独防不同用户超卖。',
      },
    },
    {
      id: 'a-dup',
      name: '查重复下单',
      desc: '同一用户/设备是否重复成交',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-dup',
      ],
      hypotheses: [
        {
          id: 'h-dup',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '重复检查',
        text: '137笔不同业务订单和支付流水，无重复履约键，排除重复请求把同一笔交易算多次。',
      },
    },
    {
      id: 'a-wms',
      name: '找仓库核对实物库存',
      desc: '用实物盘点校准系统数字',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-stat',
      ],
      hypotheses: [
        {
          id: 'h-stat',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '实物盘点',
        text: '仓库仅有100件可履约，137笔付款承诺中37笔待补偿；实物不可能已经发137件，更不能以“仓库少37件”证明负数实物。',
      },
    },
    {
      id: 'a-dbside',
      name: '查 DB 侧锁与隔离级别',
      desc: '确认数据库为何没有拦住并发扣减',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-race',
      ],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'DB 侧配置',
        text: '隔离级别 RC；UPDATE 本身有行锁，但"检查"发生在 SELECT（无锁读）——\n行锁只保护扣减那一步，保护不了两步之间的判断。',
      },
    },
    {
      id: 'a-off',
      name: '紧急下架秒杀活动',
      desc: '【状态变更】止损：下架活动避免继续超卖',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '下架结果',
        text: '活动下架，超卖止损。已成交的 37 单走补偿方案（退款+补偿券）。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-race',
      text: '权威DB库存普通SELECT检查与无条件递减分离，多个事务在锁前都通过旧值检查；不同订单依次扣到负数，Redis未作为原子准入',
      correct: true,
    },
    {
      id: 'rc-dup',
      text: '脚本刷单造成重复订单虚增销量',
      correct: false,
    },
    {
      id: 'rc-cache',
      text: 'Redis初始库存比DB多37',
      correct: false,
    },
    {
      id: 'rc-stat',
      text: '盘点口径错误，实际并未超卖',
      correct: false,
    },
  ],
  expertCost: 6,
  restartActionId: '',
  expertChain: [
    {
      thought: '核对订单和初始库存账本。',
      update: '137笔不同真实承诺，库存100-137=-37。',
      actionId: 'a-impact',
      why: '1⚡先区分付款承诺与已经发货的物理数量。',
      conclusion: '统计和重复解释排除。',
    },
    {
      thought: '对齐数据库读值与提交。',
      update: '多个事务读到同一正值，后续仍无条件递减。',
      actionId: 'a-orderlog',
      why: '1⚡事务值比跨时钟第一条日志更能证明交错。',
      conclusion: '检查与扣减分离。',
    },
    {
      thought: '确认Redis是否负责准入。',
      update: '初始均100，Redis仅提示不放行令牌。',
      actionId: 'a-redis',
      why: '2⚡100令牌不可能无解释地放137次，必须确认真实边界。',
      conclusion: '排除初始值错。',
    },
    {
      thought: '审查代码并控制两个事务交错。',
      update: '无条件扣减可负数，条件更新拒绝第二笔。',
      actionId: 'a-code',
      why: '2⚡反例与修复对照证明违反库存不变量。',
      conclusion: '确认竞态。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】真实订单与交错对照证明非原子准入，初始缓存值错、重复和盘点口径均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '权威DB库存普通SELECT检查与无条件递减分离，多个事务在锁前都通过旧值检查；不同订单依次扣到负数，Redis未作为原子准入',
    },
  ],
  lessons: [
    {
      text: '检查和扣减须共享原子边界：条件UPDATE配合受影响行数和同事务插单，或在事务内正确锁读。',
      principle: 'UPDATE行锁只保护更新；普通SELECT在之前读过正库存，并不能保证之后仍可扣。唯一订单键只处理重复订单，不保证不同用户总量不超卖。',
    },
    {
      text: '一份严格只放100次的Redis预扣不能无解释地产生137次独立准入；各层的真实职责必须写清。',
      principle: '本案Redis是非权威读提示，原子准入在DB。若用Redis令牌，必须另外说明重试、补偿及跨层一致性，不能让架构与账本互相矛盾。',
    },
    {
      text: '墙钟日志的毫秒先后不能单独证明并发因果；用读值、事务提交和可控制交错验证。',
      principle: '同构两事务都读1后再扣的交错提供直接反例，修复后第二笔affected rows=0说明库存不变量受保护。',
    },
  ],
}
