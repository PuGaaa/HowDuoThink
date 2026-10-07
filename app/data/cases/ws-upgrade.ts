import { DiagnosisCase } from '../../types/case'

/**
 * 第 2 章 · 接入层之夜 第二批（WebSocket 升级头被吞 L2）
 * 教学点：全栈视野——WebSocket 升级三件套（Upgrade/Connection/HTTP1.1）必须逐跳透传；
 * "本地好、线上坏"的差异藏在中间层；网关配置合并是最常见的回归源。
 * 专家路径：impact(1) + nginxdump(2) + origincmp(1) = 4⚡︎
 */
export const wsUpgradeCase: DiagnosisCase = {
  id: 'ws-upgrade',
  title: '推送功能上线即翻车：升级头从没到过后端',
  intro: 'App 实时推送上线后大面积握手失败：本地直连后端 100% 成功，走网关的新版客户端全挂——升级头像从没到过。',
  domain: 'network',
  layer: '升级协议要逐跳协商——中间层吞掉一个头，协议就停在原地',
  part: 'apprentice',
  chapterId: 'access',
  order: 6,
  typeTags: ['config', 'dependency'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」的接入层负责人，实时座位提醒功能上线 10 分钟，客服群炸了。',
    architecture: 'App → 网关(Nginx, 两套 location: /ws/v1 老心跳、/ws/v2 新推送) → 通知服务(WebSocket 端点)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '握手失败统计',
        text: '新版客户端（/ws/v2）：握手失败 100%，网关返回 400 "Upgrade header required"\n老版客户端（/ws/v1 心跳）：握手成功率 100% 正常',
      },
      {
        type: 'text',
        title: '诡异对照',
        text: '本地直连通知服务：握手 100% 成功。\n同一台机器走生产网关：/ws/v2 立即 400。后端日志：收到的请求里根本没有 Upgrade 头。',
      },
    ],
    timeline: '昨晚网关配置"优化"：合并了重复 location 块 ｜ 今天推送功能上线（用新路径 /ws/v2）｜ /ws/v1 老配置未动',
    impactHint: '本地好、线上坏，坏在中间那一层——升级握手需要哪几样东西？网关给出去几样？',
  },

  hypotheses: [
    { id: 'h-upgrade', text: '网关新 location 未透传 Upgrade/Connection 头：升级请求到后端时已退化为普通 HTTP', excludeActionId: 'a-nginxdump' },
    { id: 'h-origin', text: '后端 Origin 校验失败：经网关后 Origin 头变化被拒', excludeActionId: 'a-origincmp' },
    { id: 'h-timeout', text: '网关代理超时过短，长连接建立后被切断', excludeActionId: 'a-timeoutcfg' },
    { id: 'h-httpver', text: '网关与后端之间强制 HTTP/1.0，升级协商无法进行', excludeActionId: 'a-protocmp' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '按路径与客户端版本切分失败面',
      desc: '影响面：失败聚集在哪个路径、哪类客户端',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '失败面切分',
        text: '/ws/v2（新推送）：失败 100%，全部 400 于握手阶段\n/ws/v1（老心跳）：正常 100%\n本地直连 /ws/v2：正常 100%\n→ 失败 = 新路径 × 网关——同一后端、同一协议，差别只在网关里的那个 location 块。',
      },
    },
    {
      id: 'a-nginxdump',
      name: '抓网关出站请求头对比',
      desc: 'v1 与 v2 两个 location 各自转发出了什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-upgrade'],
      hypotheses: [{ id: 'h-upgrade', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '网关出站头对比',
        text: '/ws/v1 出站：Upgrade: websocket ✓  Connection: Upgrade ✓  HTTP/1.1 ✓\n/ws/v2 出站：Upgrade 无  Connection 无  HTTP/1.0 ✗\n配置考古：昨晚合并 location，/ws/v2 新块漏配：\n  proxy_set_header Upgrade $http_upgrade;\n  proxy_set_header Connection "upgrade";\n  proxy_http_version 1.1;\n→ v1 的三件套样样有，v2 的块里样样无——升级头从没离开过网关。',
      },
    },
    {
      id: 'a-repro',
      name: 'curl 边界对质实验',
      desc: '同一握手请求分别打网关与后端',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '边界对质',
        text: 'curl 带完整升级头 → 直连后端：101 Switching Protocols ✓\ncurl 带完整升级头 → 经网关 /ws/v2：400（后端收到的头里无 Upgrade）\n→ 请求没变、后端没变、变的只有网关那一段——一击实锤。',
      },
    },
    {
      id: 'a-protocmp',
      name: '核对代理协议版本语义',
      desc: 'HTTP/1.0 为什么让 Upgrade 失效',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-httpver'],
      hypotheses: [{ id: 'h-httpver', status: 'down' }],
      result: {
        type: 'text',
        title: '协议版本核对',
        text: 'Upgrade 机制要求 HTTP/1.1（1.0 无该语义）；/ws/v2 块未配 proxy_http_version，默认按 1.0 转发。\n→ 降权并入主因：漏配 Upgrade/Connection 头与漏配 1.1 是同一处配置缺陷的三件套——修复一并处理。',
      },
    },
    {
      id: 'a-origincmp',
      name: '比对 Origin 头透传',
      desc: '排除 Origin 校验',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-origin'],
      hypotheses: [{ id: 'h-origin', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'Origin 核对',
        text: 'Origin 头有透传配置，后端校验放行（失败发生在校验之前——头就缺了）。\n→ 排除 Origin 问题。',
      },
    },
    {
      id: 'a-timeoutcfg',
      name: '核对代理超时配置',
      desc: '排除超时切断',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-timeout'],
      hypotheses: [{ id: 'h-timeout', status: 'excluded' }],
      result: {
        type: 'text',
        title: '超时核对',
        text: 'proxy_read_timeout 3600s 充足；失败发生在握手（400），不是长连接中断。\n→ 排除超时。',
      },
    },
    {
      id: 'a-danger',
      name: '回滚网关配置到合并前版本',
      desc: '【状态变更】昨晚"配置优化"整体回退',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果',
        text: '/ws/v2 握手成功率恢复 100%——回滚生效。\n代价：昨晚合并的其他合理项（gzip 调优、日志格式）一并回退。\n→ 配置回滚是整块的：一次塞多个变更进一个包，回滚时也要全吞。',
      },
    },
    {
      id: 'a-fixws',
      name: '修复：v2 块补齐升级三件套',
      desc: '【状态变更】Upgrade/Connection 透传 + proxy_http_version 1.1，重新合入',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '三件套补齐后灰度一个 location 验证：握手成功率 100%，长连接稳定 30 分钟无中断。\n其余回退项单独重发（一个变更一个包）。',
      },
    },
    {
      id: 'a-fixcheck',
      name: '沉淀：网关配置模板化',
      desc: '【状态变更】WebSocket 类 location 从模板生成（三件套强配）+ 配置 diff 审查进发布流程',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '模板与流程',
        text: '① ws-location 模板：三件套缺失无法生成\n② 网关配置变更发布前自动 diff：新增 location 与模板逐项对照\n→ "复制 v1 改个路径"不再是配置新端点的方式——模板保证协议语义，diff 保证变更可见。',
      },
    },
    {
      id: 'a-fixprobe',
      name: '沉淀：握手成功率分路径监控',
      desc: '【状态变更】WebSocket 握手成功率按路径上报，< 99% 告警',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控 v2',
        text: '握手成功率按路径/版本维度上报；< 99% 即告警。\n这次事故从"上线 10 分钟客服炸群"变成"1 分钟告警定位到路径"。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-upgrade', text: '昨晚网关 location 合并后，新路径 /ws/v2 漏配 WebSocket 升级三件套（Upgrade/Connection 透传 + HTTP/1.1）：升级请求到后端已退化为普通 HTTP——新路径握手 100% 失败', correct: true },
    { id: 'rc-origin', text: '后端 Origin 校验对网关转发的请求拒绝', correct: false },
    { id: 'rc-timeout', text: '网关代理超时过短切断长连接', correct: false },
    { id: 'rc-httpver', text: '代理协议版本 1.0 导致升级协商失效（并入三件套缺陷）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '"本地好、线上坏"——先把失败面切干净：是路径、是客户端版本、还是环境。',
      update: '失败 100% 聚集在"新路径 × 网关"：v1 正常 v2 全挂，本地直连 v2 正常——差异收敛到网关的 location 配置。',
      actionId: 'a-impact',
      why: '1⚡︎ 切分失败面是最便宜的三维透视：路径×版本×环境，一刀切出"网关配置"这个唯一公共变量。',
      conclusion: '嫌疑锁定：/ws/v2 的网关配置（h-upgrade 升权）。',
    },
    {
      thought: '抓网关出站请求头——升级协商需要什么，网关实际转发了什么，逐项对质。',
      update: '实锤：v1 三件套齐全，v2 一件没有——升级头从没离开过网关。',
      actionId: 'a-nginxdump',
      why: '2⚡︎ 协议升级是逐跳协商：每一跳的"转发了什么"必须用抓包对质而不是读文档记忆——出站头对比一次给出全部三件的缺失清单。',
      conclusion: '根因实锤：三件套漏配。',
    },
    {
      thought: 'curl 边界对质做最终确认：同一请求打两端，差异即中间层的行为。',
      update: '直连 101、经网关 400——中间层行为被一击钉死。',
      actionId: 'a-repro',
      why: '1⚡︎ 边界对质是中间件排查的收官动作：它把"配置考古的推断"升级为"可复现的因果"——也直接成为修复后的验收用例。',
      conclusion: '因果闭环 → 修复三件套。',
    },
    {
      thought: 'Origin/超时各 1⚡︎ 排除；协议版本并入主因——排除要留证，合并要讲理由。',
      update: 'Origin 与超时无涉；HTTP/1.0 与漏配头同源同修——不重复记账。',
      actionId: 'a-origincmp',
      why: '1⚡︎ 归因的整洁性很重要：三个相关缺陷合成一个"配置缺陷"，修复清单才不会碎成三片——复盘叙事也清晰。',
      conclusion: '嫌疑收敛 → 模板化防复发。',
    },
    {
      thought: '止血（回滚）、修复（三件套重发）、沉淀（模板+diff+监控）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（三件套缺失）✓ 变更源（location 合并）✓ 防线（模板+握手监控）✓——技术、流程、观测三层闭合。',
      conclusion: '沉淀：协议升级要逐跳协商——中间层吞掉一个头，协议就停在原地。配置合并是最常见的回归源：一次变更一个包，回滚时不被迫全吞。',
    },
  ],

  lessons: [
    {
      text: 'WebSocket 升级是逐跳协商：Upgrade 头、Connection 头、HTTP/1.1 三件套必须在每一跳透传——中间层吞掉一个，协议就退化成普通 HTTP。',
      principle: '全栈视野：代理类中间件对升级协议默认"不认识"，三件套必须显式配置。新端点从模板生成（缺失即报错），不靠手工复制——协议语义的正确性应该被工具保证，而不是被细心保证。',
    },
    {
      text: '"本地好、线上坏"的差异必在中间层：本地直连与生产链路之间，每一跳都是嫌疑人。',
      principle: '排查方法：把"环境差异"拆解为逐跳对质——同一请求分别打两端（curl/curl+网关），差异即中间层行为。配置考古给推断，边界对质给证据。',
    },
    {
      text: '配置合并是最常见的回归源：一次"优化"塞进多个变更，出问题时回滚也是整块的。',
      principle: '变更管理：一次变更一个包（配置同理）——回滚粒度 = 变更粒度。昨晚的 gzip 调优与 location 合并不该坐同一趟车：一个出事，两个陪葬。',
    },
  ],
}
