import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 接入层之夜（DNS 劫持 L2）
 * 教学点：DNS 解析链路（本地缓存→运营商→权威）；"部分用户+特定地域"形状；TTL 决定恢复速度。
 * 专家路径：impact(1) + dnsquery(1) + compare(2) = 4⚡
 */
export const dnsHijackCase: DiagnosisCase = {
  id: 'dns-hijack',
  title: '只有某省的用户进不来',
  intro: '客服收到集中反馈：某省用户 App 全部提示网络异常，其他省份一切正常。',
  domain: 'network',
  layer: 'DNS 解析链路：域名到 IP 之间隔着缓存、运营商和权威服务器',
  part: 'engineer',
  chapterId: 'access',
  order: 1,
  typeTags: ['config', 'dependency', 'timing'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」电商的运维，早上 9 点客服群开始集中反馈某省用户无法访问。',
    architecture: '用户 → 本地 DNS → 权威 DNS → CDN 节点 → 服务',
    symptoms: [
      {
        type: 'error',
        title: '用户反馈',
        text: '某省用户 App 全部提示"网络异常"，网页版打不开。\n该省之外的用户零反馈。',
      },
      {
        type: 'text',
        title: '服务端监控',
        text: '该省的 CDN 节点带宽跌零；服务器本身零报错——用户的请求根本没到达你这里。',
      },
    ],
    timeline: '09:00 反馈集中出现 ｜ 前一天无任何变更 ｜ 该省 CDN 节点上周刚做过调度调整',
    impactHint: '先确认：是这个省的网络问题，还是你的服务对这个省下线了？',
  },

  hypotheses: [
    { id: 'h-dns', text: '该省 DNS 解析被污染/劫持，域名解析到错误 IP', excludeActionId: 'a-dnsquery' },
    { id: 'h-cdn', text: '该省 CDN 节点故障', excludeActionId: 'a-cdn' },
    { id: 'h-isp', text: '该省运营商骨干网络故障', excludeActionId: 'a-compare' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定受影响范围',
      desc: '按地域/运营商/端 统计',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '影响范围',
        text: '仅某省受影响，且该省三大运营商都受影响；\n其他省份零反馈；服务端监控显示该省请求量跌零（不是变慢）。',
      },
    },
    {
      id: 'a-dnsquery',
      name: '用该省探测点查域名解析',
      desc: '对比该省与正常省份的解析结果',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-dns'],
      hypotheses: [{ id: 'h-dns', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '各地解析结果对比',
        text: '正常省份: cdn.example.com → 112.84.xx.xx（该省 CDN 节点）\n该省探测点: cdn.example.com → 61.147.xx.xx（一个陌生 IP，不属于自己的任何节点）\n→ 该省解析到了错误 IP：DNS 污染/劫持实锤',
      },
    },
    {
      id: 'a-cdn',
      name: '查该省 CDN 节点状态',
      desc: '节点健康度与上周调度调整',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-cdn'],
      hypotheses: [{ id: 'h-cdn', status: 'down' }],
      result: {
        type: 'text',
        title: 'CDN 节点状态',
        text: '节点健康检查全绿，带宽跌零是因为没有流量进来——节点本身没挂。\n上周的调度调整只影响解析结果，不改变节点健康度。',
      },
    },
    {
      id: 'a-compare',
      name: '对比探测：该省访问已知正常 IP',
      desc: '绕过域名直接访问正确 IP，验证网络通路',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-isp'],
      hypotheses: [{ id: 'h-isp', status: 'excluded' }],
      result: {
        type: 'text',
        title: '直连测试',
        text: '该省探测点直连正确 IP（112.84.xx.xx:443）：通！\n→ 网络通路正常，问题只在"域名→IP"这一步。',
      },
    },
    {
      id: 'a-switchdns',
      name: '切换权威 DNS 服务商',
      desc: '【状态变更】把域名解析切到备用 DNS 服务商',
      cost: 7,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '切换结果',
        text: '切换申请提交，但 TTL 还没到期，该省用户要等缓存过期才能恢复。\n→ 切换不能立即生效——TTL 是 DNS 世界的"缓存到期时间"。',
      },
    },
    {
      id: 'a-applog',
      name: '查该省用户 App 客户端日志',
      desc: '用户端报的是 DNS 失败还是连接失败',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-dns', 'h-isp'],
      hypotheses: [{ id: 'h-dns', status: 'up' }],
      result: {
        type: 'log',
        title: '客户端日志采样',
        text: 'UnknownHostException: cdn.example.com——域名解析失败的专属异常。\n→ 客户端日志再次指向 DNS。',
      },
    },
    {
      id: 'a-whois',
      name: '查陌生 IP 归属',
      desc: '61.147.xx.xx 是谁家的',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-dns'],
      hypotheses: [{ id: 'h-dns', status: 'up' }],
      result: {
        type: 'text',
        title: 'IP 归属',
        text: '归属：某广告公司的 CDN 缓存集群。\n→ 典型的 DNS 劫持流量变现：域名被解析到广告节点。',
      },
    },
    {
      id: 'a-hosts',
      name: '应急：指导用户改 hosts / 切 HTTPDNS',
      desc: '绕过被污染的本地 DNS',
      cost: 3,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '应急效果',
        text: '用 HTTPDNS 的测试用户立即恢复访问。\n→ 应急止血有效；长期方案是 App 接入 HTTPDNS + 多域名容灾。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-dns', text: '该省本地 DNS 被污染/劫持，域名解析到广告公司 IP，用户请求根本没出发', correct: true },
    { id: 'rc-cdn', text: '该省 CDN 节点故障导致无响应', correct: false },
    { id: 'rc-isp', text: '该省运营商骨干网络中断', correct: false },
  ],

  expertCost: 4,
  restartActionId: '',

  expertChain: [
    {
      thought: '只有某省出问题——地域形状是最强的分叉信号。先确认是"服务对这个省下线"还是"这个省上不了网"。',
      update: '监控显示该省请求量跌零：请求根本没到达服务器，问题在用户侧的链路上游。',
      actionId: 'a-impact',
      why: '1⚡ 买形状：请求跌零（没出发）vs 变慢（在路上）vs 报错（到了但失败）——三种形状对应三个完全不同的排查方向。',
      conclusion: '请求没到达 + 仅某省 → DNS 解析或该省出网链路，二选一。',
    },
    {
      thought: '区分 DNS 和骨干网最便宜的方法：找该省的探测点直接查域名解析。',
      update: '准备实锤。',
      actionId: 'a-dnsquery',
      why: '1⚡ 一步到位：解析结果对不对一眼可见，比逐段排查链路便宜得多。',
      conclusion: '该省解析到陌生广告 IP → DNS 污染/劫持实锤。',
    },
    {
      thought: '实锤后还要补两块：确认网络通路正常（排除叠加故障）+ 查陌生 IP 是谁（定性）。直连测试更便宜先做。',
      update: '排他验证：绕过域名直连正常 IP。',
      actionId: 'a-compare',
      why: '2⚡ 确认"通路正常"很重要——如果直连也不通就是叠加故障，处置方案完全不同。',
      conclusion: '直连通 → 排除叠加故障，纯 DNS 问题。应急方案（HTTPDNS/hosts）可行性确认。',
    },
    {
      thought: '证据链闭合：解析到错误 IP（实锤）+ 直连正常（通路好）+ 该省独有（污染范围）。停止收集。',
      update: '停止，进入应急与追责。',
      actionId: '',
      why: '根因、影响、应急方案都已明确；找谁追责（查 IP 归属）不阻塞止血。',
      conclusion: '应急：HTTPDNS + 指导改 hosts；追责：向该省运营商投诉 DNS 污染；长期：App 接入 HTTPDNS 容灾。',
    },
  ],

  lessons: [
    {
      text: '"只有某省/某运营商"的形状 → 优先怀疑 DNS 污染，而不是自己的服务。',
      principle: 'DNS 解析链路经过本地缓存、运营商递归、权威服务器多层——任何一环被污染，该区域用户就会"集体迷路"，而你的服务端监控只会看到该区域流量归零。',
    },
    {
      text: '请求量"跌零"和"变慢"是两种完全不同的故障形状。',
      principle: '跌零 = 请求根本没出发（DNS/路由/客户端）；变慢 = 请求在路上或服务端处理慢。形状判断让假设空间在第一分钟就砍掉一半。',
    },
    {
      text: 'DNS 劫持的应急是"绕过"（HTTPDNS/hosts），长期是"容灾"（多域名+多解析商）。',
      principle: 'DNS 污染不在你的控制面内：你修不了运营商的 DNS，只能让 App 不依赖它——HTTPDNS 走加密通道直接问权威，是多租户 App 的标配备灾。',
    },
  ],
}
