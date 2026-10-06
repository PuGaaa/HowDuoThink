import { DiagnosisCase } from '../../types/case'

/**
 * 第 10 章 · 部署与发布（蓝绿切换 L2）
 * 教学点：蓝绿切换切的是"流量入口"，而入口不止网关一个——DNS/CDN/长连接/客户端都是入口；
 * HTML 与 hash 资源的缓存策略必须分层。
 * 专家路径：impact(1) + edgefetch(1) + origincmp(1) = 3⚡︎
 */
export const bgSplitCase: DiagnosisCase = {
  id: 'bg-split',
  title: '蓝绿切换后一半用户还在旧版',
  intro: '蓝绿切换 20:05 网关确认全量完成，但埋点显示还有一半用户在用旧版——新用户正常，老用户很多还是旧首页。',
  domain: 'deploy',
  layer: '切换切的是流量入口，而入口不止网关一个',
  part: 'master',
  chapterId: 'deployment',
  order: 1,
  typeTags: ['deploy', 'cache'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」商城的发布负责人，今晚 App 5.0 新版首页蓝绿上线由你指挥。',
    architecture: 'App(原生壳+内嵌 H5 首页) → DNS → CDN(HTML+静态资源) → 网关(蓝绿切换) → API v4(蓝)/v5(绿)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '发布指挥群',
        text: '网关日志 20:05：蓝绿切换完成，API 流量 100% 已切绿环境。\n但埋点大盘：v5 新首页的 PV 占比只有 48%，v4 旧首页还在接另一半。',
      },
      {
        type: 'text',
        title: '客服反馈',
        text: '新注册用户看到的是新版首页；大量老用户打开 App 还是旧版首页。\n有用户卸载重装 App 后"变新了"——客服把这当成玄学上报。',
      },
    ],
    timeline: '今晚 20:00 蓝绿切换 ｜ 20:05 网关确认全量切绿 ｜ App 5.0 首页为内嵌 H5 页面（走 CDN）',
    impactHint: '"还在旧版"的不是同一类人——先看他们各自从哪条路进入你的系统。',
  },

  hypotheses: [
    { id: 'h-longconn', text: '切换前建立的长连接（keep-alive/WebSocket）仍锚定蓝环境，流量没走网关切换', excludeActionId: 'a-connreg' },
    { id: 'h-dns', text: '网关域名 DNS TTL 未调低，运营商递归缓存还指向蓝集群 IP', excludeActionId: 'a-dnsdig' },
    { id: 'h-cdn', text: 'CDN 边缘缓存了旧版首页 HTML：切了 API 层，静态入口还是旧页面', excludeActionId: 'a-edgefetch' },
    { id: 'h-version', text: '用户客户端没升级，旧版 App 壳根本不会请求新首页（强升策略未开）', excludeActionId: 'a-verdist' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定"还在旧版"的用户特征',
      desc: '影响面：他们是谁、从哪条路径进来、什么时间开始',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '旧版用户特征交叉分析',
        text: '客户端版本：旧版用户里 78% 已是 v5.0 客户端——不是没升级。\n路径特征：走原生 tab 的用户正常；打开"内嵌 H5 首页"的用户一半是旧版。\n时间特征：20:05 切换后立刻出现，与网关切换时间吻合。\n→ 问题不在"谁"，在"从哪条路进来"——H5 首页这条静态入口有问题。',
      },
    },
    {
      id: 'a-verdist',
      name: '查客户端版本分布与强升策略',
      desc: '排除"用户没升级"',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-version'],
      hypotheses: [{ id: 'h-version', status: 'excluded' }],
      result: {
        type: 'text',
        title: '版本分布',
        text: 'v5.0 客户端渗透率今晚已达 81%（热更推送）。\n旧版用户中 78% 是 v5.0——客户端是新壳，内容是旧页。\n→ 排除版本问题：壳是新的，页是旧的，问题在页面下发链路。',
      },
    },
    {
      id: 'a-connreg',
      name: '查网关长连接注册表',
      desc: '切换前建立的长连接现在连着谁',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-longconn'],
      hypotheses: [{ id: 'h-longconn', status: 'down' }],
      result: {
        type: 'text',
        title: '长连接现状',
        text: '20:00 前建立、仍锚定蓝环境的长连接占比 31%。\n但长连接只承载 API 调用，不承载 H5 首页请求（H5 走 CDN 短连接）。\n→ 降权：长连接解释一部分 API 旧流量，但解释不了 H5 首页旧版——它是次要因素，不是主犯。',
      },
    },
    {
      id: 'a-dnsdig',
      name: '从多地拨测 DNS 解析现状',
      desc: '排除 DNS 缓存',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-dns'],
      hypotheses: [{ id: 'h-dns', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'DNS 拨测',
        text: '三大运营商 12 个探测点：域名已全部解析到绿集群 IP，TTL 60s 早已收敛。\n→ 排除 DNS：域名层的切换是最干净的。',
      },
    },
    {
      id: 'a-edgefetch',
      name: '从 CDN 边缘节点抓首页 HTML',
      desc: '边缘节点现在吐的 HTML 是新是旧',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cdn'],
      hypotheses: [{ id: 'h-cdn', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '边缘节点 HTML 抽样',
        text: 'GET https://cdn.example.com/home → x-cache: HIT\n返回 HTML：<script src="/assets/app.7d21a9.js">  ← 旧 hash！\n响应头：Cache-Control: max-age=86400  age: 18400\n→ 边缘节点缓存着 20 小时前的旧 HTML（TTL 24h），H5 首页这条入口根本没被切换覆盖。',
      },
    },
    {
      id: 'a-origincmp',
      name: '对比源站与边缘的 HTML',
      desc: '源站是新是旧——把缓存层剥出来',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cdn'],
      hypotheses: [],
      result: {
        type: 'code',
        title: '源站 vs 边缘',
        text: '源站 OSS：app.3f9c2b.js（新 hash）✓ 发布产物正确\n边缘 CDN：app.7d21a9.js（旧 hash）✗ 缓存未失效\n→ 差异被精确定位在 CDN 一层：发布是对的，下发是旧的。',
      },
    },
    {
      id: 'a-gwlog',
      name: '复核网关切换脚本覆盖范围',
      desc: '切换脚本到底切了哪几层',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '切换脚本清单',
        text: '脚本步骤：①网关 upstream 蓝→绿 ②DNS 权重 ③健康检查确认。\n没有的步骤：CDN purge、HTML 缓存策略调整。\n→ 切换的边界画在了"API 流量"，静态入口被遗漏——脚本没错，是清单不全。',
      },
    },
    {
      id: 'a-rollback',
      name: '回滚切换到蓝环境',
      desc: '【状态变更】全量切回蓝，让所有用户回到旧版',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果',
        text: 'API 全部回蓝。但注意：H5 首页走 CDN 不走网关——回滚对"旧版首页"问题毫无作用，\n反而把已切绿的正常用户也送回旧版。\n→ 这是复盘要重点点评的陷阱动作：止血动作打错了靶子。',
      },
    },
    {
      id: 'a-fixpurge',
      name: 'CDN purge 首页路径 + 缓存策略分层',
      desc: '【状态变更】清缓存 + HTML 改短 TTL、hash 资源长缓存',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① purge 首页 HTML 路径（只清 HTML，不清 hash 静态资源）\n② HTML 缓存策略：max-age 86400 → no-cache（边缘 revalidate）\n③ hash 资源：max-age=31536000, immutable\n10 分钟后边缘抽样全部返回新 HTML，旧版用户清零。',
      },
    },
    {
      id: 'a-switchlist',
      name: '切换检查单增加"入口清单"',
      desc: '【状态变更】切换步骤补全：DNS/CDN/网关/客户端四个入口逐一确认',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '新检查单',
        text: '蓝绿切换检查单 v2：□ 网关 upstream □ DNS 权重 □ CDN purge/策略 □ 客户端强升 □ 长连接迁移公告。\n每次切换逐项打勾——入口清单来自这次事故的用户路径地图。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-cdn', text: '蓝绿切换脚本只覆盖网关/DNS 层，遗漏 CDN 静态入口：首页 HTML 被边缘缓存 24h，切完后一半用户的 H5 首页还是旧版', correct: true },
    { id: 'rc-longconn', text: '切换前建立的长连接仍锚定蓝环境，流量未被切换', correct: false },
    { id: 'rc-dns', text: 'DNS TTL 过长，运营商缓存仍指向蓝集群', correct: false },
    { id: 'rc-version', text: '用户客户端未升级，旧壳不会请求新首页', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-rollback',

  expertChain: [
    {
      thought: '"一半用户还在旧版"——先别猜原因，看这批人的共同点：他们是谁、从哪条路进来的。',
      update: '共同点是路径不是身份：走 H5 首页的用户出问题，走原生的正常——排查方向从"用户侧"转到"页面下发链路"。',
      actionId: 'a-impact',
      why: '1⚡︎ 交叉分析客户端版本×路径×时间，三列数据直接把"一半"拆成了有形状的人群——产品思维的第一刀：你的用户不是一个整体，是几条到达路径。',
      conclusion: '客户端版本排除大半 → 入口路径差异成为主线。',
    },
    {
      thought: 'H5 首页走 CDN。从边缘节点直接抓一次首页，看边缘现在吐的是新是旧——用户视角的一手证据。',
      update: '实锤：边缘返回旧 hash HTML，x-cache: HIT，TTL 24h——静态入口没被切换覆盖。',
      actionId: 'a-edgefetch',
      why: '1⚡︎ 抓边缘 HTML 是"假装自己是用户"的验证：一个请求同时给出内容新旧和缓存头，信息密度极高。',
      conclusion: 'CDN 旧 HTML 实锤 → 对比源站确认发布本身是对的。',
    },
    {
      thought: '源站是不是新的？对比源站与边缘——把"发布错"和"下发旧"分开。',
      update: '源站新、边缘旧：发布产物正确，问题锁定在缓存失效环节。',
      actionId: 'a-origincmp',
      why: '1⚡︎ 一锤定音的分层对比：源站/边缘各抓一次，两层缓存立刻分出责任——发布系统"成功"的定义要重新审视。',
      conclusion: '发布对、下发旧 → 根因收敛为"切换未覆盖 CDN 入口 + HTML TTL 过长"。',
    },
    {
      thought: '还有 31% 的 API 长连接锚定蓝——它是不是"另一半"的解释？看它承载的是什么。',
      update: '长连接不承载 H5 首页：它解释 API 旧流量，解释不了首页旧版——降权为次要因素。',
      actionId: 'a-connreg',
      why: '2⚡︎ 防止"一个解释覆盖所有现象"的错觉：31% ≠ 52%，数字对不上时解释必须降权，残留差异留给主因。',
      conclusion: '长连接列为次要因素一并处理，主犯仍是 CDN 入口。',
    },
    {
      thought: '止血用 purge（靶向），修复用策略分层，流程补检查单——回滚是陷阱：切回蓝对 CDN 层无效。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】入口遗漏 ✓ TTL 策略 ✓ 次要因素 ✓——机制、放大器、残余三块都闭合，行动方案已覆盖。',
      conclusion: '沉淀：切换的边界 = 所有流量入口的并集。发布检查单要画"用户到达路径地图"，而不是列服务器清单。',
    },
  ],

  lessons: [
    {
      text: '蓝绿切换切的是"流量入口"，而入口不止网关一个：DNS、CDN、长连接、客户端离线包都是入口。',
      principle: '发布架构思维：画一张用户到达路径图，每条路径上的缓存/粘滞点都要在切换清单里。"网关切完 = 发布完成"是把发布简化成了服务器视角——用户走的那条路才是发布真正的完成线。',
    },
    {
      text: '缓存策略必须分层：HTML（入口，no-cache/短 TTL）与 hash 资源（内容寻址，长缓存 immutable）不能共用一套 TTL。',
      principle: 'HTML 是"指针"，hash 资源是"内容"：指针必须实时（否则新内容找不到），内容可以永久缓存（名字变了缓存自然失效）。两层混用一套策略，要么发布不生效，要么缓存全被打穿。',
    },
    {
      text: '"一半用户"的分布形状是证据：路径相关→入口问题，版本相关→升级问题，区域相关→DNS/节点问题。',
      principle: '产品思维：不要把用户当整体统计，按到达路径切分交叉表。形状对上了，根因自动浮出；形状对不上（31%≠52%），解释就要降权——数字永远比叙事诚实。',
    },
  ],
}
