import { DiagnosisCase } from '../../types/case'

/**
 * 第 9 章 · 消息与异步（延迟消息错序 L3）
 * 教学点：验证思维——"修复生效了"不等于"修复正确"；时区/时间戳类 bug 要在边界条件（跨时区/跨天/夏令时）上验证；
 * 两个 bug 叠加时会互相掩护：修掉一个，另一个才暴露。
 * 专家路径：impact(1) + boundary(2) + tzaudit(1) = 4⚡︎
 */
export const mqDelayCase: DiagnosisCase = {
  id: 'mq-delay',
  title: '延迟任务全部提前执行了',
  intro: '生鲜平台的"定时开售"功能上线三天，运营发现所有延迟 30 分钟开的秒杀，实际都提前开跑了——库存被提前抢空。',
  domain: 'runtime',
  layer: '时间是一切系统里最容易被想当然的数据——它有格式、时区和含义三层皮',
  part: 'master',
  chapterId: 'messaging',
  order: 4,
  typeTags: ['messaging', 'time', 'verification'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」电商的订单平台后端，"定时开售"延迟消息链路由你负责。',
    architecture: '运营后台(设定开售时间) → 延迟消息服务(计算延迟时长入队) → MQ(延迟队列) → 到期投递 → 开售执行器',
    symptoms: [
      {
        type: 'error',
        title: '开售执行日志',
        text: '三个本应 19:00 开售的活动，分别在 18:47、18:52、18:55 被执行——全部提前 5~13 分钟，无一延后。',
      },
      {
        type: 'text',
        title: '运营反馈',
        text: '提前开售导致会员群外的用户也抢到了秒杀价，活动预算 20 分钟烧完，运营要紧急下线功能。',
      },
    ],
    timeline: '功能上线 3 天，每天都提前、提前量还不一样 ｜ 延迟消息服务是上周新写的，本周一刚把"倒计时计算"从"目标时刻"改成"时长模式"',
    impactHint: '提前量不一致（5~13 分钟）是关键线索——如果是固定配置错误，提前量应该恒定。什么因素让"错多少"在变？',
  },

  hypotheses: [
    { id: 'h-cron', text: '到期检查器轮询间隔/批量扫描配置错误，提前捞取了未到期的任务', excludeActionId: 'a-poller' },
    { id: 'h-tz', text: '延迟时长计算跨时区：入队与到期两侧对"时间"的时区解释不一致', excludeActionId: 'a-tzaudit' },
    { id: 'h-dst', text: '活动设定的目标时刻被误解（本地时间 vs UTC），倒计时基于错误基准', excludeActionId: 'a-settime' },
    { id: 'h-clock', text: '服务器时钟漂移：执行器机器时间快了几分钟', excludeActionId: 'a-ntp' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '拉全量延迟任务的对时表',
      desc: '影响面：设定时刻 vs 实际执行时刻的偏差全景',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '设定 vs 实际执行（三天全量）',
        text: '周一  活动10:00开 → 09:58 执行（提前 2 分钟）\n周二  活动19:00开 → 18:47 执行（提前 13 分钟）\n周三  活动19:00开 → 18:52 执行（提前 8 分钟）\n→ 提前量不固定且每天都不同；同是 19:00 的活动提前量也不同——排除固定偏移，指向"延迟时长"本身算错了。',
      },
    },
    {
      id: 'a-poller',
      name: '检查到期扫描器配置',
      desc: '轮询间隔/提前量容忍窗口',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cron'],
      hypotheses: [{ id: 'h-cron', status: 'excluded' }],
      result: {
        type: 'text',
        title: '扫描器配置',
        text: '轮询间隔 10s，无提前捞取窗口（fetchUntil = now）。\n→ 排除扫描器：它只取"已到期"任务，且提前量（分钟级）远大于轮询间隔。',
      },
    },
    {
      id: 'a-ntp',
      name: '核对全部机器的时钟同步',
      desc: '排除服务器时钟漂移',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-clock'],
      hypotheses: [{ id: 'h-clock', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'NTP 状态',
        text: '全部实例 NTP 同步正常，偏差 < 50ms。\n→ 排除时钟漂移：机器时间是对的，错的是"写入队列的时长"。',
      },
    },
    {
      id: 'a-queuelog',
      name: '查延迟消息入队时的时长字段',
      desc: '看写入队列的 delay 值是否已经错了',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '入队消息体',
        text: '周二 18:30 活动（目标 19:00 开）入队消息：\ndelayMs: 1,740,000 (29 分钟)  ← 预期 30 分钟，少了 1 分钟\n周三 12:00 活动（目标 19:00 开，设定于当天 12:00）：\ndelayMs: 24,600,000 (410 分钟)  ← 预期 420 分钟，少了 10 分钟\n→ 入队时 delay 就错了：偏差 = 设定的分钟数 ÷ 某个系数？不对——偏差恰好等于"创建时刻的分钟数 × 固定比例"，像时区偏移参与了对时差。',
      },
    },
    {
      id: 'a-tzaudit',
      name: '审计延迟计算的时区处理',
      desc: 'diff 倒计时代码，追每个时间变量的时区语义',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-tz'],
      hypotheses: [{ id: 'h-tz', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '倒计时代码 diff（本周一变更）',
        text: '- delay = targetTime(epoch, UTC) - now(epoch, UTC)   ← 旧版：统一 UTC 纪元秒\n+ target = parse(targetLocal, "Asia/Shanghai")       ← 新版：按本地时区解析\n+ delay  = target - now()                            ← 但 now() 返回 UTC+0 的 epoch\n+ ——parse 把 19:00 当成上海时间 19:00（=UTC 11:00），now 是 UTC 10:30\n+ delay = 30 分钟 - 8 小时偏移的混算\n→ 时区语义混用：本地时刻与 UTC 纪元直接相减，偏移量随"创建时刻"混入延迟时长——提前量才会每天不同。',
      },
    },
    {
      id: 'a-settime',
      name: '核对运营设定的时间语义',
      desc: '活动目标时刻存的是什么时间',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-dst'],
      hypotheses: [{ id: 'h-dst', status: 'excluded' }],
      result: {
        type: 'text',
        title: '设定端记录',
        text: '运营后台存的 targetLocal = "2026-09-29 19:00"（字符串，无时区标注），语义明确是"上海时间 19:00"。\n→ 排除设定端误解：目标时刻本身没错，错在消费它的计算代码。',
      },
    },
    {
      id: 'a-boundary',
      name: '设计边界用例验证修复',
      desc: '跨时区/跨天/整点边界上验证新代码——不止验"周二19:00"',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '边界用例矩阵（验证思维）',
        text: '修复后用 6 组边界用例验证：\n① 上海 08:00 创建 → 目标 23:00（同日跨上午）✓\n② UTC 16:00 创建 → 目标上海次日 00:00（跨天+跨时区）✓\n③ 创建于 23:59、目标次日 00:01（2 分钟跨天）✓\n④ 冬夏时制切换日（Asia 无 DST，但用 UTC 用户验证）✓\n⑤ delay=0 边界（创建即到期）✓\n⑥ 大延迟 7 天（时长溢出）✓\n→ 全部通过。教训：时区 bug 只在边界上暴露，"上次那组用例过了"不算验证。',
      },
    },
    {
      id: 'a-haltdeliver',
      name: '紧急下线定时开售功能',
      desc: '【状态变更】暂停延迟开售入口，已创建活动转人工执行',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '延迟开售入口下线，未执行的活动转人工定时；队列中未到期消息全部废弃重建。\n→ 超前执行风险解除，等待修复验证后恢复。',
      },
    },
    {
      id: 'a-fixtz',
      name: '统一时间语义：全链路 UTC 纪元秒',
      desc: '【状态变更】延迟计算改为 epoch 差值，展示层才做时区转换',
      cost: 3,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '规范落地：存储与计算一律 UTC epoch；"19:00"只在两处出现——运营输入时转 epoch、运营查看时 epoch 转本地。\n重放历史 30 天延迟任务对时测试：偏差 0 秒。\n灰度恢复功能，观察一周后全量。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-tz', text: '倒计时代码重写后时区语义混用：目标时刻按上海本地时间解析，now() 是 UTC 纪元——本地偏移量随创建时刻混入延迟时长，任务全部提前且提前量不定', correct: true },
    { id: 'rc-cron', text: '到期扫描器配置了提前捞取窗口', correct: false },
    { id: 'rc-dst', text: '运营设定的目标时刻本身存错时区', correct: false },
    { id: 'rc-clock', text: '执行器服务器时钟漂移导致提前执行', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-haltdeliver',

  expertChain: [
    {
      thought: '提前量 2 分钟、13 分钟、8 分钟——不等量是关键。先拉全量对时表，看偏差的分布规律。',
      update: '偏差每天不同、同目标时刻的两个活动偏差也不同 → 排除固定偏移（配置/时钟），指向"延迟时长"计算本身在变。',
      actionId: 'a-impact',
      why: '1⚡︎ 影响面表不只是圈范围：偏差的"形状"就是证据——固定偏差指配置，变化偏差指计算逻辑。',
      conclusion: '排查方向锁定：入队时的 delay 值，而不是到期后的执行环节。',
    },
    {
      thought: '两端快查：扫描器配置和机器时钟——它们是"执行侧"的最后两个嫌疑，1⚡︎ 各一次快速排除。',
      update: '扫描器无提前窗口、NTP 全部正常——执行侧清白，入队消息体成为唯一嫌疑人。',
      actionId: 'a-ntp',
      why: '1⚡︎ 先排除便宜的假设再开箱验货：执行侧排除后，"看入队字段"这个 2⚡︎ 动作才花得值。',
      conclusion: '问题必在入队侧 → 查消息体里的 delayMs。',
    },
    {
      thought: '看队列里真实的 delayMs——如果入队就错了，diff 代码就是最后一步。',
      update: '实锤：delay 少的量与"创建时刻"相关，呈时区偏移特征——审计代码确认：本地时刻与 UTC 纪元直接相减。',
      actionId: 'a-tzaudit',
      why: '2⚡︎+1⚡︎ 组合拳：先看数据（delay 已错）再读代码（为什么错）——数据定位到层，代码定位到行。重写倒计时时把"时刻"和"时长"的时区语义混了。',
      conclusion: '根因实锤：时间语义混用。修复方向 = 统一 UTC 纪元，展示层才做本地化。',
    },
    {
      thought: '修复写完了不等于修好了——时区 bug 的狡猾之处：测试环境恰好和 bug 时区一致时用例全过。必须在边界条件上验证。',
      update: '六组边界用例（跨时区/跨天/跨月/时制切换/零延迟/大延迟）全过，重放 30 天历史任务零偏差。',
      actionId: 'a-boundary',
      why: '验证思维的核心：验证强度要配得上 bug 的狡猾程度。这次 bug 连续三天暴露且形态不同，说明旧验证集根本没覆盖时区维度——换验证集而不是修修补补。',
      conclusion: '修复得到边界级验证 → 允许灰度恢复。',
    },
    {
      thought: '止血（下线）、修复（UTC 统一）、验证（边界矩阵）完成，停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（时区混算）✓ 形状（偏差随创建时刻变化）✓ 验证（边界矩阵+历史重放）✓ ——证据链三层闭合。',
      conclusion: '沉淀：时间的三个坑——格式（时区标注）、语义（时刻 vs 时长）、验证（边界条件）。碰时间的代码，验证集必须带时区维度。',
    },
  ],

  lessons: [
    {
      text: '延迟量不固定的"提前执行"，优先怀疑计算逻辑混入变量，而不是固定配置错误。',
      principle: '偏差恒定 → 配置/时钟；偏差随某个输入变化 → 计算逻辑。把偏差当作函数看：偏差 = f(创建时刻) 的形状直接指向混入的变量（本例是时区偏移），比逐行读代码快。',
    },
    {
      text: '时刻和时长是两种数据：时刻必须带时区，时长是纯差值。全链路只存 UTC 纪元，本地时间只出现在展示层。',
      principle: '时区 bug 的根源是"19:00"这个字符串没有声明自己是哪里的 19:00。工程规范：存储、计算、传输一律 epoch；parse/format 本地时间只在系统边界做，且必须显式指定时区。',
    },
    {
      text: '碰时间的修复必须用边界用例验证：跨时区、跨天、时制切换、零值、大值——正常用例对时区 bug 毫无杀伤力。',
      principle: '验证思维：验证强度要配得上 bug 的隐蔽性。时区/日期类 bug 只在边界条件暴露，修复验证的用例集必须包含之前没覆盖过的维度——"上次的用例过了"是幻觉，不是证据。',
    },
  ],
}
