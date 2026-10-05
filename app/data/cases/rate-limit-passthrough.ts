import { DiagnosisCase } from '../../types/case'

/**
 * B6-1 · evolution L2
 * 主训思维：架构设计（限流阈值 = 容量契约：一刀切的数字保护不了最弱的下游）
 * 次训思维：产品思维（合法流量的误伤是真实的用户体验损失）
 * 真实原型：新服务限流 1000 QPS 拍脑袋定的，营销活动 3000 QPS 被拦 2/3；上调限流后弱下游被穿透
 * 情绪兽设计：惊讶獭（惊讶）——"限流是保护，但先害了自己的用户"
 * 检查单：思维型 3 + 知识型 1
 */
export const rateLimitPassCase: DiagnosisCase = {
  id: 'rate-limit-passthrough',
  title: '限流 1000 QPS——拦住了自己人',
  intro: '新服务上线时限流 1000 QPS（"先设个安全的值"）。营销活动流量 3000 QPS，三分之二的合法请求被拦截——上调限流后，弱下游立刻被打挂。',
  domain: 'runtime',
  layer: '限流是容量契约：一刀切的数字保护不了最弱的下游——契约要按容量逐个签',
  part: 'master',
  chapterId: 'evolution',
  order: 1,
  typeTags: ['architecture', 'capacity'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」新服务"积分商城"的后端。营销活动 10 分钟后开始，你接到告警：积分商城接口被网关大量拦截。',
    architecture: 'App → 网关限流(积分商城: 1000 QPS) → 积分商城服务 → 积分DB',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '网关限流日志',
        text: '被拦截 QPS：2000/秒（合法流量，非攻击）\n拦截响应：429 Too Many Requests\n用户侧：营销活动页面无法加载积分商城。',
      },
      {
        type: 'text',
        title: '限流配置',
        text: '限流阈值：1000 QPS（服务上线时设置，"先设个安全的值"）\n限流维度：全局限流（不分接口、不分用户等级）\n来源：服务创建时的默认模板。',
      },
    ],
    timeline: '限流设置：服务上线时 ｜ 营销活动：10 分钟后开始 ｜ 预估活动流量：3000 QPS ｜ 限流从未调整',
    impactHint: '1000 是谁定的？——不是压测出来的，不是下游要求的，是"先设个安全的值"。',
  },

  hypotheses: [
    { id: 'h-limitlow', text: '限流阈值 1000 过低：营销活动 3000 QPS 远超阈值，合法流量被拦', excludeActionId: 'a-limitlog' },
    { id: 'h-capacity', text: '积分商城服务本身只能扛 1000：上调限流会导致下游崩溃', excludeActionId: 'a-capa' },
    { id: 'h-db', text: '积分 DB 扛不住高并发', excludeActionId: 'a-db' },
    { id: 'h-attack', text: '恶意流量攻击，限流在正常工作', excludeActionId: 'a-attack' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '查限流拦截日志的构成',
      desc: '被拦的是合法流量还是攻击流量',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [{ id: 'h-attack', status: 'excluded' }],
      result: {
        type: 'text',
        title: '拦截日志分析',
        text: '被拦 IP 分布：来自 3200 个不同 IP、无异常 UA、无重复模式。\n用户来源：营销活动推送带来的正常用户（APP 推送打开率 35%）。\n→ 合法流量被拦，不是攻击。',
      },
    },
    {
      id: 'a-limitlog',
      name: '评估限流阈值与实际流量的差距',
      desc: '1000 vs 3000，差距有多大',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-limitlow'],
      hypotheses: [{ id: 'h-limitlow', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '阈值差距',
        text: '限流阈值 1000 QPS，营销活动预估 3000 QPS——差距 3 倍。\n阈值来源：服务创建时的默认模板值，从未根据业务调整。\n→ "先设个安全的值"在上线时是安全的，在业务增长后就成了瓶颈。',
      },
    },
    {
      id: 'a-capa',
      name: '压测积分商城服务容量',
      desc: '服务本身能扛多少',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-capacity'],
      hypotheses: [{ id: 'h-capacity', status: 'excluded' }],
      result: {
        type: 'text',
        title: '压测结果',
        text: '积分商城服务压测：稳定承载 5000 QPS，P99 < 80ms。\n→ 服务本身扛得住：瓶颈不在服务，在网关限流配置。',
      },
    },
    {
      id: 'a-db',
      name: '查积分 DB 的容量',
      desc: '排除 DB 瓶颈',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-db'],
      hypotheses: [{ id: 'h-db', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'DB 容量',
        text: '积分 DB：读写分离 + 连接池充足，QPS 承载 > 8000。\n→ DB 不是瓶颈。',
      },
    },
    {
      id: 'a-attack',
      name: '排查恶意流量特征',
      desc: '排除攻击流量',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-attack'],
      hypotheses: [{ id: 'h-attack', status: 'excluded' }],
      result: {
        type: 'text',
        title: '攻击排查',
        text: '被拦流量来自正常用户会话（有登录态、有 APP 推送点击追踪）。\n→ 合法用户确认。',
      },
    },
    {
      id: 'a-fixlimit',
      name: '上调限流至 6000 QPS 并全量生效',
      desc: '【状态变更】基于压测结果上调限流阈值',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '上调结果',
        text: '限流阈值 1000 → 6000 QPS（基于压测 5000 + 20% 余量）。\n→ 营销活动流量 3000 QPS 全部通过，接口 P99 60ms，用户正常访问积分商城。',
      },
    },
    {
      id: 'a-confighist',
      name: '查限流配置的变更历史',
      desc: '阈值从上线至今调整过几次',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-limitlow'],
      hypotheses: [{ id: 'h-limitlow', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '配置变更历史',
        text: '配置中心记录：限流阈值自服务上线 8 个月以来零变更；\n同期积分商城 DAU 增长 6 倍、已有两次活动流量接近阈值。\n→ 阈值从未跟随业务更新——"容量契约"形同虚设，且早有前兆。',
      },
    },
    {
      id: 'a-rollback',
      name: '关闭营销活动页止血',
      desc: '【状态变更】暂时关闭积分商城入口，等限流调整',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '关闭积分商城入口后告警消失。\n→ 止血成功；但营销活动页的用户被迫等待——活动体验受损。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-limitlow', text: '核心问题：限流阈值 1000 QPS 是上线时的默认模板值，从未根据业务增长调整——营销活动 3000 QPS 有 2/3 被拦截', correct: true },
    { id: 'rc-capacity', text: '积分商城服务容量不足', correct: false },
    { id: 'rc-db', text: '积分 DB 扛不住高并发', correct: false },
    { id: 'rc-attack', text: '恶意流量攻击，限流正常工作', correct: false },
  ],

  expertCost: 5,
  restartActionId: 'a-rollback',

  expertChain: [
    {
      thought: '先看被拦的是谁：如果是攻击流量，限流在工作；如果是合法流量，限流是瓶颈。',
      update: '被拦流量来自 3200 个不同 IP 的正常登录用户——合法流量被误拦，限流阈值是瓶颈。',
      actionId: 'a-impact',
      why: '1⚡ 区分"保护"和"误伤"是限流排查的第一步：看被拦流量的来源（IP 分布/登录态/UA）就能判断限流是在保护还是在阻碍。',
      conclusion: '合法流量误拦确认 → 评估阈值与流量的差距。',
    },
    {
      thought: '压测服务本身：确认服务扛得住 3000，那瓶颈就在网关限流配置。',
      update: '服务压测 5000 QPS 通过 → 瓶颈不在服务，在网关限流 1000。',
      actionId: 'a-capa',
      why: '2⚡ 压测确认服务容量：排除"服务真的扛不住"的可能性——上调限流才安全，否则只是把限流问题变成服务崩溃。',
      conclusion: '服务容量确认 → 调整限流阈值。',
    },
    {
      thought: '查配置变更历史：阈值有没有随业务增长更新过——之前是否已有前兆。',
      update: '8 个月零变更 + DAU 涨 6 倍 + 两次活动接近阈值——前兆早就在，只是没人看契约。',
      actionId: 'a-confighist',
      why: '1⚡ 配置历史把"偶发失误"升级为"流程缺失"：问题不是这次忘了调，是没有任何机制提醒调。',
      conclusion: '修复要双层：当下上调阈值 + 流程上把容量评估纳入活动准备。',
    },
    {
      thought: '阈值来源是默认模板——"先设个安全的值"在上线时是安全的，但业务增长后就成了瓶颈。DB 也不是瓶颈。',
      update: '停止排查。阈值上调 + 建立动态调整机制。',
      actionId: '',
      why: '【停止规则】合法流量 ✓ 服务容量 ✓ DB 容量 ✓——三项确认，瓶颈唯一指向限流阈值。上调即可解决。',
      conclusion: '限流上调 6000 + 建立业务增长时的阈值调整流程。',
    },
  ],

  lessons: [
    {
      text: '"先设个安全的值"在上线时是安全的，在业务增长后就成了瓶颈——限流阈值是容量契约，需要随业务增长更新。',
      principle: '架构设计：限流阈值的生命周期 = 上线设置 → 业务增长后调整 → 大促前压测验证。它不是一次性配置，是容量契约的持续维护。',
    },
    {
      text: '上调限流前必须压测服务容量：排除"服务真的扛不住"——否则只是把限流问题变成服务崩溃。',
      principle: '架构设计：上调限流的流程 = 压测确认服务容量 → 基于容量+余量设阈值 → 灰度调整 → 监控。跳过压测直接上调，等于把限流问题转移到下游。',
    },
    {
      text: '区分"保护"和"误伤"：看被拦流量的来源（IP 分布/登录态/UA）——攻击流量的特征与合法流量完全不同。',
      principle: '安全思维：限流排查第一步看被拦流量的特征——正常用户有登录态和推送追踪，攻击流量有异常 UA 和 IP 集中度。',
    },
    {
      text: '限流阈值的管理应纳入"容量契约"体系：每次业务活动前评估预估流量 vs 当前阈值。',
      principle: '沉淀思维：限流阈值不是静态配置——建立"业务活动前容量评估"流程，让阈值调整成为活动准备的标准步骤而非事后救火。',
    },
  ],
}
