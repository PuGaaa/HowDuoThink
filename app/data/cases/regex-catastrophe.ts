import { DiagnosisCase } from '../../types/case'

/**
 * 第 8 章 · 运行时暗面 第二批（正则灾难性回溯 L2）
 * 教学点：程序设计——嵌套量词触发指数级回溯，一行代码吃掉整台机器；
 * 正则也是输入敏感的算法，必须做复杂度验证；可中断 + 长度上限是兜底防线。
 * 专家路径：impact(1) + flamegraph(2) + repro(1) = 4⚡︎
 */
export const regexCatastropheCase: DiagnosisCase = {
  id: 'regex-catastrophe',
  title: '一行正则吃掉整台机器的 CPU',
  intro: '一次大促文案里的连续特殊字符，把搜索服务 CPU 从 20% 打到 100%——一行正则在指数级回溯。',
  domain: 'runtime',
  layer: '正则也是算法——它的复杂度由输入形状决定',
  part: 'engineer',
  chapterId: 'runtime',
  order: 7,
  typeTags: ['resource', 'capacity', 'security'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」商品搜索服务的后端，大促开始两小时后服务半瘫。',
    architecture: '商家后台(商品描述) → 搜索服务(入参校验: 敏感词/格式正则) → Elasticsearch',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '监控与火焰图',
        text: 'CPU：20% → 100% 持续飙满；P99 从 80ms 飙到 9s。\n火焰图：89% 的 CPU 集中在 java.util.regex.Pattern$Curly.match0 单一调用栈。',
      },
      {
        type: 'text',
        title: '触发请求特征',
        text: '慢请求全部是"新更新的商品描述"——商家按大促模板填了『限时！！！%¥#……疯抢』类连续标点。\n老商品（无连续标点）零影响；ES 查询本身 P99 正常。',
      },
    ],
    timeline: '大促文案模板今天上线（商家开始批量套用）｜ 格式校验正则两年未改过 ｜ 流量仅上涨 40%',
    impactHint: '火焰图把 89% 的 CPU 指向一个正则——什么形状的输入，会让"一行代码"吃掉整台机器？',
  },

  hypotheses: [
    { id: 'h-backtrack', text: '灾难性回溯：校验正则含嵌套量词，特殊字符输入触发指数级匹配路径', excludeActionId: 'a-flamegraph' },
    { id: 'h-volume', text: '大促流量放大导致 CPU 打满（正常容量问题）', excludeActionId: 'a-qpscmp' },
    { id: 'h-es', text: 'ES 慢查询拖慢响应，线程堆积推高 CPU', excludeActionId: 'a-esstat' },
    { id: 'h-gc', text: '大促内存压力下 GC 频繁，GC 线程吃满 CPU', excludeActionId: 'a-gcstat' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定慢请求的输入特征',
      desc: '影响面：慢在哪种输入、慢到什么程度',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '慢请求画像',
        text: '触发请求：100% 含连续特殊字符描述（连续标点 ≥ 10 个）\n耗时对比：正常描述 40ms；触发请求 2s ~ 9s+（相同长度！）\n流量：仅 +40%——容量放大解释不了单请求 200 倍的耗时。\n→ 慢的不是"量"，是"形状"：输入的形状决定了一个正则的运行时间。',
      },
    },
    {
      id: 'a-flamegraph',
      name: '火焰图定位 + 正则回溯分析',
      desc: '那一行正则长什么样、为什么能吃掉 CPU',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-backtrack'],
      hypotheses: [{ id: 'h-backtrack', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '正则解剖',
        text: '校验正则：^(\\w+\\s*[!@#%…]*)+$\n                    ↑ 嵌套量词：组外 + 包着组内 *，双重复指\n输入 "限时！！！%¥#…"（30 字符）时：\n匹配失败 → 引擎回溯重试 → 路径数 ≈ 2^15 → 指数爆炸\n火焰图 89% CPU 实锤。嵌套量词 = 回溯灾难的经典结构。',
      },
    },
    {
      id: 'a-repro',
      name: '边界实验：耗时 vs 输入长度',
      desc: '画指数曲线，钉死回溯',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '长度扫描实验',
        text: '连续标点长度 10 → 96ms\n长度 15 → 780ms\n长度 20 → 3.1s\n长度 25 → 12s+（超时中断）\n同长度普通文本：< 2ms\n每 +5 字符耗时 ×4——指数曲线实锤，回溯假设闭合。',
      },
    },
    {
      id: 'a-qpscmp',
      name: '对比流量与单请求耗时',
      desc: '排除容量放大',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-volume'],
      hypotheses: [{ id: 'h-volume', status: 'excluded' }],
      result: {
        type: 'text',
        title: '容量核对',
        text: 'QPS +40%（远未到压测容量 3 倍红线）；单请求耗时 ×200。\n→ 排除流量：这是"单请求病"，不是"总量病"。',
      },
    },
    {
      id: 'a-esstat',
      name: '核对 ES 查询指标',
      desc: '排除下游拖累',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-es'],
      hypotheses: [{ id: 'h-es', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'ES 指标',
        text: 'ES 查询 P99 35ms 正常；trace 显示慢请求根本没走到 ES——卡在更早的入参校验。\n→ 排除 ES。',
      },
    },
    {
      id: 'a-gcstat',
      name: '核对 GC 指标',
      desc: '排除 GC 压力',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-gc'],
      hypotheses: [{ id: 'h-gc', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'GC 核对',
        text: 'GC 频率与停顿正常；CPU 是用户态计算（火焰图可见），不是 GC 线程。\n→ 排除 GC。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急下线涉事校验正则',
      desc: '【状态变更】移除格式校验，敏感词校验保留',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '正则下线，CPU 回落 20%，服务恢复。\n格式校验暂时裸奔（脏数据风险可控，事后补扫）。\n→ 止血优先：正则还能改，大促流量不等人。',
      },
    },
    {
      id: 'a-fixregex',
      name: '修复：重写校验 + 长度上限 + 执行超时',
      desc: '【状态变更】线性匹配器重写 + 输入长度上限 200 + 正则执行可中断',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 重写：去除嵌套量词，改线性扫描校验（耗时与长度线性）\n② 兜底：入参长度上限 + 正则执行放独立线程，超时 50ms 可中断\n③ 回归：30 连续标点输入耗时 0.9ms（原 8s+），三重防线兜住同类输入。',
      },
    },
    {
      id: 'a-fixscan',
      name: '沉淀：全仓正则安全扫描',
      desc: '【状态变更】lint 检出嵌套量词模式；危险正则清单化治理',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '扫描结果',
        text: '全仓 340 个正则扫描：12 个含嵌套量词风险模式，7 个确认危险已重写。\nlint 规则上线：新正则含嵌套量词直接拦截合并。',
      },
    },
    {
      id: 'a-fixfuzz',
      name: '沉淀：正则模糊测试进 CI',
      desc: '【状态变更】对校验类正则注入随机特殊字符，执行耗时断言 < 10ms',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '模糊测试',
        text: 'CI 每次合并对正则注入随机对抗输入（连续标点/超长重复），耗时断言 P99 < 10ms。\n→ 正则从"看起来能跑"变成"被对抗输入打过"——性能问题在合并前现形。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-backtrack', text: '格式校验正则含嵌套量词 ([\\w+\\s*[!@#%…]*)+，连续特殊字符输入触发指数级回溯：单请求耗时随输入长度指数增长（30 字符 8s+），大促批量文案引爆 CPU', correct: true },
    { id: 'rc-volume', text: '大促流量放大导致 CPU 容量不足', correct: false },
    { id: 'rc-es', text: 'ES 慢查询拖慢响应导致线程堆积', correct: false },
    { id: 'rc-gc', text: 'GC 频繁导致 CPU 飙升', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: 'CPU 飙满但流量只涨 40%——先看慢请求的共同输入特征：是"量"的病还是"形"的病。',
      update: '慢请求 100% 含连续特殊字符、同长度耗时 ×200——输入形状病，不是容量病。',
      actionId: 'a-impact',
      why: '1⚡︎ "同长度不同耗时"是最锋利的对比：排除数据量因素后，耗时必须由输入形状解释——而形状敏感的算法第一个想到正则。',
      conclusion: '嫌疑锁定：正则回溯（h-backtrack 升权）。',
    },
    {
      thought: '火焰图给调用栈，代码给正则本体——解剖它：有没有嵌套量词。',
      update: '实锤：嵌套量词 ([…]*)+ ，失败匹配触发指数回溯，火焰图 89% CPU 吻合。',
      actionId: 'a-flamegraph',
      why: '2⚡︎ 火焰图+代码解剖组合把"CPU 高"精确定位到"一行正则的一个结构"——程序设计视角：嵌套量词是可被静态识别的确定性风险，不是玄学。',
      conclusion: '根因实锤 → 用长度扫描验证指数特征。',
    },
    {
      thought: '画耗时-长度曲线：指数回溯的曲线形状（每 +N 字符 ×k）与线性算法截然不同。',
      update: '每 +5 字符耗时 ×4——指数曲线实锤，与回溯理论完全一致。',
      actionId: 'a-repro',
      why: '1⚡︎ 曲线形状是复杂度的指纹：线性/平方/指数各有其形——确认指数意味着"增加机器"无效（涨一点流量输入长一点就再爆），修复必须换算法。',
      conclusion: '修复方向确定：重写匹配器，而非扩容。',
    },
    {
      thought: '容量/ES/GC 三个经典嫌疑各 1⚡︎ 排除——尤其 GC，是 CPU 飙升最常见的误判方向。',
      update: '流量远未到红线、ES 正常且未到达、GC 干净——三个假设有证据排除。',
      actionId: 'a-qpscmp',
      why: '1⚡︎ CPU 飙升的鉴别诊断要有顺序纪律：先看用户态火焰图定性质（计算/GC/IO），再逐层排除——火焰图已经在手，排除只是留证。',
      conclusion: '嫌疑收敛单点。',
    },
    {
      thought: '止血（下线正则）、修复（线性重写+双重兜底）、沉淀（lint+模糊测试）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】结构（嵌套量词）✓ 形状（指数曲线）✓ 防线（长度+超时+扫描）✓——机制与防线两层闭合。',
      conclusion: '沉淀：正则是输入敏感的算法——它的最坏情况由输入形状决定。校验类正则必须过对抗输入测试，正如加密必须过碰撞测试。',
    },
  ],

  lessons: [
    {
      text: '嵌套量词 (…*)+ 是回溯灾难的经典结构：匹配失败时路径数指数爆炸，30 个字符就能吃掉一颗核。',
      principle: '程序设计：写正则时先问最坏情况——输入什么形状会触发大量回溯？防御三板斧：去除嵌套量词（或改占有量词/原子组）、限制输入长度、独立线程执行超时可中断。三者缺一，正则就是 DoS 入口。',
    },
    {
      text: '耗时-长度曲线是复杂度的指纹：线性 ×1、平方 ×N、指数 ×k 每段——确认指数意味着扩容无效，只能换算法。',
      principle: '验证思维：性能排查要用曲线形状定复杂度，再用复杂度定修复方向。指数问题加机器是填海——输入长度涨一点就重新爆掉，修复必须落在算法结构上。',
    },
    {
      text: '一行代码也能吃掉整台机器：热点定位（火焰图）比全链路猜测快得多——89% 的 CPU 集中在一个方法时，答案已经写在图上。',
      principle: '可观测性：CPU 类问题第一动作是采火焰图定性质（业务计算/GC/内核），再谈其他。"哪个方法最热"永远比"可能是什么原因"信息量大。',
    },
  ],
}
