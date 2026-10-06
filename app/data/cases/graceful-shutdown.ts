import { DiagnosisCase } from '../../types/case'

/**
 * 第 14 章 · 部署与发布 第三批（优雅停机缺失 L2）
 * 教学点：程序设计——SIGTERM 不是"立刻死"，是"善后的机会"：停收新请求 → 清空在途 → 再退出；
 * 发布期损伤分两段（摘流延迟 + 强杀斩断），两段要分别治理。
 * 专家路径：impact(1) + sigaudit(2) + drainlog(1) = 4⚡︎
 */
export const gracefulShutdownCase: DiagnosisCase = {
  id: 'graceful-shutdown',
  title: '每次发布都有一波 499：杀进程杀得太急',
  intro: '每次滚动发布后两分钟内必现错误率毛刺：请求正在处理时进程被杀——优雅停机从来没有配置过。',
  domain: 'deploy',
  layer: 'SIGTERM 不是立刻死，是善后的机会——停收新、清在途、再退出',
  part: 'master',
  chapterId: 'deployment',
  order: 6,
  typeTags: ['deploy', 'config', 'resource'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」支付网关服务的负责人，发布日历上的"常规毛刺"已经持续了半年。',
    architecture: 'LB → 网关服务(k8s Deployment 滚动发布, terminationGracePeriod 30s) → 上游服务',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '发布时刻监控',
        text: '每次发布：错误率毛刺 2~5%，持续约 40 秒后归零（平时 0.01%）。\n构成：499（客户端等不及主动断开）1.8% + 502（上游连接被断）0.4%。',
      },
      {
        type: 'text',
        title: '被斩请求画像',
        text: '被中断的请求 78% 是长请求（支付回调确认、批量查询，> 2s）。\nk8s 事件：SIGTERM 后 30 秒整，SIGKILL 到达——处理中的请求被拦腰斩断。',
      },
    ],
    timeline: '近 30 次发布毛刺 100% 复现 ｜ 应用未实现 SIGTERM 处理（代码里搜不到 shutdown hook）｜ LB 摘流依赖 endpoint 传播（约 15s）',
    impactHint: '毛刺的两段构成不同：前 15 秒的 499 和 30 秒时刻的 502 是两回事——进程被杀前的最后 30 秒，它在做什么？',
  },

  hypotheses: [
    { id: 'h-graceful', text: '无优雅停机：SIGTERM 后既不停止收新请求也不清空在途，30s 后被 SIGKILL 斩断', excludeActionId: 'a-sigaudit' },
    { id: 'h-lbsync', text: 'LB 摘流晚于容器终止：已停止服务的实例还在收新流量', excludeActionId: 'a-drainlog' },
    { id: 'h-connreuse', text: '客户端复用了已被终止实例的长连接', excludeActionId: 'a-connclose' },
    { id: 'h-startup', text: '新实例未就绪就接流量，启动期请求失败', excludeActionId: 'a-readiness' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '按时间轴切分发布期错误',
      desc: '影响面：毛刺两段的构成与时刻',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '发布期错误时间轴（单实例视角）',
        text: 'T+0    SIGTERM 下发\nT+0~15s  499 波段：LB 尚在灌流量，实例响应变慢（连接池在关闭？）客户端等不及\nT+30s    SIGKILL → 502 波峰：在途长请求被斩断\nT+40s    毛刺归零\n→ 两段损伤两段根因：前段的"还在收流量"，后段的"在途请求被斩"。',
      },
    },
    {
      id: 'a-sigaudit',
      name: '审计进程对 SIGTERM 的处理',
      desc: '收到 SIGTERM 后应用做了什么（还是什么都没做）',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-graceful'],
      hypotheses: [{ id: 'h-graceful', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '信号处理审计 + 实验',
        text: '代码审计：零 shutdown hook——SIGTERM 被默认行为处理（JVM 退出）。\n行为实验：对运行实例发 SIGTERM 后继续发请求：\n  新请求：仍被受理（进程没拒绝）→ 等于排队等死\n  在途长请求：30s 后随 SIGKILL 被斩断 → 502\n实锤：既不停收、也不清空——SIGTERM 的 30 秒善后窗口被完全浪费。',
      },
    },
    {
      id: 'a-timeline',
      name: '重建单实例终止的完整时间线',
      desc: '两段损伤的精确机制闭合',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '终止时间线重建',
        text: 'T+0     SIGTERM → 应用无处理，继续照常服务\nT+0~15s LB endpoint 传播未完成 → 新流量继续进入（499 源：响应变慢+客户端超时）\nT+15s   LB 摘流完成 → 新流量停\nT+30s   SIGKILL → 在途请求（最长 20s 的支付确认）集体斩断（502 波峰）\n→ 修复清单自然浮现：①SIGTERM 时立即停收 ②清空在途 ③摘流提前（preStop sleep）。',
      },
    },
    {
      id: 'a-drainlog',
      name: '核对 LB 摘流的传播延迟',
      desc: '评估摘流与终止的时间差',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-lbsync'],
      hypotheses: [{ id: 'h-lbsync', status: 'down' }],
      result: {
        type: 'text',
        title: '摘流延迟核对',
        text: 'endpoint 变更传播到 LB 生效：10~15s（k8s→LB 健康检查间隔）。\n→ 降权为"前段"贡献者：它解释前 15s 的 499；后段 502 主凶仍是 SIGKILL 斩断。治理方案两者都覆盖（preStop sleep 给摘流留时间）。',
      },
    },
    {
      id: 'a-connclose',
      name: '核对客户端连接状态',
      desc: '排除复用死连接',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-connreuse'],
      hypotheses: [{ id: 'h-connreuse', status: 'excluded' }],
      result: {
        type: 'text',
        title: '连接核对',
        text: '499 由客户端主动断开（等待超时），非"复用已死连接"的立即 reset。\n→ 排除连接复用问题。',
      },
    },
    {
      id: 'a-readiness',
      name: '核对新实例就绪与流量接入',
      desc: '排除启动期问题',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-startup'],
      hypotheses: [{ id: 'h-startup', status: 'excluded' }],
      result: {
        type: 'text',
        title: '就绪核对',
        text: '就绪探针配置正确：新实例 100% 就绪后接流量，启动期零失败。\n→ 排除新实例侧：损伤全部在"旧实例的死法"上。',
      },
    },
    {
      id: 'a-danger',
      name: '发布流程改为"手动摘流+等 5 分钟再重启"',
      desc: '【状态变更】值班员人肉预摘流，确认零流量后手动重启',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '人肉流程结果',
        text: '错误率归零。代价：单次发布 40min（原 4min）、依赖值班员不摸鱼、步骤不可审计。\n→ 止血证明"摘流+清空"方向正确，但人肉流程不可持续——要把它变成代码与编排。',
      },
    },
    {
      id: 'a-fixgraceful',
      name: '修复：优雅停机三步 + preStop 摘流缓冲',
      desc: '【状态变更】SIGTERM handler：停收新→清空在途(上限 25s)→主动关连接；preStop sleep 15s',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① SIGTERM handler：立即停止受理新请求（返回 503 由 LB 重试其他实例）\n② 等待在途请求完成，上限 25s（< 30s grace，留 5s 余量）\n③ 主动关闭空闲长连接（发 Goaway，客户端立刻切换其他实例）\n④ preStop hook: sleep 15s——给 LB 摘流传播留时间窗\n回归演练：滚动发布 × 10 次，发布期错误率 0.01%（与平时持平）。',
      },
    },
    {
      id: 'a-fixdrill',
      name: '沉淀：发布演练进验收',
      desc: '【状态变更】验收标准：滚动发布中注入 500 个长请求，被斩断数 = 0',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '演练验收',
        text: '发布演练脚本：发布瞬间持续注入长请求，统计被斩断数。\n验收线：0 斩断。"优雅停机"从代码注释里的愿望变成 CI 里可执行的断言。',
      },
    },
    {
      id: 'a-fixmon',
      name: '沉淀：在途请求清零监控',
      desc: '【状态变更】SIGTERM 后输出"在途请求数"指标，清零才允许退出',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '观测 v2',
        text: '终止期指标：在途请求数 / 已等待时长 / 被迫放弃数（超 25s 上限）。\n"被迫放弃数 > 0"即告警——grace 窗口不够用时它会说话，而不是默默斩断。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-graceful', text: '应用未实现优雅停机：SIGTERM 后既不停止受理新请求也不等待在途请求完成，30s 后被 SIGKILL 斩断全部在途请求；叠加 LB 摘流传播延迟 15s——发布期两段损伤（499 前段 / 502 后段）', correct: true },
    { id: 'rc-lbsync', text: 'LB 摘流晚于容器终止，终止实例继续收新流量（前段贡献者）', correct: false },
    { id: 'rc-connreuse', text: '客户端复用已终止实例的长连接', correct: false },
    { id: 'rc-startup', text: '新实例未就绪即接流量导致启动期失败', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '毛刺 40s 但 grace 是 30s——先按时间轴切分错误：两段损伤的构成不同，根因可能不止一个。',
      update: '前段 499（LB 还在灌流量）+ 后段 502（SIGKILL 斩在途）——两段两问：为什么还在收？为什么不善后？',
      actionId: 'a-impact',
      why: '1⚡︎ 时间轴切分把"一次毛刺"分解成两个独立问题：混合叙事会让修复只补一半——40s vs 30s 的数字差本身就在提示分段。',
      conclusion: '嫌疑锁定：终止流程无善后（h-graceful 升权）。',
    },
    {
      thought: '审计进程对 SIGTERM 的行为——代码里搜不到 handler，就用实验看它的真实行为。',
      update: '实锤：零 shutdown hook；SIGTERM 后照常收新请求、在途请求等死——30s 善后窗口全程浪费。',
      actionId: 'a-sigaudit',
      why: '2⚡︎ 信号处理实验比代码审计更狠：它验证了"收到信号后的真实行为"——修复方案的三步（停收/清空/关连接）直接从实验观察反推。',
      conclusion: '根因实锤：优雅停机缺失。',
    },
    {
      thought: '重建完整终止时间线——把两段损伤的每一秒都归位到具体环节。',
      update: '时间线闭合：摘流延迟贡献前段，SIGKILL 贡献后段；修复清单三件套自然浮现。',
      actionId: 'a-timeline',
      why: '1⚡︎ 时间线重建是修复设计的图纸：每一段损伤对应一个缺失的动作——停收（前段）、清空（后段）、摘流缓冲（衔接）。',
      conclusion: '修复方案成形。',
    },
    {
      thought: '摘流延迟单独量化并降权——它是前段贡献者，不是主凶；连接复用与就绪探针快排留证。',
      update: '摘流 10~15s（down）、连接复用排除、就绪正常——损伤全部聚焦在"旧实例的死法"。',
      actionId: 'a-drainlog',
      why: '1⚡︎ 多因素叙事要给每个因素定权重：摘流是"前段贡献者"而非主凶——权重定了，修复的优先级与验收标准才不会散。',
      conclusion: '嫌疑收敛 → 人肉止血验证方向 → 落地为代码。',
    },
    {
      thought: '人肉流程验证了方向，落地为 SIGTERM handler + preStop + 演练验收 + 清零监控。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（无善后）✓ 两段损伤（摘流+强杀）✓ 验收（演练断言）✓——机制、修复、验收三层闭合。',
      conclusion: '沉淀：SIGTERM 是善后的邀请函——停收新、清在途、再退出，三步一个都不能少。发布期错误率不是宿命，是进程死法的影子。',
    },
  ],

  lessons: [
    {
      text: 'SIGTERM 不是立刻死，是善后的邀请函：停收新请求 → 等在途请求完成 → 主动关连接 → 再退出。',
      principle: '程序设计：优雅停机三步缺一不可——只停收不清空（斩在途）、只清空不停收（越清越多）。grace 窗口要留余量（处理上限 25s < 30s grace），"被迫放弃数"指标让窗口不够用时自己说话。',
    },
    {
      text: '发布期损伤常分两段：摘流延迟段的 499 与强杀段的 502 是两个问题——时间轴切分后各治各的。',
      principle: '验证思维：把毛刺按时间轴切分归段，每段对准一个缺失的动作。混合叙事的修复只补一半——40s 毛刺 vs 30s grace 的数字差就是分段的提示。',
    },
    {
      text: '人肉止血验证方向，代码落地才可持续："摘流再重启"人肉跑一遍正确，就要把它变成 preStop hook 与演练断言。',
      principle: '流程设计：人肉流程证明"摘流+清空"有效后，立即固化为编排（preStop sleep）与验收（注入长请求，斩断数=0）。可持续的正确 = 让正确不依赖值班员的注意力。',
    },
  ],
}
