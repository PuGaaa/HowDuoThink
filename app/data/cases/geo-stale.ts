import { DiagnosisCase } from '../../types/case'

/**
 * 第 15 章 · 网络深处 第七批（GeoDNS 陈旧答案 L3）
 * 教学点：全栈视野——机房迁移的三层缓存（权威 DNS TTL → 递归 DNS 缓存 → 客户端栈缓存），
 * 任何一层陈旧都是"一半用户登录失败"；切换的三层预热与三层回收。
 * 专家路径：impact(1) + resolvertree(2) + clientstack(1) = 4⚡︎
 */
export const geoStaleCase: DiagnosisCase = {
  id: 'geo-stale',
  title: '切完机房一周，还有一半用户登录失败',
  intro: '机房迁移完成一周：约一半用户登录失败，且失败的"永远是同一批人"——DNS 的答案过期了三层。',
  domain: 'network',
  layer: 'DNS 切换是三层缓存的接力——任何一层陈旧，那批用户就永远停在旧世界',
  part: 'master',
  chapterId: 'network',
  order: 11,
  typeTags: ['network', 'config', 'capacity'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」的基础平台负责人，"迁移成功"的验收报告和客服工单同时放在你桌上。',
    architecture: '用户 → 递归 DNS(运营商) → 权威 DNS(GeoDNS: 南北分流) → 新机房(北京) / 旧机房(上海, 已下线应用)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '失败画像',
        text: '登录失败占 DAU 47%，集中在固定人群（重试也失败，隔天仍失败）。\n失败用户解析到的 IP：全部指向旧机房上海（应用已下线，连接直接拒绝）。\n成功用户：解析到北京新机房。',
      },
      {
        type: 'text',
        title: '迁移记录',
        text: '权威 DNS：A 记录已切北京，TTL 300s ✓\n旧机房应用：已下线（连接拒绝）✓\n迁移公告：已发 ✓ 验收拨测：从公司办公网测试全部通过 ✓',
      },
    ],
    timeline: '机房迁移 7 天前完成 ｜ 验收拨测通过（办公网视角）｜ 失败工单 3 天起持续 ｜ 失败人群地域集中（华东某运营商）',
    impactHint: '拨测通过、权威 DNS 已切、失败却持续一周且人群固定——"答案"在哪一层过期了？为什么恰好是那批人？',
  },

  hypotheses: [
    { id: 'h-resolver', text: '华东某运营商递归 DNS 无视 TTL 长期缓存旧答案（递归层陈旧）——那批用户的出口递归全是它', excludeActionId: 'a-resolvertree' },
    { id: 'h-geo', text: 'GeoDNS 分流规则错误：华东策略仍指向上海旧机房（权威层错误）', excludeActionId: 'a-georule' },
    { id: 'h-clientstack', text: '客户端 SDK 内嵌 DNS 缓存永不过期（进程生命周期级），老用户进程不重启', excludeActionId: 'a-clientstack' },
    { id: 'h-anycast', text: '用户运营商 anycast 路由把查询打到错误的权威节点', excludeActionId: 'a-authoritypath' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '把失败用户按"递归出口"聚类',
      desc: '影响面：失败人群的递归 DNS 出口分布',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '失败人群聚类（按出口递归）',
        text: '失败用户 100% 出口 = 华东运营商递归集群 R1（3 个 IP）\n成功用户出口 = 其他递归集群（R2/R3/公共 DNS）\n同一用户切换 DNS（手动改 114.114.114.114）→ 立刻登录成功！\n→ 问题被钉死在"递归层"：R1 给的答案是旧的。',
      },
    },
    {
      id: 'a-resolvertree',
      name: '三层答案逐层对质',
      desc: '权威层说什么、递归层说什么、客户端拿到什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-resolver'],
      hypotheses: [{ id: 'h-resolver', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '三层对质（login.example.com A 记录）',
        text: '权威层：直接问权威 NS → 北京 IP ✓ TTL 300 ✓ GeoDNS 南北分流规则正确 ✓\n递归层：向 R1 发起查询 → 返回上海旧 IP ✗（且应答 TTL 字段 = 300，但连续 7 天不更新）\n客户端层：拿 R1 的答案 → 连上海 → 拒绝 → 失败\n实锤：R1 递归集群无视 TTL 长期缓存旧记录——已知的运营商递归 defect（部分老递归对 \n"应答内的 TTL"与"自身缓存过期"实现有缺陷，低流量域名永不刷新）。',
      },
    },
    {
      id: 'a-clientstack',
      name: '核对客户端栈缓存',
      desc: '排除客户端进程缓存（对照组功能）',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-clientstack'],
      hypotheses: [{ id: 'h-clientstack', status: 'excluded' }],
      result: {
        type: 'text',
        title: '客户端核对',
        text: 'App 内嵌解析走系统栈（TTL 遵守）；改用公共 DNS 的用户立刻成功——\n证明客户端栈本身愿意接受新答案，它只是被 R1 喂了旧答案。\n→ 排除客户端栈：锅在递归层。',
      },
    },
    {
      id: 'a-georule',
      name: '复核 GeoDNS 分流规则',
      desc: '排除权威层配置错误',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-geo'],
      hypotheses: [{ id: 'h-geo', status: 'excluded' }],
      result: {
        type: 'text',
        title: '权威层核对',
        text: 'GeoDNS 控制台：华东策略已指向北京 ✓；直接向权威 NS 发起查询（绕过递归）全地区返回北京 ✓\n→ 排除权威层：权威给的答案永远是对的，错的是"有人拿旧答案不还手"。',
      },
    },
    {
      id: 'a-authoritypath',
      name: '核对 R1 的权威查询路径',
      desc: '排除 anycast 错路',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-anycast'],
      hypotheses: [{ id: 'h-anycast', status: 'excluded' }],
      result: {
        type: 'text',
        title: '查询路径核对',
        text: 'R1 的查询能到达权威 NS（日志可见 R1 的查询在 7 天前还有）——此后 R1 再也没来问过。\n→ 排除路径问题：R1 不是"问了拿不到"，是"根本不问了"。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急把 TTL 改为 60s 并等待 R1 自然过期',
      desc: '【状态变更】权威 TTL 300→60，赌 R1 缓存自然老化',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'TTL 赌局结果（陷阱动作）',
        text: '72 小时过去，R1 依然返回旧答案——它的缓存实现无视 TTL（低流量域永不刷新缺陷）。\n"等它过期"的假设落空：对有缺陷的递归，TTL 不是承诺。\n→ 复盘点评：对已确认失灵的层，任何"等一等"都是拖延——必须主动让 R1 的旧答案失效。',
      },
    },
    {
      id: 'a-fixdual',
      name: '修复：旧机房双活引流 + 主动失效',
      desc: '【状态变更】旧机房恢复登录反代转发新机房；联系运营商刷新；新域名双记录过渡',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 旧机房恢复一个轻量反代：上海 IP 的登录请求转发北京——47% 失败用户立刻恢复（他们解析到的"旧 IP"重新活了）\n② 联系 R1 所属运营商刷新缓存 + 提交递归缺陷工单（48h 内刷新）\n③ 新域名 login2.example.com 双 A 记录（京+沪）过渡，App 侧灰度切换\n失败率 47% → 0.3%。',
      },
    },
    {
      id: 'a-fixdrill',
      name: '沉淀：机房迁移 DNS 检查单',
      desc: '【状态变更】迁移检查单三层化：权威层验证 + 递归层抽查（全国主要递归集群）+ 客户端层灰度',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '检查单 v2',
        text: '① 权威层：直接问 NS 验证（绕过递归）——原验收只做了这层\n② 递归层：全国 Top20 递归集群抽查（用真实运营商网络拨测）——本次缺口\n③ 客户端层：灰度人群登录成功率看板（按递归出口聚类）\n三层全绿才宣告"迁移完成"——办公网拨测通过 ≠ 全国用户可达。',
      },
    },
    {
      id: 'a-fixlegacy',
      name: '沉淀：旧机房"软下线"原则',
      desc: '【状态变更】机房下线保留反代引流 90 天（覆盖最长递归缓存尾巴）——旧 IP 要么活着要么被刷新',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '软下线',
        text: '规范：机房迁移后旧 IP 保留最小反代 90 天（转发新机房），流量归零后再物理回收。\n→ "旧地址"永远有地方可去——递归缓存尾巴再长，用户也只是慢一点，不会失败。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-resolver', text: '华东运营商递归集群 R1 无视 TTL 长期缓存旧 A 记录（低流量域名永不刷新的实现缺陷）：47% 用户 7 天拿旧上海 IP，旧机房应用已下线连接拒绝；验收拨测只覆盖了办公网视角', correct: true },
    { id: 'rc-geo', text: 'GeoDNS 分流规则错误，华东仍指向旧机房（权威层已验证正确）', correct: false },
    { id: 'rc-clientstack', text: '客户端 SDK 内嵌 DNS 永久缓存（已排除：换递归立即恢复）', correct: false },
    { id: 'rc-anycast', text: '运营商 anycast 把查询路由到错误权威节点', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '"失败的永远是同一批人"——按递归出口聚类失败人群：DNS 是分层的，人群也是分层的。',
      update: '失败 100% 聚焦单一递归集群 R1；同用户换 DNS 立即成功——问题钉死在递归层。',
      actionId: 'a-impact',
      why: '1⚡︎ 聚类维度选"递归出口"而不是"地域"：地域是表象，递归出口才是 DNS 世界的身份——一个维度把 47% 的失败收敛成 3 个 IP 的故事。',
      conclusion: '嫌疑锁定：递归层（h-resolver 升权）。',
    },
    {
      thought: '三层对质：权威、递归、客户端逐层要答案——谁在撒谎一问便知。',
      update: '实锤：权威永远正确、R1 七天不更新（还自称 TTL 300）——递归实现缺陷。',
      actionId: 'a-resolvertree',
      why: '2⚡︎ 三层对质是 DNS 排查的完整闭环：每层分别直连询问，答案不一致处就是故障层。R1"返回 TTL 300 的旧答案"是最狡猾的形态——它连 TTL 都伪造了，靠等是等不来的。',
      conclusion: '根因实锤：递归层陈旧。',
    },
    {
      thought: '客户端栈假设 1⚡︎ 排除——"换 DNS 就成功"这个用户行为本身就是对照组实验。',
      update: '客户端无责确认：它愿意接受新答案，是被喂了旧的。',
      actionId: 'a-clientstack',
      why: '1⚡︎ 用户的无意行为是最好的 A/B 实验：换递归即成功 = 客户端栈清白的天然对照——排查要善于识别"意外发生的实验"。',
      conclusion: '排除完成。',
    },
    {
      thought: '权威/路径各 1⚡︎ 排除；TTL 赌局陷阱（对失灵的层等过期）；修复三层（反代引流/运营商/新域名）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】根因（R1 缺陷）✓ 三层（权威✓递归✗客户端✓）✓ 防线（三层检查单+软下线）✓——个案、层次、防线三层闭合。',
      conclusion: '沉淀：DNS 切换是三层缓存接力——任何一层陈旧，那批用户就永远停在旧世界；对失灵的层，主动失效而不是等待。',
    },
  ],

  lessons: [
    {
      text: 'DNS 切换是三层缓存的接力：权威 → 递归 → 客户端，任何一层陈旧，那批用户就永远停在旧世界。',
      principle: '全栈视野：三层逐层对质（每层直连询问）是 DNS 排查的完整闭环。验收拨测只覆盖"我们自己的网络视角"——全国主要递归集群的抽查（真实运营商网络）是"迁移完成"的真正判据。',
    },
    {
      text: '"失败的永远是同一批人" = 按基础设施身份聚类：地域是表象，递归出口才是 DNS 世界的身份。',
      principle: '假设思维：故障人群的聚类维度决定收敛速度——按递归出口聚类，47% 的失败收敛成 3 个 IP。用户的无意行为（换 DNS 即成功）是天然对照实验——识别并利用它，比架设实验环境更快。',
    },
    {
      text: '对已确认失灵的层，"等缓存过期"是拖延：R1 无视 TTL 七天不更新——主动失效（反代引流/运营商工单/新域名过渡）才是修复。',
      principle: '产品思维：机房下线保留"软引流"90 天（旧 IP 反代转发新机房）——旧地址要么活着要么被刷新，用户最多慢一点不会失败。迁移类变更的安全感不来自"按计划完成了"，来自"所有层的尾巴都有人接住"。',
    },
  ],
}
