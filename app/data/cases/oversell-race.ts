import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 并发迷宫（秒杀超卖 L3）
 * 教学点：check-then-act 竞态；并发故障的证据在毫秒级时间线里；"请求都在排队"假象。
 * 专家路径：impact(1) + orderlog(1) + code(2) = 4⚡︎（redis 2⚡︎ 为可选加固证据）
 */
export const oversellRaceCase: DiagnosisCase = {
  id: 'oversell-race',
  title: '100 件库存卖出了 137',
  intro: '秒杀活动当晚盘点发现：限量 100 件的商品实际卖出了 137 单，库存数变成负数。',
  domain: 'concurrency',
  layer: '竞态：检查与扣减是两步，并发下两步之间世界会变',
  part: 'master',
  chapterId: 'concurrency',
  order: 1,
  typeTags: ['race', 'capacity', 'timing'],
  difficulty: 3,

  scene: {
    role: '你是订单系统后端，大促秒杀活动结束后的盘点会议上，财务报出一个噩梦般的数字。',
    architecture: 'App → 网关 → 秒杀服务 → Redis(预扣) + MySQL(库存真相)',
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
    ],
    timeline: '20:00 秒杀开始 ｜ 20:00:03 库存售罄 ｜ 上周为秒杀新写的扣库存代码上线',
    impactHint: '先确认超卖订单的分布：时间、用户、是否重复。',
  },

  hypotheses: [
    { id: 'h-race', text: '扣库存逻辑是"先查再扣"两步，并发下竞态穿透', excludeActionId: 'a-code' },
    { id: 'h-dup', text: '脚本/双击导致同一用户重复下单', excludeActionId: 'a-dup' },
    { id: 'h-cache', text: 'Redis 预扣数与 DB 库存不同步', excludeActionId: 'a-redis' },
    { id: 'h-stat', text: '盘点口径错误，实际没有超卖', excludeActionId: 'a-orderlist' },
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
      tests: ['h-stat'],
      hypotheses: [{ id: 'h-stat', status: 'down' }],
      result: {
        type: 'text',
        title: '订单分布',
        text: '137 单全部真实支付、不同用户、无重复——排除刷单与统计错误。\n时间集中：20:00:00.800 ~ 20:00:03.200，之后零成交（售罄）。',
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
        text: '20:00:01.100 第 99 单（库存余 1）\n20:00:01.105 第 100 单（库存余 0）\n20:00:01.106 ~ 20:00:03.200 又成交 37 单\n→ 售罄后仍继续成交 3 秒——"检查通过"发生在扣减之前',
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
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'down' }],
      result: {
        type: 'text',
        title: '两套账本',
        text: 'Redis 预扣计数：100（扣完为止，正常）\nDB 实际成交：137\n→ Redis 挡住了流量，但 DB 层多出了 37 单——问题在 DB 扣减逻辑，不在预扣。',
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
      tests: ['h-race'],
      hypotheses: [{ id: 'h-race', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '扣库存代码（上周上线的秒杀版）',
        text: "stock = SELECT stock FROM sku WHERE id=2049\nif stock > 0:\n    UPDATE sku SET stock = stock - 1 WHERE id=2049\n    INSERT INTO orders ...\n→ 经典 check-then-act：查询与扣减非原子，无数唯一约束、无行锁",
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
      tests: ['h-dup'],
      hypotheses: [{ id: 'h-dup', status: 'down' }],
      result: {
        type: 'text',
        title: '重复检查',
        text: '137 单对应 137 个不同用户 ID，无重复下单——超卖不是刷出来的。',
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
      tests: ['h-stat'],
      hypotheses: [{ id: 'h-stat', status: 'excluded' }],
      result: {
        type: 'text',
        title: '实物盘点',
        text: '仓库实物比系统应剩数量少 37 件——实物与成交单吻合，系统数字（负库存）才是对的。超卖为真。',
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
      tests: ['h-race'],
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
      cost: 6,
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
    { id: 'rc-race', text: '秒杀扣库存为 check-then-act 两步逻辑，高并发下竞态穿透导致超卖', correct: true },
    { id: 'rc-dup', text: '脚本刷单造成重复订单虚增销量', correct: false },
    { id: 'rc-cache', text: 'Redis 预扣与 DB 库存数据不同步', correct: false },
    { id: 'rc-stat', text: '盘点口径错误，实际并未超卖', correct: false },
  ],

  expertCost: 4,
  restartActionId: '',

  expertChain: [
    {
      thought: '财务说超卖 37 件——先别信也别慌，用自己的数据验证：查订单分布。',
      update: '实锤超卖为真：137 单真实支付、用户各不相同。h-stat、h-dup 双双降权。',
      actionId: 'a-impact',
      why: '1⚡︎ 先验证问题真实性并拿到时间形状——"3 秒集中成交"直接指向并发窗口。',
      conclusion: '超卖为真 + 集中在 3 秒内 → 并发竞态假设升权。',
    },
    {
      thought: '毫秒时间线是并发故障的核心证据：售罄后为何还能成交 3 秒？',
      update: '实锤"检查通过但库存已空"的窗口存在——两步逻辑假设升权。',
      actionId: 'a-orderlog',
      why: '1⚡︎ 的毫秒时间线直接展示竞态窗口的 existence，这是并发案最关键的证据形态。',
      conclusion: '售罄后 3 秒内继续成交 → 检查发生在扣减之前，竞态实锤方向确认。',
    },
    {
      thought: '两套账本要分清责任：Redis 预扣是对的，DB 多卖——问题锁定 DB 扣减代码。',
      update: 'h-cache 排除；h-race 待代码实锤。',
      actionId: 'a-redis',
      why: '2⚡︎ 分清"哪一层在说谎"：预扣层正常说明流量被正确挡住，DB 层多卖说明扣减逻辑有洞。',
      conclusion: 'Redis 正常、DB 超卖 → 读 DB 扣库存代码。',
    },
    {
      thought: '代码就在眼前：SELECT 查库存、if 判断、UPDATE 扣减——两步之间没有原子性保护。',
      update: 'h-race 实锤。DB 行锁只保护 UPDATE，不保护两步之间的判断。',
      actionId: 'a-code',
      why: '2⚡︎ 读代码是竞态案的最终实锤——所有时间线证据都在这里得到机制解释。',
      conclusion: '实锤：check-then-act 竞态。修复：原子扣减（UPDATE ... WHERE stock>0）或分布式锁 + 唯一约束兜底。',
    },
    {
      thought: '证据链闭合：超卖为真 + 售罄后继续成交 + 两步代码实锤。修复方案确定，停止收集。',
      update: '停止收集，转入止损与修复。',
      actionId: '',
      why: '下架止血、代码改原子扣减、超卖订单走补偿——行动清单已完整，继续查不改变行动。',
      conclusion: '紧急下架活动 → 代码改原子扣减 → 补偿 37 单。检查单：秒杀库存必须原子扣减。',
    },
  ],

  lessons: [
    {
      text: '秒杀/限量场景的库存扣减必须原子：UPDATE ... WHERE stock > 0，或 Redis Lua/分布式锁。',
      principle: 'check-then-act 是并发第一陷阱："检查"与"行动"之间世界随时会变。行锁只保护单条语句，保护不了两步之间的判断——原子化或加锁必须覆盖整个判断+行动序列。',
    },
    {
      text: '并发故障的证据在毫秒级时间线里：秒级粒度看不到竞态窗口。',
      principle: '竞态的证据形态是"事件在窗口内密集出现"。排查并发问题时第一时间把时间粒度切到毫秒级，窗口立现。',
    },
    {
      text: '"系统看起来正常"恰恰是并发故障的指纹：逻辑错了但每一步都成功了。',
      principle: 'CPU/内存/报错全正常的"静默故障"多见于逻辑竞态——每笔请求单独看都成功，合在一起才出错。指标健康不等于逻辑正确。',
    },
  ],
}
