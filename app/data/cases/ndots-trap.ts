import { DiagnosisCase } from '../../types/case'

/**
 * 第 15 章 · 网络深处 第六批（DNS 搜索域放大 L2）
 * 教学点：全栈视野——ndots:5 让"短于 5 个点"的域名先试遍搜索域：外部调用解析放大 5 倍；
 * 内外域名分流（绝对域名尾点）+ NodeLocal 缓存是 K8s DNS 的标准治理。
 * 专家路径：impact(1) + resolvcheck(2) + repro(1) = 4⚡︎
 */
export const ndotsTrapCase: DiagnosisCase = {
  id: 'ndots-trap',
  title: '每次外部调用，先浪费四次 DNS 查询',
  intro: '容器里调外部 API 偶发解析慢：ndots:5 让完整域名先试遍搜索域——每次解析放大成 5 次查询。',
  domain: 'network',
  layer: 'K8s 的 ndots 语义把"完整域名"当"待补全短名"——外部调用必须绝对化',
  part: 'master',
  chapterId: 'network',
  order: 9,
  typeTags: ['network', 'config', 'capacity'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」平台工程的负责人，K8s 化一年后，外部 API 调用的"偶发解析慢"被摆上桌面。',
    architecture: 'Pod(resolv.conf: ndots:5, search: [prod.svc.cluster.local, svc.cluster.local, cluster.local, example.com]) → CoreDNS → 上游 DNS',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '解析延迟画像',
        text: '外部域名（api.partner.com 等 2 个点）：解析耗时 P50 180ms、P99 940ms——内部 svc 域名恒定 2ms。\n抓包：每次外部解析实际发出 5 个查询（4 个 NXDOMAIN + 1 个成功）。',
      },
      {
        type: 'text',
        title: '业务影响',
        text: '调用外部物流/支付网关的服务：解析延迟叠加在每次新建连接上；\nCoreDNS QPS 被无效查询放大 5 倍（4000 → 20000 QPS），扩容压力随之而来。',
      },
    ],
    timeline: 'K8s 化一年：服务从虚机迁入 Pod（resolv.conf 由 K8s 注入）｜ 外部调用延迟"偶发"报告持续 3 个月 ｜ ndots 值从未被审视',
    impactHint: '5 个查询换 1 个答案——多出来的 4 个在试什么？为什么内部域名从不慢？',
  },

  hypotheses: [
    { id: 'h-ndots', text: 'ndots:5 语义：点数 < 5 的域名先按搜索域逐个补全尝试——外部域名要吃 4 次 NXDOMAIN 才走到绝对查询', excludeActionId: 'a-resolvcheck' },
    { id: 'h-coredns', text: 'CoreDNS 自身性能不足/上游慢，解析排队', excludeActionId: 'a-coredns' },
    { id: 'h-conntrack', text: 'DNS 的 UDP 并发查询引发 conntrack 竞争丢包', excludeActionId: 'a-conntrackcheck' },
    { id: 'h-appcache', text: '应用无 DNS 缓存，每次连接都重新解析（放大器）', excludeActionId: 'a-appcache' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '按域名类型切分解析行为',
      desc: '影响面：内部域名与外部域名的解析差异',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '内外分流对比',
        text: '内部域名（order.prod.svc.cluster.local，4 个点）：解析 2ms 恒定——4 点 < 5？不，\n实际查询路径：补全尝试命中第一个搜索域 → 1 次查询成功\n外部域名（api.partner.com，2 个点）：2 < 5 → 先按 4 个搜索域逐个补全 → 4 次 NXDOMAIN →\n最后才发起"绝对查询"成功 → 5 个查询 / 180~940ms\n→ 分界线 = "域名点数 vs ndots=5"——语义陷阱浮出水面。',
      },
    },
    {
      id: 'a-resolvcheck',
      name: '解剖 Pod 的 resolv.conf 与查询序列',
      desc: 'ndots 语义还原：5 个查询的完整顺序',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-ndots'],
      hypotheses: [{ id: 'h-ndots', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '解析序列还原',
        text: 'resolv.conf：options ndots:5 + search 4 域（K8s 默认注入）\n查询 api.partner.com（2 点 < 5，被视为"可能缺后缀的短名"）：\n  ① api.partner.com.prod.svc.cluster.local → NXDOMAIN\n  ② api.partner.com.svc.cluster.local      → NXDOMAIN\n  ③ api.partner.com.cluster.local          → NXDOMAIN\n  ④ api.partner.com.example.com            → NXDOMAIN\n  ⑤ api.partner.com.（绝对查询）            → 成功 ✓\n实锤：4 次"注定失败的补全"是结构性浪费——ndots 语义把完整域名当短名对待。',
      },
    },
    {
      id: 'a-repro',
      name: 'ndots 对照实验',
      desc: 'ndots:5 vs ndots:1 的解析次数与延迟对照',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '对照实验',
        text: 'ndots:5（现状）：5 查询 / 180ms 起\nndots:1：外部域名 1 次绝对查询 → 3ms；\n  但内部短名（order）需 1+ 补全——内部调用必须改用 FQDN 短名适配\n内部域名回归：改用完整 svc 名后 2ms 不变 ✓\n→ 修复参数与适配清单同时产出：ndots:1 + 内部调用改全名。',
      },
    },
    {
      id: 'a-appcache',
      name: '核对应用层 DNS 缓存',
      desc: '评估"每次连接都解析"的放大贡献',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-appcache'],
      hypotheses: [{ id: 'h-appcache', status: 'down' }],
      result: {
        type: 'text',
        title: '缓存评估',
        text: '应用每次新建连接都走解析（无进程内缓存）——放大器确认：\n高频连接 × 5 倍查询 = CoreDNS 压力与延迟感知的主来源之一。\n→ 降权为放大器：根因是 ndots 语义，缓存与 NodeLocal 是配套治理。',
      },
    },
    {
      id: 'a-coredns',
      name: '核对 CoreDNS 性能与上游',
      desc: '排除 DNS 服务自身',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-coredns'],
      hypotheses: [{ id: 'h-coredns', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'CoreDNS 核对',
        text: '单次查询 P99 2ms、上游链路正常、无丢包重试。\n→ 排除 DNS 服务：慢在"问了几次"，不是"答得慢"。',
      },
    },
    {
      id: 'a-conntrackcheck',
      name: '核对 conntrack 与 UDP 丢包',
      desc: '排除并发查询竞争',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-conntrack'],
      hypotheses: [{ id: 'h-conntrack', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'conntrack 核对',
        text: 'conntrack 表水位 31%、UDP 记录无冲突丢包。\n→ 排除竞争：5 个查询是"串行补全"，不是并发竞争。',
      },
    },
    {
      id: 'a-danger',
      name: '全局把 ndots 调成 1',
      desc: '【状态变更】全集群 resolv.conf ndots:1 一刀切',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '一刀切结果（陷阱动作）',
        text: '外部域名解析恢复 3ms。\n但使用"短名"（如调用 order 服务）的内部调用开始失败/超时——短名在 ndots:1 下不再被补全！\n紧急回滚。\n→ 复盘点评：ndots 是内外调用的"语义开关"——一刀切会砍断短名依赖，治理必须配对迁移。',
      },
    },
    {
      id: 'a-fixndots',
      name: '修复：内外分流 + NodeLocal 缓存',
      desc: '【状态变更】外部调用绝对域名（尾点 .）+ 内部保持短名 + NodeLocal DNSCache',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 外部调用统一 FQDN 尾点写法（api.partner.com.）——跳过搜索域直接绝对查询（不改 ndots，零风险）\n② 内部调用保持短名（ndots 补全语义继续服务内部）\n③ 部署 NodeLocal DNSCache：进程内缓存命中不再过网络\n回归：外部解析 3ms、内部 2ms、CoreDNS QPS 回落 80%。',
      },
    },
    {
      id: 'a-fixsplit',
      name: '沉淀：内外域名分流规范',
      desc: '【状态变更】K8s 模板规范：外部依赖一律 FQDN 尾点；内部服务短名白名单；新人须知',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '分流规范',
        text: '配置模板固化：外部依赖地址登记表（全部尾点写法）+ code review 检查项"外部域名是否绝对化"。\nndots 语义写进新人须知——这个坑的学费不该每个团队再交一遍。',
      },
    },
    {
      id: 'a-fixmon',
      name: '沉淀：DNS 放大率监控',
      desc: '【状态变更】查询数/请求数 放大率 + NXDOMAIN 率 双指标告警',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控 v2',
        text: '放大率指标（DNS 查询数 / 业务请求数 > 3 告警）+ NXDOMAIN 率（> 20% 告警）。\n→ "5 换 1"的浪费在指标上一眼可见——语义陷阱从隐形变成有仪表盘。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-ndots', text: 'K8s 默认 ndots:5：点数 < 5 的外部域名被当短名，先按 4 个搜索域补全吃 4 次 NXDOMAIN 才绝对查询——外部解析放大 5 倍（180~940ms）', correct: true },
    { id: 'rc-coredns', text: 'CoreDNS 性能不足或上游 DNS 慢', correct: false },
    { id: 'rc-conntrack', text: 'UDP 并发查询引发 conntrack 竞争丢包', correct: false },
    { id: 'rc-appcache', text: '应用无 DNS 缓存导致高频重复解析（放大器）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '内部 2ms、外部 180ms——内外分流的分界线在哪？先按域名类型切分解析行为。',
      update: '分界线 = 域名点数与 ndots=5 的关系：外部"完整域名"被当短名对待——语义陷阱定位。',
      actionId: 'a-impact',
      why: '1⚡︎ 内外分流对比一步定位语义层：解析慢的不是"某个域名"而是"某一类写法"——类特征直指解析器语义。',
      conclusion: '嫌疑锁定：ndots 补全语义（h-ndots 升权）。',
    },
    {
      thought: '还原完整查询序列：5 个查询各查了什么、各回了什么——语义陷阱的逐帧还原。',
      update: '实锤：4 次"注定失败的搜索域补全"+ 1 次绝对查询——ndots:5 的默认语义与外部调用天然冲突。',
      actionId: 'a-resolvcheck',
      why: '2⚡︎ 逐查询还原把"解析慢"拆成可见的查询队列：4 次 NXDOMAIN 是确定性浪费而非性能抖动——机制清晰后，修复选项（尾点/ndots/缓存）的收益立刻可算。',
      conclusion: '根因实锤 → 对照实验定修法。',
    },
    {
      thought: 'ndots 对照实验：改 1 会怎样、内部短名受不受影响——修复的代价与适配清单同时产出。',
      update: '外部 3ms 但短名挂了——一刀切不可行；修复定型为"外部尾点 + 内部短名"分流。',
      actionId: 'a-repro',
      why: '1⚡︎ 对照实验的核心产出是"修复的边界"：ndots:1 修好了外部却砍了内部——实验提前暴露陷阱，避免一次会被回滚的全局变更。',
      conclusion: '修复方案定型：分流而非一刀切。',
    },
    {
      thought: '应用缓存降权为放大器，CoreDNS 与 conntrack 各 1⚡︎ 排除——服务侧清场。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（ndots 补全）✓ 放大器（无缓存高频解析）✓ 服务侧（CoreDNS/conntrack 清白）✓——机制、放大、防线三层闭合。',
      conclusion: '沉淀：K8s 的 ndots 语义把完整域名当短名——外部调用必须绝对化（尾点），内外分流 + NodeLocal 缓存是标准治理。',
    },
  ],

  lessons: [
    {
      text: 'K8s 的 ndots:5 把"点数不足"的域名当短名补全：外部完整域名要吃 4 次 NXDOMAIN 才被真正解析——外部调用必须 FQDN 尾点。',
      principle: '全栈视野：容器 DNS 语义（ndots/search）是平台注入的隐性行为，迁移到 K8s 的服务会"继承"它。治理三板斧：外部依赖绝对域名（尾点 .）、内部保持短名、NodeLocal DNSCache 减少 Pod→CoreDNS 的网络往返。',
    },
    {
      text: '一刀切修复会被自己的副作用否决：ndots:1 治好外部却砍断内部短名——对照实验提前暴露陷阱，修复才能"分流"而非"切换"。',
      principle: '验证思维：全局参数的修复必须先在实验里检查"它的另一个语义分支"——ndots 同时服务内外两类调用。对照实验（ndots:1 下短名行为）把"会被回滚的修复"提前拦下，节省的不仅是时间，更是信心。',
    },
    {
      text: '语义陷阱要有仪表盘：DNS 放大率（查询数/请求数）与 NXDOMAIN 率让"5 换 1"的浪费从隐形变成可见。',
      principle: '可观测性设计：这类"结构性浪费"不产生错误（全部最终成功），只产生延迟与负载——常规错误监控永远抓不到。放大率/NXDOMAIN 率是它的专属仪表——指标设计要覆盖"浪费型"异常，不止"失败型"。',
    },
  ],
}
