import { DiagnosisCase } from '../../types/case'

/**
 * 第 9 章 · 并发迷宫 第二批（分布式锁过期双跑 L3）
 * 教学点：假设思维——锁的保护窗口必须覆盖任务全生命周期；锁过期后发生的事代码要"有感知"；
 * 锁是最好防线但不是唯一防线（任务自身幂等是最后防线）；token 校验防止误删他人的锁。
 * 专家路径：impact(1) + ttlmath(2) + watchdog(1) = 4⚡︎
 */
export const lockExpiryCase: DiagnosisCase = {
  id: 'lock-expiry',
  title: '分布式锁明明加了，任务还是双跑了',
  intro: '每小时的结算任务偶发双跑：两个实例同时执行，重复入账 2,131 笔。分布式锁明明加了——有效期 30 秒。',
  domain: 'concurrency',
  layer: '锁保护的是窗口，不是任务——窗口必须覆盖任务全生命周期',
  part: 'master',
  chapterId: 'concurrency',
  order: 6,
  typeTags: ['race', 'capacity', 'data'],
  difficulty: 3,

  scene: {
    role: '你是「票到手」结算平台的后端，财务对账差异工单把你叫进了会议室。',
    architecture: '调度器(每小时触发) → 3 实例抢 Redis 锁(SETNX, TTL 30s) → 结算任务(20s ~ 6min) → 账务系统',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '财务对账报告',
        text: '重复入账 2,131 笔，金额一致、流水号不同——同一笔结算被执行了两次。\n全部集中在"大账户批量结算"时段。',
      },
      {
        type: 'text',
        title: '锁日志',
        text: '实例 A：T+0 获取锁成功，开始执行结算（该时段任务耗时 4~6 分钟）\n实例 B：T+35s 获取锁成功，也开始执行结算\n两实例各自认为"我持有锁，轮到我了"。',
      },
    ],
    timeline: '业务量上月增长：结算任务从平均 2 分钟涨到 5 分钟 ｜ 锁 TTL 上线时定死 30 秒，从未调整 ｜ 双跑自两周前开始出现',
    impactHint: '锁 30 秒就到期，任务要跑 5 分钟——第 31 秒到第 5 分钟之间，保护还在吗？代码知道吗？',
  },

  hypotheses: [
    { id: 'h-ttl', text: '锁 TTL(30s) 远小于任务耗时(5min)：锁过期后另一实例正常抢到，双跑', excludeActionId: 'a-ttlmath' },
    { id: 'h-renew', text: '有看门狗续期机制但失效了（续期线程异常退出）', excludeActionId: 'a-watchdog' },
    { id: 'h-release', text: '实例 A 提前 DEL 了锁且不校验持有者，把别人的锁删了引发连环抢锁', excludeActionId: 'a-releasecheck' },
    { id: 'h-clock', text: '实例间时钟漂移，过期判断不一致', excludeActionId: 'a-clockcheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '对齐双跑开始时间与锁生命线',
      desc: '影响面：双跑发生的确切时刻有什么规律',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '双跑时间线（6 次事故样本）',
        text: '事故 1：A T+0 获锁执行 → B T+34s 获锁\n事故 2：A T+0 → B T+31s\n……全部：B 的获锁时间 = 任务开始后 30~36s\n共同点：双跑时段的任务耗时全部 > 4 分钟（大账户批量结算）\n→ B 获锁时刻与 TTL 30s 精确吻合——这不是玄学，是"保护窗口关闭的时刻"。',
      },
    },
    {
      id: 'a-ttlmath',
      name: '核对锁实现：TTL、续期、过期后的行为',
      desc: '锁的三个关键参数逐一对账',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-ttl'],
      hypotheses: [{ id: 'h-ttl', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '锁实现审计',
        text: '加锁：SET lock:hourly-settle <instanceId> NX EX 30\n续期：无（全代码无 renew/watchdog）\n过期后：锁静默消失——实例 A 的任务毫无感知，继续执行\n任务耗时分布：P50 2min、P95 4.8min（上月增长后）\n实锤：保护窗口 30s << 任务耗时 5min。锁过期 = 保护结束，但"正在执行"这件事没人通知。',
      },
    },
    {
      id: 'a-watchdog',
      name: '搜代码里的续期机制',
      desc: '排除"续期失效"——先确认有没有续期',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-renew'],
      hypotheses: [{ id: 'h-renew', status: 'excluded' }],
      result: {
        type: 'text',
        title: '续期审计',
        text: '全仓搜 renew / watchdog / refresh / expire 续期相关：零实现。\n→ 排除"续期失效"：不是坏了，是从未有过——上线时任务只要 20s~2min，30s TTL 一直"够用"，直到业务量增长撕开窗口。',
      },
    },
    {
      id: 'a-releasecheck',
      name: '审计锁释放逻辑',
      desc: 'DEL 之前校验持有者吗',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-release'],
      hypotheses: [{ id: 'h-release', status: 'excluded' }],
      result: {
        type: 'text',
        title: '释放审计',
        text: '释放代码：DEL lock:hourly-settle——无 token 校验，谁都能删。\n推演：A 在 T+5min 完成时 DEL，删掉的是 B 在 T+35s 持有的锁 → C 在下一秒还能再抢到。\n→ 真实存在的第二缺陷！但它发生在"双跑已经发生之后"，是本次事故的放大器而非触发器。两处一起修。',
      },
    },
    {
      id: 'a-clockcheck',
      name: '核对实例时钟与 Redis 过期语义',
      desc: '排除时钟漂移',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-clock'],
      hypotheses: [{ id: 'h-clock', status: 'excluded' }],
      result: {
        type: 'text',
        title: '时钟审计',
        text: '三实例 NTP 偏差 < 40ms；Redis key 过期由 Redis 服务端判定，与客户端时钟无关。\n→ 排除时钟问题。',
      },
    },
    {
      id: 'a-replay',
      name: '完整时间线重放',
      desc: '把事故逐秒重放，机制闭合',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '事故重放（逐秒）',
        text: 'T+0    A SETNX 成功（TTL 30s）→ 开始结算\nT+30   Redis 服务端令锁过期——A 无感知，继续跑\nT+35   B SETNX 成功 → 开始结算（双跑开始）\nT+5min A 完成 → DEL（误删 B 的锁，第二缺陷）\nT+7min B 完成 → 重复入账 2,131 笔\n→ 触发器（TTL 过短）+ 放大器（DEL 无校验）+ 根本缺陷（任务自身不幂等）三层机制闭合。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急冻结结算调度',
      desc: '【状态变更】暂停每小时结算任务，账务入账冻结',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '调度暂停，账务系统冻结对客入账；2,131 笔重复流水进入冲正流程。\n财务停摆压力下，修复窗口以小时计。',
      },
    },
    {
      id: 'a-fixrenew',
      name: '锁改造：看门狗续期 + token 校验释放',
      desc: '【状态变更】任务运行期自动续期（TTL/3）；DEL 携带 token 仅删自己的锁',
      cost: 3,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 看门狗：任务运行中每 10s（TTL/3）续期到 30s，任务结束停止续期\n② token 释放：加锁时生成唯一 token，DEL 用 Lua 脚本"值相等才删"\n③ 压测：5min 长任务 + 3 实例并发抢锁 1000 轮：零双跑、零误删。',
      },
    },
    {
      id: 'a-fixidem',
      name: '沉淀：任务自身幂等化',
      desc: '【状态变更】结算按任务周期 ID 建唯一约束，重复执行直接跳过',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '最后防线',
        text: '账务表对 (settle_period, account_id) 建唯一约束：同一周期同一账户只能入账一次。\n→ 锁失效、续期失效、任何意外——双跑的账也写不进去。防线从"一把锁"变成"锁 + 幂等"两层。',
      },
    },
    {
      id: 'a-fixdrill',
      name: '沉淀：锁窗口与耗时的联动告警',
      desc: '【状态变更】任务耗时 P95 > 锁 TTL × 0.7 时告警"保护窗口不足"',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控 v2',
        text: '告警规则上线：settle 任务耗时 P95（4.8min）> TTL×0.7（21s）→ 触发"锁保护窗口不足"告警。\n→ 这次事故的根因（业务量增长撕开窗口）在两周前就会亮灯，而不是靠财务对账发现。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-ttl', text: '锁 TTL(30s) 固定不变而任务耗时增长至 P95 4.8min：锁过期后保护窗口关闭，第二实例正常获锁双跑——无续期机制、锁过期后执行方无感知', correct: true },
    { id: 'rc-renew', text: '看门狗续期机制存在但异常失效', correct: false },
    { id: 'rc-release', text: '锁释放无 token 校验，实例误删他人持有的锁', correct: false },
    { id: 'rc-clock', text: '实例时钟漂移导致过期判断不一致', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '双跑的时刻有什么规律？——把 6 次事故的 B 获锁时刻排成一列，和锁的生命线对齐。',
      update: 'B 全部在 T+30~36s 获锁，与 TTL 30s 精确吻合；双跑时段任务耗时全部 > 4min。',
      actionId: 'a-impact',
      why: '1⚡︎ 时间对齐是最便宜的实锤路径：获锁时刻 ≈ TTL 这个"巧合"出现 6 次，就不再是巧合——它直接指认保护窗口的关闭时刻。',
      conclusion: '嫌疑锁定：TTL 与耗时的剪刀差（h-ttl 升权）。',
    },
    {
      thought: '核对锁实现的三个参数：TTL 多少、有没有续期、过期后执行方知不知道。',
      update: '实锤：TTL 30s 固定、零续期、过期静默——锁保护的是"前 30 秒"，任务的后 4 分半在裸奔。',
      actionId: 'a-ttlmath',
      why: '2⚡︎ 锁的正确性是三个参数的合取：窗口、续期、过期感知——缺任何一个，"加了锁"都是心理安慰。参数对账一次把三问全答了。',
      conclusion: '根因实锤：保护窗口 << 任务生命周期。',
    },
    {
      thought: '"续期失效"假设单查一下——如果曾经有续期，修复方向会是"修 bug"而不是"建机制"。',
      update: '全仓零续期实现——从未有过，不是坏了。上线时"够用"是因为任务当时只要 2 分钟。',
      actionId: 'a-watchdog',
      why: '1⚡︎ 区分"机制缺失"与"机制失效"决定修复层级：缺失要建机制（大改），失效要修 bug（小改）——证据决定方案规格。',
      conclusion: '缺失确认 → 修复为"建看门狗"而非"查 bug"。',
    },
    {
      thought: '审计释放逻辑——顺藤摸瓜检查锁的完整生命周期，别放过"过期之后"和"释放之时"。',
      update: 'DEL 无 token 校验是真实的第二缺陷：A 会误删 B 的锁造成保护真空——它是放大器，不是本次触发器。两处一起修。',
      actionId: 'a-releasecheck',
      why: '1⚡︎ 排查的副产品经常是第二缺陷：明确它的"贡献度"（放大器 vs 触发器）才能排出正确的修复优先级——两个都要修，但因果叙事不能混。',
      conclusion: '触发器 + 放大器分层确认。',
    },
    {
      thought: '完整重放闭合机制 → 三层防线修复（看门狗 + token + 任务幂等）→ 联动告警防"增长撕开窗口"。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】触发器（TTL 剪刀差）✓ 放大器（误删锁）✓ 根本面（任务不幂等）✓——三层机制与三层防线一一对应。',
      conclusion: '沉淀：锁保护的是窗口不是任务。分布式互斥的正确姿势 = 续期锁（防线一）+ 任务幂等（防线二）——锁会失效，幂等不会。',
    },
  ],

  lessons: [
    {
      text: '锁保护的是窗口，不是任务：TTL 固定而任务变长，保护窗口之外的执行就是"裸奔"，且执行方对锁过期毫无感知。',
      principle: '并发设计：互斥锁的正确姿势 = 看门狗续期（窗口跟随任务生命周期）+ 过期感知（发现锁丢失立即中止）。任何"固定 TTL"的锁都要回答：任务耗时的 P95 是 TTL 的几倍？',
    },
    {
      text: '锁是最好防线但不是唯一防线：任务自身幂等（周期+账户唯一约束）才是兜底——锁失效、网络分区、时钟异常时，幂等依然成立。',
      principle: '纵深防御：分布式互斥的正确分层 = 锁（尽量不重复）+ 幂等（重复了也无害）。资损类任务必须两层都建——防线的选择标准不是"哪个更强"，是"哪个失效时另一个还在"。',
    },
    {
      text: '增长会撕开静态配置的安全边际：任务从 2 分钟涨到 5 分钟，30 秒的锁就从中性配置变成了事故——配置要与它保护的量联动。',
      principle: '运维视角：静态配置（TTL/超时/限额）与动态负载（耗时/流量/数据量）之间的剪刀差要用告警盯住（耗时 P95 > TTL×0.7 即告警）。"够用"是有前提的，前提变了配置必须重估。',
    },
  ],
}
