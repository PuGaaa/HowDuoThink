import { DiagnosisCase } from '../../types/case'

/**
 * 第 7 章 · 网络深处 第四批（IPv6 黑洞回退 L2）
 * 教学点：全栈视野——双栈发布的顺序铁律：服务端就绪先于客户端记录；
 * 回退超时是用户在替架构买单；连接建立阶段要独立监控。
 * 专家路径：impact(1) + connectlog(2) + repro(1) = 4⚡︎
 */
export const happyEyeballsCase: DiagnosisCase = {
  id: 'happy-eyeballs',
  title: 'IPv6 上线后，一部分用户慢了三秒',
  intro: 'IPv6 改造上线后部分用户首请求慢 3 秒：v6 连接黑洞 3 秒后回退 v4——等待发生在协议栈，没人看见。',
  domain: 'network',
  layer: '双栈发布的顺序铁律——服务端就绪先于客户端记录',
  part: 'master',
  chapterId: 'network',
  order: 7,
  typeTags: ['network', 'config', 'deploy'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」App 的网络负责人，运营商 IPv6 改造的"首批接入标杆"正在变成投诉源。',
    architecture: 'App(双栈) → DNS(A + AAAA 记录) → 网关(IPv4 就绪, IPv6 链路后端未全通) ｜ 慢用户：v6-only 网络(校园网/部分运营商)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '慢请求画像',
        text: 'v6-only 网络用户：首请求延迟稳定 +3 秒（总时长 3.1~3.3s），后续请求正常。\n错误率零：最终都成功了——只是每人的"第一次"都很难受。',
      },
      {
        type: 'text',
        title: '时间线',
        text: '上周 DNS 添加 AAAA 记录（运营商改造验收要求）。\n网关 v6 LB 已配置，但后端服务的 v6 链路（安全组/健康检查/监听）仅完成 60%。',
      },
    ],
    timeline: 'AAAA 记录 7 天前上线 ｜ 慢投诉 3 天前开始（运营商逐步把用户切到 v6-only）｜ 后端 v6 改造"计划月底完成"',
    impactHint: '慢的精确值是 3 秒、且只慢"第一连"——3 秒是谁的超时？第一连之后为什么又好了？',
  },

  hypotheses: [
    { id: 'h-v6fallback', text: 'AAAA 指向的 v6 链路未就绪：v6 SYN 无响应黑洞 3 秒，客户端回退 v4 才成功', excludeActionId: 'a-connectlog' },
    { id: 'h-dnsdelay', text: '部分运营商递归 DNS 解析慢，首请求被解析拖住', excludeActionId: 'a-dnstime' },
    { id: 'h-tls', text: 'v6 路径 TLS 握手慢（证书链/OCSP 查询）', excludeActionId: 'a-tlstime' },
    { id: 'h-rtt', text: 'v6 路由绕远，路径 RTT 本身大', excludeActionId: 'a-rttcmp' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '按用户网络类型切分慢请求',
      desc: '影响面：慢的分界线、慢的阶段、慢的精确值',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '慢请求三维画像',
        text: '用户维度：慢用户 100% 位于 v6-only 网络（校园网 41%、运营商 v6 试点 59%）\n阶段维度：慢在 TCP 连接建立（connect），请求处理与 TLS 正常\n数值维度：+3.0~3.2s——精确的"超时整数"，不是抖动长尾\n→ 慢发生在"选路阶段"：v4 与 v6 之间的选择出了问题。',
      },
    },
    {
      id: 'a-connectlog',
      name: '解剖客户端连接建立日志',
      desc: '慢的 3 秒里，协议栈在干什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-v6fallback'],
      hypotheses: [{ id: 'h-v6fallback', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '连接时序解剖（端上埋点）',
        text: 't0     DNS 解析：AAAA + A 都拿到（双栈记录）\nt0+0.1 首选 v6：SYN → 61:dd8c::20 …无响应（黑洞）\nt0+3.0 v6 超时 → 客户端回退逻辑启动\nt0+3.1 v4 SYN → 立即响应 → 连接建立 ✓\n后续请求：直连 v4（记录了失败），所以"第二次就好了"\n实锤：AAAA 指向的 v6 链路未全通（后端监听/安全组 60% 完成）——SYN 进得去、没人应答，黑洞 3 秒由用户支付。',
      },
    },
    {
      id: 'a-repro',
      name: '受控环境复现：v6-only + 单栈对照',
      desc: '变量隔离：v6 链路通与不通的对照实验',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '对照实验',
        text: 'v6-only 网络（校园网点位）：\n  AAAA+A（现状）→ 首连 3.1s（v6 黑洞→回退）100% 复现\n  仅 A 记录     → 首连 90ms\nv4-only 网络：两种记录无差异\n→ 变量彻底隔离：慢 = v6-only 用户 × v6 黑洞。修复验收线也由此产生：v6-only 首连 < 200ms。',
      },
    },
    {
      id: 'a-dnstime',
      name: '核对解析耗时',
      desc: '排除 DNS 慢',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-dnsdelay'],
      hypotheses: [{ id: 'h-dnsdelay', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'DNS 核对',
        text: '端上解析耗时 P99 80ms（AAAA+A 并行查询）；慢的 3 秒里解析只占 0.1s。\n→ 排除 DNS。',
      },
    },
    {
      id: 'a-tlstime',
      name: '核对 TLS 握手时长',
      desc: '排除握手层',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-tls'],
      hypotheses: [{ id: 'h-tls', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'TLS 核对',
        text: 'v4/v6 成功连接的 TLS 握手时长一致（120ms 级）；慢段在 TCP SYN 阶段，TLS 还没开始。\n→ 排除 TLS。',
      },
    },
    {
      id: 'a-rttcmp',
      name: '对比 v6 成功连接的 RTT',
      desc: '排除"v6 路径本身慢"',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-rtt'],
      hypotheses: [{ id: 'h-rtt', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'RTT 核对',
        text: '极少数成功建立的 v6 连接 RTT 1.2ms（与 v4 相当）——路径质量没问题，问题是"大部分 SYN 没人应答"。\n→ 排除路由绕远：是可用性问题不是质量问题。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急摘除 AAAA 记录',
      desc: '【状态变更】DNS 下线 AAAA，全部流量回 v4',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '摘除结果',
        text: 'v6-only 用户首连恢复 90ms——投诉止。\n代价：运营商 IPv6 改造验收指标回落（改造标杆身份风险）；\n且这周内 v6 后端本来就要就绪——摘除是对的止血，但要及时恢复，否则为 3 秒丢掉验收。',
      },
    },
    {
      id: 'a-fixready',
      name: '修复：v6 链路全通 + Happy Eyeballs + 恢复 AAAA',
      desc: '【状态变更】补齐后端 v6 就绪；客户端实现 v4/v6 竞速；灰度恢复 AAAA',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 后端 v6 链路补齐（安全组/监听/健康检查逐项验收，端到端 v6 探测通过）\n② 客户端实现 Happy Eyeballs（v4/v6 并行竞速，先连通用谁，v6 失败不再干等 3 秒）\n③ AAAA 灰度恢复：10% → 50% → 100%，v6-only 首连 P95 180ms。\n双栈真正可用：v6 用户自然走 v6，不再有人付 3 秒的学费。',
      },
    },
    {
      id: 'a-fixmon',
      name: '沉淀：连接阶段分协议栈监控',
      desc: '【状态变更】端上埋点上报 connect 分解耗时（v4/v6 各自的 connect/TLS），回退事件计数',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控 v2',
        text: '连接建立阶段独立埋点：DNS / connect(v4) / connect(v6) / TLS 分段上报；\n"v6 回退事件"计数告警——回退率 > 1% 即告警，黑洞在第 1 个用户就现形。',
      },
    },
    {
      id: 'a-fixchecklist',
      name: '沉淀：新协议上线检查单',
      desc: '【状态变更】协议升级清单（AAAA/HTTP3/gRPC…）：服务端就绪验收 → 端上灰度 → 回退保障 三段式',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '检查单 v2',
        text: '任何"新增协议入口"三段式：\n① 服务端端到端就绪验收（真实链路探测，不是配置检查）\n② 客户端侧记录后灰度放量\n③ 回退路径有预算（并行竞速/快速回退），用户永远不该为架构过渡买单。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-v6fallback', text: 'AAAA 记录先于 v6 链路就绪上线：v6-only 用户 SYN 进 v6 LB 但后端仅 60% 就绪——SYN 黑洞 3 秒后客户端回退 v4；回退超时是用户在替架构过渡买单', correct: true },
    { id: 'rc-dnsdelay', text: '部分运营商递归解析慢拖住首请求', correct: false },
    { id: 'rc-tls', text: 'v6 路径 TLS 握手慢', correct: false },
    { id: 'rc-rtt', text: 'v6 路由绕远导致路径 RTT 大', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '精确 +3 秒、只慢第一连、只慢 v6-only 用户——三维画像先读指纹。',
      update: '慢在 connect 阶段、值为超时整数、人群与 v6 改造同步扩大——"选路"是问题，"选路的结果"是答案。',
      actionId: 'a-impact',
      why: '1⚡︎ 三维切分（人群/阶段/数值）各自给出一条线索且相互印证：3 秒是超时指纹，v6-only 是人群指纹——两条指纹交汇在"v6 连接"。',
      conclusion: '嫌疑锁定：v6 连接黑洞（h-v6fallback 升权）。',
    },
    {
      thought: '解剖端上连接日志：3 秒里协议栈的每一步——SYN 发给谁、谁没应答、回退怎么发生。',
      update: '实锤：v6 SYN 黑洞 → 3s 超时回退 v4 立即成功；根因是 AAAA 先行、v6 后端仅 60% 就绪。',
      actionId: 'a-connectlog',
      why: '2⚡︎ 端上连接埋点把"用户觉得慢"还原成协议栈的逐帧动作：SYN 无应答的"黑洞"只有在 connect 分解数据里可见——服务端监控全绿（因为流量最终都到了），盲区只在客户端。',
      conclusion: '根因实锤：双栈发布顺序颠倒。',
    },
    {
      thought: '受控复现钉死变量：v6-only 环境 × 两种 DNS 记录的对照——因果与验收线同时产出。',
      update: 'AAAA+A 复现 3.1s、仅 A 归零——变量隔离完成；修复验收（v6-only 首连 < 200ms）随之确立。',
      actionId: 'a-repro',
      why: '1⚡︎ 对照实验同时完成因果确认与验收定义：修复不是"感觉变快了"，而是"v6-only 首连 P95 < 200ms"的可度量标准。',
      conclusion: '因果钉死 → 排除解析/TLS/路径。',
    },
    {
      thought: 'DNS/TLS/RTT 三个常规嫌疑各 1⚡︎ 排除——尤其 RTT：v6 路径慢是大众直觉，数据说路径没问题、是黑洞。',
      update: '解析 80ms、TLS 两栈一致、v6 成功连接 RTT 正常——三个假设有证据排除。',
      actionId: 'a-dnstime',
      why: '1⚡︎ 排除"直觉解释"要最先做：v6 慢的直觉是"绕远/加密慢"，但成功连接的 RTT 与 TLS 数据直接反驳——直觉被数据替换，修复才不会指向错误方向。',
      conclusion: '嫌疑收敛单点 → 止血与修复分层。',
    },
    {
      thought: '止血（摘 AAAA）、修复（v6 全通+Happy Eyeballs+灰度恢复）、防线（分段监控+协议上线清单）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（黑洞回退）✓ 顺序（记录先于就绪）✓ 防线（回退预算+检查单）✓——机制、流程、观测三层闭合。',
      conclusion: '沉淀：双栈发布的顺序铁律——服务端端到端就绪先于客户端记录上线。回退路径要有预算（Happy Eyeballs 竞速），用户永远不该为架构过渡买单。',
    },
  ],

  lessons: [
    {
      text: '双栈发布有顺序铁律：服务端端到端就绪（真实链路探测）先于客户端记录（AAAA）上线——顺序颠倒，黑洞由用户支付。',
      principle: '发布设计：协议入口的"记录"（DNS AAAA/Alt-Svc/端口开放）是承诺，承诺前必须有端到端就绪验收——配置检查 ≠ 链路可用。过渡期必须有回退预算：Happy Eyeballs 竞速让"等超时"变成"并行选路"。',
    },
    {
      text: '服务端监控全绿 ≠ 用户侧可用：SYN 黑洞的流量最终都到了（回退后），服务端视角一片祥和——盲区只在客户端的连接阶段。',
      principle: '可观测性设计：连接建立要分段埋点（DNS/connect/TLS，v4/v6 分列）+ 回退事件计数。回退率是"架构过渡期用户体验"的哨兵——> 1% 即告警，黑洞在第 1 个用户就现形。',
    },
    {
      text: '"精确的超时值"是协议行为的指纹：+3s 不是网络慢，是某个定时器到期——从数值反查协议栈的行为表。',
      principle: '验证思维：网络类问题的延迟值要当作指纹读：整数倍（定时器互等）、精确常数（超时回退）、抖动长尾（资源竞争）各有其形。指纹定性质后，端上埋点/抓包给出逐帧证据。',
    },
  ],
}
