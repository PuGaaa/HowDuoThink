import { DiagnosisCase } from '../../types/case'

/**
 * B1-5 · observability L2
 * 主训思维：产品思维（告警是为人服务的——信噪比就是可用性）
 * 次训思维：复盘思维（狼来了效应是真实的可用性事故）
 * 真实原型：一个 DB 慢查询根因触发 500+ 条连锁告警，P0 前兆被淹没
 * 情绪兽设计：恐怖蛙（恐慌）——五百条告警一起叫，人只会关掉通知
 * 检查单：思维型 3 + 知识型 1
 */
export const alertStormCase: DiagnosisCase = {
  id: 'alert-storm',
  title: '一夜五百条告警——狼来了',
  intro: '昨晚值班群被 500+ 条告警刷屏。早上复盘：里面埋着一条 P0 前兆，无人响应，两小时后酿成 P0 事故。',
  domain: 'runtime',
  layer: '告警是为人服务的：信噪比就是可用性——没有分级与聚合的告警，等于没有告警',
  part: 'master',
  chapterId: 'observability',
  order: 3,
  typeTags: ['observability', 'sre'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」平台工程组的负责人。值班工程师小王昨晚漏掉了 P0 前兆，他要背锅——但你知道，锅不在他。',
    architecture: '全部服务 → 统一告警群(无分级) → 值班工程师(一个人)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '值班群统计',
        text: '昨晚 22:00~02:00 告警 523 条：\n"订单服务 P99 > 1s" ×187 条（同一告警每 15s 重发）\n"库存服务 timeout" ×143 条　"购物车 5xx" ×96 条　其余 ×97 条\n其中 1 条："主库慢查询数 > 50/min"——P0 前兆，无人响应。',
      },
      {
        type: 'text',
        title: '值班响应记录',
        text: '22:10 值班工程师小王："全是超时，重启过了，观察。"\n22:40 小王把告警群设为免打扰。\n02:11 主库连接耗尽，下单全停——P0 事故。',
      },
    ],
    timeline: '告警体系上线 8 个月从未分级 ｜ 近三周该群日均 300+ 条告警 ｜ 小王是本月第三位把群静音的值班工程师',
    impactHint: '小王漏掉告警是"人"的问题吗？——如果是系统逼人忽略告警，锅应该给谁？',
  },

  hypotheses: [
    { id: 'h-design', text: '告警体系设计缺陷：无分级、无聚合、无抑制——风暴是必然，漏看是必然', excludeActionId: 'a-rules' },
    { id: 'h-fatigue', text: '狼来了效应：连续三周低质告警让值班员形成忽略习惯', excludeActionId: 'a-response' },
    { id: 'h-channel', text: '通知渠道故障：P0 告警根本没送达', excludeActionId: 'a-channel' },
    { id: 'h-skill', text: '值班员能力不足：看不懂告警', excludeActionId: 'a-skill' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '统计告警量与结构',
      desc: '五百条告警的构成画像',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [{ id: 'h-design', status: 'up' }],
      result: {
        type: 'text',
        title: '告警画像',
        text: '523 条里：同一告警重发 187 次（15s 间隔无静默）；\n"订单超时/库存超时/购物车 5xx" 全部是"主库慢"的下游症状；\nP0 前兆"主库慢查询数"只有 1 条，与其他告警完全同权。\n→ 风暴 = 一个根因 × 无聚合 × 无分级。',
      },
    },
    {
      id: 'a-timeline',
      name: '还原 P0 前兆的响应时间线',
      desc: '那条被淹没的告警，晚了多久',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-channel'],
      hypotheses: [{ id: 'h-channel', status: 'excluded' }],
      result: {
        type: 'text',
        title: '前兆时间线',
        text: '23:20 "主库慢查询数 > 50/min" 首次触发（送达 ✓）\n23:20~02:00 同告警每 5 分钟重发 32 次，无人响应\n02:11 主库连接耗尽，下单全停\n→ 告警送达了，响应没有——从"可以救"到"救不了"，宽窗口 2 小时 51 分钟。',
      },
    },
    {
      id: 'a-rules',
      name: '审计全部告警规则',
      desc: '告警体系的设计缺陷清单',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-design'],
      hypotheses: [{ id: 'h-design', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '告警体系审计',
        text: '187 条告警规则：100% 固定阈值、0 分级、0 聚合、0 抑制、0 静默窗口。\n→ 无 P0~P3 分级；同源告警不聚合；关联故障无抑制；维护窗口无静默。\n风暴是体系设计的必然输出，昨夜只是第一次撞上大促前夜。',
      },
    },
    {
      id: 'a-response',
      name: '统计近三周的值班响应率',
      desc: '狼来了效应有没有发生',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-fatigue'],
      hypotheses: [{ id: 'h-fatigue', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '响应率曲线',
        text: '近三周该群告警响应率：W1 78% → W2 34% → W3 9%。\n同期日均告警量：210 → 340 → 380 条，其中 97% 为重复/低价值。\n→ 狼来了效应实锤：人对告警的响应率，是告警体系健康度的反向指标。',
      },
    },
    {
      id: 'a-channel',
      name: '核查通知送达链路',
      desc: '排除渠道故障',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-channel'],
      hypotheses: [{ id: 'h-channel', status: 'excluded' }],
      result: {
        type: 'text',
        title: '送达核对',
        text: '告警平台发送记录：523 条全部送达值班群（含 P0 前兆）。\n→ 渠道无辜：送到了，被淹了。',
      },
    },
    {
      id: 'a-skill',
      name: '访谈值班工程师小王',
      desc: '排除能力因素',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-skill'],
      hypotheses: [{ id: 'h-skill', status: 'excluded' }],
      result: {
        type: 'text',
        title: '小王的陈述',
        text: '"前两周处理的全是重启就能好的超时告警，我以为这批也是。"\n"主库那条我没看到——翻到第 40 屏的时候我已经在处理第 3 次重启了。"\n→ 能力无问题：给任何人 500 条同级告警，都会漏。',
      },
    },
    {
      id: 'a-benchmark',
      name: '对标业界告警设计',
      desc: '分级/聚合/抑制/收敛的差距清单',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-design'],
      hypotheses: [{ id: 'h-design', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '差距清单',
        text: '分级：P0 电话呼叫 / P1 群置顶 / P2 群普通 / P3 日报 ← 现状全无\n聚合：同源症状收敛为一个"事件" ← 现状每 15s 重发\n抑制：根因告警触发时自动静默下游症状告警 ← 现状全无\n→ 四项补齐后预估告警量：523 → 3 条（P0 前兆 1 + 事件 1 + 恢复 1）。',
      },
    },
    {
      id: 'a-redesign',
      name: '重构告警分级与聚合',
      desc: '【状态变更】分级/聚合/抑制三件套上线',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重构结果',
        text: 'P0 电话呼叫 + P1 群置顶；同源告警收敛为事件（15s 重发改事件更新）；\n主库慢查询触发时自动抑制下游超时类告警。\n灰度一周：日均告警 380 → 4 条，P0 触达 100% 电话呼叫。',
      },
    },
    {
      id: 'a-blame',
      name: '把小王记为事故责任人',
      desc: '【状态变更】按人因事故处理',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '这个决定的效果',
        text: '小王被通报批评。下个月的值班响应率进一步降到 4%，两位工程师申请调岗。\n→ 给人的系统加人的责罚，只会加速系统的崩溃。此选项仅作为反面教学：真正的修复在体系。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-design', text: '告警体系设计缺陷：187 条规则 100% 固定阈值、零分级零聚合零抑制——一个 DB 慢查询根因产出 523 条同权告警淹没 P0 前兆，漏看是体系的必然输出而非人的过失', correct: true },
    { id: 'rc-fatigue', text: '值班工程师连续三周被低价值告警训练出忽略习惯（响应率 78%→9%）', correct: false },
    { id: 'rc-channel', text: '通知渠道故障，P0 告警未送达', correct: false },
    { id: 'rc-skill', text: '值班工程师能力不足，看不懂告警', correct: false },
  ],

  expertCost: 9,
  restartActionId: 'a-blame',

  expertChain: [
    {
      thought: '先别急着定责——统计五百条告警的构成画像，看看风暴是"很多问题"还是"一个问题的一千张脸"。',
      update: '523 条 = 一个主库慢查询根因 × 无聚合无分级；P0 前兆与其他告警完全同权。',
      actionId: 'a-impact',
      why: '1⚡ 告警画像是分诊第一步：风暴是"很多问题"还是"一个问题的一千张脸"，决定了修人还是修体系。',
      conclusion: '同源风暴确认 → 还原 P0 前兆的响应时间线。',
    },
    {
      thought: '还原那条被淹没的 P0 前兆：它送达了吗？什么时候送的？——"没看到"和"没送到"是两种事故。',
      update: '告警送达了，前兆窗口 2 小时 51 分钟无人响应——"没看到"实锤，但原因待查。',
      actionId: 'a-timeline',
      why: '2⚡ 时间线还原区分两种事故：渠道故障（没送到）与信息淹没（送到了没看到）——前者修渠道，后者修体系。',
      conclusion: '送达实锤 + 响应缺失 → 继续查为什么没人看。',
    },
    {
      thought: '审告警规则的设计本身：分级、聚合、抑制、静默——四个能力一个一个对。',
      update: '187 条规则全是固定阈值，四个能力全部为零——体系从设计上就无法区分 P0 和 P3。',
      actionId: 'a-rules',
      why: '2⚡ 体系审计直击根因：当所有告警长一个样，"漏掉重要的"就不是人的失误，而是体系的数学必然。',
      conclusion: '体系缺陷实锤 → 对标业界量化差距。',
    },
    {
      thought: '响应率曲线和小王的陈述证明：任何人在 500 条同权告警里都会漏——人因是体系缺陷的结果，不是原因。',
      update: '停止定责。修复分级/聚合/抑制三件套；小王的"处理"选项本身就是反面教材。',
      actionId: '',
      why: '【停止规则】证据完全闭合：送达 ✓、淹没 ✓、体系四能力为零 ✓、狼来了效应 ✓。给体系缺陷记人过，只会加速崩溃。',
      conclusion: '重构分级/聚合/抑制三件套（告警 380→4 条，P0 电话触达）；响应率作为告警体系健康度的常驻指标。',
    },
  ],

  lessons: [
    {
      text: '告警是为人服务的：信噪比就是可用性——没有人能在 500 条同权告警里保证不漏。',
      principle: '产品思维：告警系统的"用户"是凌晨三点半的值班工程师。日均告警量的响应率曲线是体系健康度的反向指标——响应率跌破 50%，体系已经在制造事故。',
    },
    {
      text: '同源告警必须聚合：一个根因的五百个症状，应该收敛成一条带计数的事件，而不是五百条独立告警。',
      principle: '告警三件套：分级（P0 电话/P1 置顶/P2 普通）、聚合（同源收敛为事件带计数）、抑制（根因告警触发时静默下游症状）。三者缺一，风暴只是时间问题。',
    },
    {
      text: '每一条告警都必须"需要一个人类做决策"，否则它是日志，不是告警。',
      principle: '告警资格测试：收到这条告警后，值班员应该做什么？答不出具体动作的告警，降级为日报或删除——告警的价值在于"可行动"，不在于"我记得配过它"。',
    },
    {
      text: '狼来了效应是真实的可用性事故：响应率 78%→9% 的曲线，就是 P0 被漏掉的完整前史。',
      principle: '沉淀思维：把"值班响应率"做成监控指标——它恶化是告警体系在制造麻痹，修复它比修任何一个阈值都更能提升可用性。',
    },
  ],
}
