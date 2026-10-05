import { DiagnosisCase } from '../../types/case'

/**
 * B3-3 · runtime L3（运行时章结业评审）
 * 主训思维：架构设计（资源限额"统一管理"是伪简化——不同服务的资源画像不同）
 * 次训思维：程序设计（HPA 指标选错：CPU 均值看不见事件循环的单核阻塞）
 * 真实原型：统一限额 2C4G 一刀切 + HPA 按 CPU 均值扩容（对事件循环服务永远不触发）
 * 情绪兽设计：不行蜗（迟疑）——"扩容条件永远不满足，事件循环堵死也没人知道"
 * 检查单：思维型 3 + 知识型 1
 */
export const containerReviewCase: DiagnosisCase = {
  id: 'container-review',
  title: '容器治理评审——一刀切的限额与失明的扩容',
  intro: '运维团队提交"容器资源统一治理"方案：全部服务统一 2C4G 限额 + HPA 按 CPU 70% 扩缩容。但你们的 17 个服务，资源画像各不相同。',
  domain: 'runtime',
  layer: '资源限额是服务画像的一部分：统一数字是管理的简化，却是运行的灾难',
  part: 'engineer',
  chapterId: 'runtime',
  order: 5,
  typeTags: ['runtime', 'architecture'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」的架构评审委员。运维团队的"统一治理"方案有它的道理（管理成本真的高）——但 17 个服务里，有的需要 4C，有的 500M 就够。',
    architecture: '17 个服务(资源画像各异) → 统一 2C4G 限额 → HPA(CPU 均值 70% 扩容)',
    tag: '评审现场',
    symptoms: [
      {
        type: 'error',
        title: '方案文档 · 关键句',
        text: '① 统一限额：全部服务 CPU 2 核 / 内存 4Gi（"简化容量管理"）\n② HPA 扩缩容：CPU 利用率 > 70% 触发扩容（K8s 原生指标）\n③ 就绪探针：30s 间隔，统一配置',
      },
      {
        type: 'text',
        title: '评审输入 · 资源画像抽样',
        text: '网关聚合服务：峰值单核 100%（事件循环），均 CPU 25%\n报表服务：稳态内存 3.2Gi，CPU 10%\n商品服务：CPU 峰值 3.5 核，内存 1.8Gi',
      },
    ],
    timeline: '17 个服务资源画像从未系统采集 ｜ 上季度事件循环阻塞事故（event-loop lag 监控已上线）｜ HPA 上线至今从未触发过扩容',
    impactHint: '"统一 2C4G"对三个抽样服务各意味着什么？——每一个都是一场未来事故的名字。',
  },

  hypotheses: [
    { id: 'h-uniform', text: '统一 2C4G 一刀切：高 CPU 服务被限流节流，大内存服务被 OOMKill——伪简化', excludeActionId: 'a-profile' },
    { id: 'h-hpa', text: 'HPA 按 CPU 均值扩容：事件循环阻塞时均值仅 25%，扩容永远不触发——指标选错', excludeActionId: 'a-hpa' },
    { id: 'h-probe', text: '统一就绪探针 30s：启动慢的服务被反复重启', excludeActionId: 'a-probe' },
    { id: 'h-oom', text: '4Gi 限额导致大面积 OOMKill', excludeActionId: 'a-oomhist' },
  ],

  actions: [
    {
      id: 'a-uniform',
      name: '追问统一 2C4G 的依据',
      desc: '"简化管理"简化了谁',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-uniform'],
      hypotheses: [{ id: 'h-uniform', status: 'up' }],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '"为什么统一 2C4G？"——"17 个服务各配各的太乱，统一了好管理。"\n→ 管理的简化，建立在忽略服务画像差异之上——伪简化。',
      },
    },
    {
      id: 'a-profile',
      name: '采集 17 个服务的资源画像',
      desc: '用历史监控数据画资源分布',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-uniform'],
      hypotheses: [{ id: 'h-uniform', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '资源画像（17 服务抽样 5 类）',
        text: '网关聚合：单核敏感（事件循环），2 核不够 → 被限流节流\n报表服务：稳态内存 3.2Gi → 4Gi 限额下常驻 80%，一次大报表即 OOM\n商品服务：峰值 3.5 核 → 2 核限额下高峰被节流\n静态内容服务：200Mi 足够 → 4Gi 浪费 3.8Gi × 17 分之一\n→ 五类画像，一种配置：节流/OOM/浪费并存。',
      },
    },
    {
      id: 'a-hpa',
      name: '审查 HPA 的扩容指标',
      desc: 'CPU 均值 70% 对事件循环服务意味着什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-hpa'],
      hypotheses: [{ id: 'h-hpa', status: 'confirmed' }],
      result: {
        type: 'text',
        title: 'HPA 指标审查',
        text: '事件循环阻塞时：单核 100%，容器均值 25% → HPA 永远不触发。\n上季度事件循环事故（event-loop lag 1.2s）期间：HPA 扩容触发次数 = 0。\n→ 扩容指标与故障模式错配：CPU 均值看不见"单核堵死"。需换自定义指标（event loop lag）。',
      },
    },
    {
      id: 'a-oomhist',
      name: '核对历史 OOMKill 记录',
      desc: '4Gi 限额下有没有 OOM 前科',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-oom'],
      hypotheses: [{ id: 'h-oom', status: 'down' }],
      result: {
        type: 'text',
        title: 'OOMKill 历史',
        text: '近 90 天 OOMKill：0 次（当前各服务限额未统一时配置各异）。\n→ 统一 4Gi 后报表服务（3.2Gi 稳态）将贴顶运行——未来 OOM 的高危种子。',
      },
    },
    {
      id: 'a-probe',
      name: '评估统一探针参数',
      desc: '30s 间隔对启动慢的服务意味着什么',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-probe'],
      hypotheses: [{ id: 'h-probe', status: 'excluded' }],
      result: {
        type: 'text',
        title: '探针评估',
        text: '17 个服务启动时间 < 5s，30s 间隔探针无误杀。\n→ 探针参数可接受（建议预留 startupProbe 兜底），非阻断项。',
      },
    },
    {
      id: 'a-waste',
      name: '算一笔资源浪费账',
      desc: '统一限额的隐性成本',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '浪费账',
        text: '静态内容类 5 个服务：实际 200Mi × 统一 4Gi = 每个浪费 3.8Gi。\n17 服务合计超配约 40Gi 内存——为"管理简单"支付的隐性资源账单。\n→ 统一限额不仅埋事故，还在烧钱。',
      },
    },
    {
      id: 'a-minspec',
      name: '开出最小修正清单',
      desc: '按画像分级 + 指标修正',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-uniform', 'h-hpa'],
      hypotheses: [
        { id: 'h-uniform', status: 'confirmed' },
        { id: 'h-hpa', status: 'confirmed' },
      ],
      result: {
        type: 'text',
        title: '评审结论 · 修正清单',
        text: '① 限额按资源画像分级（五类画像五档配置），采集常态化\n② HPA 指标：网关类服务改 event loop lag 自定义指标，其余按画像定\n③ 探针保留 + startupProbe 兜底\n→ 三项补齐后评审通过；统一治理目标改为"统一治理框架，分级配置"。',
      },
    },
    {
      id: 'a-golive',
      name: '按原方案全量推行统一限额',
      desc: '【状态变更】不等画像采集，全量 2C4G',
      cost: 3,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '推行结果',
        text: '全量推行第一周：报表服务 OOMKill ×2、网关高峰节流投诉 ×5。\n"统一管理"上线，"稳定运行"下线。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-uniform', text: '核心阻断缺陷：统一 2C4G 限额忽略 17 个服务的资源画像差异——高 CPU 服务被节流、大内存服务 OOM 在即、低耗服务浪费 40Gi，节流/OOM/浪费并存', correct: true },
    { id: 'rc-hpa', text: '真实风险：HPA 按 CPU 均值扩容，事件循环阻塞时均值仅 25%——扩容永远不触发，指标与故障模式错配', correct: false },
    { id: 'rc-probe', text: '统一就绪探针误杀启动慢的服务', correct: false },
    { id: 'rc-oom', text: '4Gi 限额导致大面积 OOMKill 历史复发', correct: false },
  ],

  expertCost: 7,
  restartActionId: 'a-golive',

  expertChain: [
    {
      thought: '统一治理要先问："统一"的前提是什么？——17 个服务的资源画像是否一致。不一致的统一，就是伪简化。',
      update: '"管理简单"的理由成立，但前提（画像一致）不成立——抽样已显示五类画像并存。',
      actionId: 'a-uniform',
      why: '1⚡ 评审统一类方案的核心问句："统一的前提是什么"——管理的简化不能以忽略被管理对象的差异为代价。',
      conclusion: '统一前提不成立 → 采集画像量化差异。',
    },
    {
      thought: '资源画像用历史监控数据说话：让 17 个服务自己报告"我需要什么"。',
      update: '五类画像：单核敏感/大内存/高 CPU 峰值/低耗稳态——节流、OOM、浪费并存，统一 2C4G 无法同时满足。',
      actionId: 'a-profile',
      why: '2⚡ 资源画像是容量治理的事实基础：用数据代替直觉，"该大的大不了、该小的小不了"从感觉变成可量化的结论。',
      conclusion: '分级限额为核心阻断缺陷 → 连带审查 HPA 指标。',
    },
    {
      thought: 'HPA 的扩容指标要能"看见"故障模式：CPU 均值看不见事件循环的单核阻塞——上季度事故已证明（扩容 0 次触发）。',
      update: 'HPA 指标与故障模式错配实锤：事件循环类服务需 event loop lag 自定义指标。',
      actionId: 'a-hpa',
      why: '2⚡ 联动历史事故是评审的免费证据：上季度 event-loop 事故期间 HPA 零触发——历史数据已经验证了指标错配。',
      conclusion: 'HPA 指标修正列入清单 → 排除其余假设。',
    },
    {
      thought: '探针合理、OOM 无历史、浪费账算清——证据闭合，修正清单可交付。',
      update: '停止评审。有条件通过：画像分级限额 + HPA 指标修正，统一治理框架保留。',
      actionId: '',
      why: '【评审停止规则】两个核心缺陷（一刀切/指标错配）都有对应修正且不影响"统一治理"的目标——统一的是框架，分级的是配置。',
      conclusion: '有条件通过：画像分级限额 + 自定义 HPA 指标，统一治理框架改为"分级配置"。',
    },
  ],

  lessons: [
    {
      text: '统一限额是伪简化：17 个服务的资源画像不同，一种配置无法同时避免节流、OOM 和浪费。',
      principle: '架构设计：容量治理的正确姿势是"统一治理框架，分级配置参数"——先采集资源画像，再按画像分档。管理的简化来自框架统一，不是参数统一。',
    },
    {
      text: 'HPA 的扩容指标必须与服务的故障模式匹配：CPU 均值看不见事件循环的单核阻塞。',
      principle: '程序设计：Node/单线程类服务的扩容指标用 event loop lag 自定义指标；CPU 均值类指标只对"并发消耗 CPU"的服务有效。指标与故障模式错配 = 扩容失明。',
    },
    {
      text: '评审统一类方案的钥匙问句："统一的前提是什么？"',
      principle: '架构评审方法论：任何"统一 X"的方案，先验证被统一对象的一致性。前提不成立的统一，是把差异问题推迟到运行时爆发。',
    },
    {
      text: '统一限额在烧两笔钱：事故成本（节流/OOM）+ 资源成本（超配 40Gi）——管理简单不是免费的。',
      principle: '产品思维：容量治理的成本 = 资源账单 + 事故损失。"管理简单"省下的人力成本，要用这两笔账来付——算完账再决定统一还是分级。',
    },
  ],
}
