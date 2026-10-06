import { DiagnosisCase } from '../../types/case'

/**
 * 第 7 章 · 网络深处（代理改写请求头 L3）
 * 教学点：验证思维——"我以为发出去的就是后端收到的"是幻觉，边界 dump 才是真实验证；
 * 全栈视野——每一跳中间件都可能改写你的数据，且多半静默。
 * 专家路径：impact(1) + headerdump(1) + xff(1) + hostcmp(1) = 4⚡︎
 */
export const proxyHeadersCase: DiagnosisCase = {
  id: 'proxy-headers',
  title: '代理悄悄改了请求头',
  intro: '接入新统一代理后风控误判暴增：服务端日志里设备指纹头集体消失——没人动过风控代码。',
  domain: 'network',
  layer: '你以为发出去的就是后端收到的？——每一跳都可能改写',
  part: 'master',
  chapterId: 'network',
  order: 4,
  typeTags: ['network', 'verification'],
  difficulty: 3,

  scene: {
    role: '你是「票到手」平台的风控链路负责人，统一接入层（新代理）切换后的第一个晚上。',
    architecture: '客户端 → 统一接入层(新 Nginx 代理) → 后端服务(风控网关 → 业务)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '风控监控',
        text: '拒绝率 2% → 18.3%（切换代理后 1 小时内爬升）\n拒绝原因分布：92% 落在"设备指纹缺失/低信任"档位。',
      },
      {
        type: 'text',
        title: '服务端日志',
        text: '风控网关收到的请求头里，x_client_fingerprint 头 100% 缺失。\n而客户端埋点显示：SDK 每个请求都带上了这个头（发送侧采样 100% 存在）。',
      },
    ],
    timeline: '今晚 20:00 统一接入层切换（旧代理下线）｜ 20:40 风控拒绝率告警 ｜ 客户端与风控代码均未变更',
    impactHint: '发送侧说"我发了"，接收侧说"我没收到"——中间那一跳发生了什么？',
  },

  hypotheses: [
    { id: 'h-underscore', text: '代理默认丢弃带下划线的请求头（underscores_in_headers off），x_client_fingerprint 被静默吞掉', excludeActionId: 'a-underscore' },
    { id: 'h-xff', text: '代理覆盖了 X-Forwarded-For，风控拿到的客户端 IP 全变成代理 IP，触发 IP 信誉规则', excludeActionId: 'a-xff' },
    { id: 'h-host', text: '代理改写了 Host 头，后端按 Host 做的接口签名校验失败', excludeActionId: 'a-hostcmp' },
    { id: 'h-timeout', text: '代理超时重试导致重复请求，风控把同一设备判为高频风险', excludeActionId: 'a-retrylog' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '核对头部的发送侧与接收侧',
      desc: '影响面：哪些头发了没到、缺头的请求命运如何',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '发送侧 vs 接收侧',
        text: '发送侧（客户端埋点采样）：x_client_fingerprint 存在率 100%\n接收侧（风控网关日志）：存在率 0%——100% 缺失，不是部分丢失\n对照：X-Token（无下划线头）接收侧 100% 存在\n→ 缺的是"带下划线的头"——不是丢包、不是偶发，是精确的选择性消失。',
      },
    },
    {
      id: 'a-headerdump',
      name: '在代理前后各 dump 一次请求头',
      desc: '边界对比：进入代理的头 vs 出代理的头',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '代理边界 dump',
        text: '进代理：x_client_fingerprint: A3F8-92KD-7712  ✓ 存在\n出代理：该头整行消失（无改写、无报错、无日志）\nX-Client-Fp（自测的连字符版本头）→ 出代理后正常透传 ✓\n→ 消失点精确定位在代理内部。代理不是管道，是会改写内容的中间人。',
      },
    },
    {
      id: 'a-underscore',
      name: '复现实验：下划线头 vs 连字符头',
      desc: '在预发代理上验证 Nginx 头名规则',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-underscore'],
      hypotheses: [{ id: 'h-underscore', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '预发复现',
        text: 'Nginx 默认 underscores_in_headers off：\n带下划线的头被判定为"非法头名"→ 静默丢弃（不转发、不报错、不记日志）\nx_client_fingerprint  → 丢弃 ✗\nx-client-fingerprint  → 透传 ✓\n打开 underscores_in_headers on 后 → 透传 ✓\n实锤：这是 Nginx 的默认行为，历史上有安全考量（防歧义头注入），但没人通知你。',
      },
    },
    {
      id: 'a-xff',
      name: '审计 XFF 链与风控 IP 规则',
      desc: 'XFF 是否被覆盖、IP 规则权重多大',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-xff'],
      hypotheses: [{ id: 'h-xff', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'XFF 审计',
        text: 'XFF 确实被代理覆盖为代理自身 IP（真实存在的第二个问题）。\n但风控规则权重表：IP 信誉仅占 5%，且新代理 IP 段信誉良好。\n灰度数据：切代理后 IP 变更的请求通过率 97.2%。\n→ 排除为主因：XFF 是要修，但它解释不了 18% 拒绝率。',
      },
    },
    {
      id: 'a-hostcmp',
      name: '对比代理前后的 Host 头',
      desc: '排除 Host 改写',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-host'],
      hypotheses: [{ id: 'h-host', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'Host 审计',
        text: '代理配置 proxy_set_header Host $host——原始 Host 保留；后端签名校验通过率 100%。\n→ 排除 Host 问题。',
      },
    },
    {
      id: 'a-retrylog',
      name: '查代理重试配置与重复请求',
      desc: '排除超时重试',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-timeout'],
      hypotheses: [{ id: 'h-timeout', status: 'excluded' }],
      result: {
        type: 'text',
        title: '重试审计',
        text: '代理 proxy_retry off；风控侧无重复请求记录（同设备同接口 QPS 正常）。\n→ 排除重试问题。',
      },
    },
    {
      id: 'a-riskrule',
      name: '核对风控规则对"指纹缺失"的处理',
      desc: '量化验证：缺指纹 = 18% 拒绝率的来源',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '风控规则权重',
        text: '规则表：x_client_fingerprint 缺失 → 信任分直接降 2 档 → 进入"挑战/拒绝"分支\n历史基线：指纹缺失率长期 < 0.1%（正常链路下 SDK 保证 100% 带上）\n量化对账：缺指纹请求占比 19.1% × 该分支拒绝率 96% ≈ 18.3% ✓\n→ 拒绝率暴增 = 指纹头被吞 × 风控规则严格放大。',
      },
    },
    {
      id: 'a-proxyrollback',
      name: '回滚到旧接入层',
      desc: '【状态变更】流量切回旧代理，指纹头恢复透传',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '流量回切旧代理，指纹头到达率恢复 100%，拒绝率回落 2.1%。\n代价：新接入层的统一证书/WAF 收益全部回退——等修复后重新灰度。',
      },
    },
    {
      id: 'a-fixunderscore',
      name: '修复：头名规范 + 代理透传配置',
      desc: '【状态变更】underscores_in_headers on + 头规范统一连字符 + 透传白名单审计',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 代理临时开 underscores_in_headers on（兼容存量头）\n② 头名规范统一改为连字符：X-Client-Fingerprint（SDK 与服务端同步改，双跑验证）\n③ 接入层透传白名单审计：逐个头核对"进=出"，XFF 覆盖问题一并修正（补 X-Real-IP）\n④ 预发复现规则写进接入层变更手册。',
      },
    },
    {
      id: 'a-fixboundary',
      name: '接入层变更加"边界 diff"验证',
      desc: '【状态变更】代理变更发布必跑：进出头对比断言（无头被吞/改写）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '发布检查单 v2',
        text: '代理/网关变更发布流程新增边界验证步骤：\n构造携带全量头的探测请求 → 代理前后各 dump 一次 → diff 断言"进=出"→ 通过才放量。\n这类"中间件静默改写"事故从"用户晚上报警"提前到"发布流水线拦截"。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-underscore', text: '新代理 Nginx 默认 underscores_in_headers off 静默丢弃带下划线的头，设备指纹头 x_client_fingerprint 全量消失，撞上风控"缺指纹即降档拒绝"的严格规则——拒绝率 2%→18.3%', correct: true },
    { id: 'rc-xff', text: '代理覆盖 X-Forwarded-For，风控按 IP 信誉规则误拒', correct: false },
    { id: 'rc-host', text: '代理改写 Host 头导致签名校验失败', correct: false },
    { id: 'rc-timeout', text: '代理超时重试产生重复请求，触发高频风险规则', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-proxyrollback',

  expertChain: [
    {
      thought: '发送侧说发了、接收侧说没收到——先量化这个矛盾：缺的是哪些头、缺得多彻底。',
      update: '缺的是全部带下划线的头（100% 消失），无下划线头全数到达——精确的选择性消失，不是网络丢包。',
      actionId: 'a-impact',
      why: '1⚡︎ 把"头丢了"量化成"哪一类头丢了"：模式（下划线）本身就是根因的签名——网络问题不会挑头的拼写。',
      conclusion: '嫌疑锁定：代理的头名处理规则（h-underscore）。',
    },
    {
      thought: '在代理边界前后各 dump 一次——"我以为发出去的就是后端收到的"必须用两条真实记录对质。',
      update: '实锤消失点：进代理头在、出代理头没了——中间人吞掉，且不留痕迹。',
      actionId: 'a-headerdump',
      why: '1⚡︎ 边界 dump 是中间件排查的第一验证：任何"我以为"在两条记录面前都必须让位——这也直接定义了修复后的发布断言。',
      conclusion: '消失点 = 代理内部 → 复现它的规则。',
    },
    {
      thought: '在预发复现：同一请求发下划线版和连字符版——一行配置的行为差异，实验见分晓。',
      update: '实锤机制：underscores_in_headers off 默认丢弃下划线头，静默无日志；开 on 或改连字符即恢复。',
      actionId: 'a-underscore',
      why: '2⚡︎ 复现实验把"某个默认行为"钉死成因果：不是猜 Nginx 行为，是让它当着你的面再做一次。',
      conclusion: '根因闭合：默认行为 × 历史头名规范 × 风控严格规则。',
    },
    {
      thought: 'XFF 确实也被改了——它是共犯还是主犯？查规则权重和灰度数据量化它的贡献。',
      update: 'IP 规则仅占 5% 权重、灰度请求通过率 97.2%——XFF 是真实但次要的问题，列一并修复。',
      actionId: 'a-xff',
      why: '1⚡︎ "发现第二个问题"时必须量化它的贡献度，否则修复方案会被叙事带偏——两个真实问题只有一个能解释 18%。',
      conclusion: '贡献度对账完成：主犯指纹头，从犯 XFF。',
    },
    {
      thought: '量化闭环：缺指纹请求占比 × 分支拒绝率 ≈ 18.3%——数字对上了，机制完备。止血/修复/流程三线并行，停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（下划线头被吞）✓ 放大器（风控严格规则）✓ 量化（对账 18.3%）✓——证据链到数字级闭合。',
      conclusion: '沉淀：数据经过的每一跳都是潜在改写点。信任边界处必须验证，"我发的"和"它收的"要拿 dump 对质——这是验证思维在网络链路上的形态。',
    },
  ],

  lessons: [
    {
      text: '"我以为发出去的就是后端收到的"是幻觉：代理、网关、SDK 每一跳都可能静默改写你的数据。',
      principle: '验证思维：边界 dump 是链路排查的第一动作——在中间件前后各留一份真实记录，diff 就是真相。修复要制度化：中间件变更的发布流水线必须带"进出头 diff 断言"。',
    },
    {
      text: '中间件的默认值也是架构的一部分：Nginx 丢弃下划线头是默认行为，无日志无报错——沉默的改写最难排查。',
      principle: '全栈视野：接入新中间件时要审计它的全部默认行为（头处理、超时、重试、缓冲），而不是只配置你关心的那几项。默认值代表作者对世界的假设，而你的系统未必活在同一个假设里。',
    },
    {
      text: '多个真实问题并存时，用量化对账定主次：XFF 也被改了，但它只贡献 5% 权重——18% 的账要算在指纹头上。',
      principle: '排查纪律：发现第二个问题时先问"它能解释多少现象"。贡献度对账（缺失率 × 规则拒绝率 ≈ 18.3%）防止修复资源被叙事带偏——每个真实问题都值得修，但优先级由数据定。',
    },
  ],
}
