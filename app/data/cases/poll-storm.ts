import { DiagnosisCase } from '../../types/case'

/**
 * 第 4 章 · 联调之夜 第四批（前端轮询风暴 L2）
 * 教学点：全栈视野——联调环境的负载是"所有打开的页面"贡献的：不销毁的定时器 × 后台标签页；
 * ETag/304 让轮询从"全量重传"变"轻问一句"。
 * 专家路径：impact(1) + timeraudit(2) + backendlog(1) = 4⚡︎
 */
export const pollStormCase: DiagnosisCase = {
  id: 'poll-storm',
  title: '午休时没人调用，联调环境却挂了',
  intro: '联调环境在午休时段自己超时：30 个开着的页面每 5 秒打一次接口——前端贡献的负载，后端背的锅。',
  domain: 'network',
  layer: '联调环境的负载是所有打开页面的总和——不销毁的定时器是隐形的军团',
  part: 'apprentice',
  chapterId: 'integration',
  order: 4,
  typeTags: ['network', 'resource', 'config'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」的联调环境管理员，一条诡异的曲线：午休时段——"没人干活"的时段——环境超时。',
    architecture: '30 个测试同学的开发机(浏览器页面常开) → 联调环境(单实例网关 + 服务) ｜ 前端页面: setInterval 轮询列表接口 5s',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '午休超时',
        text: '12:00-13:30：联调环境接口批量超时（网关 P99 8s）。\n同时段无任何发布、无脚本任务、后端日志处理耗时正常——"没人调用"的时段被打挂。',
      },
      {
        type: 'text',
        title: '网关日志的反常',
        text: '超时窗口内 QPS 360（平时 40）——流量来源全部是"列表轮询接口"。\n午休没人干活，QPS 反而 ×9。',
      },
    ],
    timeline: '新前端框架上线一周（页面轮询逻辑重写）｜ 超时自本周午休开始规律出现 ｜ 联调环境单实例容量 500 QPS',
    impactHint: '"没人调用"与"QPS ×9"矛盾——除非"调用的人"根本不是人。谁在替他们打接口？',
  },

  hypotheses: [
    { id: 'h-timer', text: '页面轮询定时器不销毁：切页/后台标签仍全速轮询——30 个常开页面 × 12 次/分 = 360 QPS', excludeActionId: 'a-timeraudit' },
    { id: 'h-backend', text: '后端午休批处理拖慢接口，前端表现只是症状', excludeActionId: 'a-backendlog' },
    { id: 'h-cache', text: '轮询接口无缓存无 ETag，每次全量返回放大流量（放大器）', excludeActionId: 'a-cachecheck' },
    { id: 'h-capacity', text: '联调环境容量本就不足，午休只是触发条件', excludeActionId: 'a-capacitycheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '对齐三条线：超时/QPS/人工活动',
      desc: '影响面：流量来源与"人在不在"的关系',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '三线对齐',
        text: '人工活动：午休（页面开着、人不操作）\nQPS：40 → 360（↑9 倍）——"没人"的时段流量最大\n流量构成：360 QPS 中 92% 是同一个列表接口的轮询\n→ 人不在、流量在——"机器在替人调用"。谁调的、为什么停不下来？',
      },
    },
    {
      id: 'a-timeraudit',
      name: '审计前端轮询的生命周期',
      desc: '定时器谁创建的、谁销毁的、后台标签还跑不跑',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-timer'],
      hypotheses: [{ id: 'h-timer', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '定时器生命周期审计',
        text: '新框架代码：mounted 时 setInterval(fetchList, 5000)\n路由切换：无 onUnmounted 清理 → 旧页面定时器继续跑（同一 SPA 内叠加）\n后台标签：Chrome 对 setInterval 有节流（≥1/min）——但"活动标签"全速；\n午休场景：30 个同学吃饭，屏幕未锁的 ~25 个活动页 × 12 次/分 + 后台节流页\n≈ 360 QPS ✓ 与网关数字吻合\n实锤：不销毁的定时器 × 常开的页面 = 隐形军团。',
      },
    },
    {
      id: 'a-backendlog',
      name: '核对后端处理耗时',
      desc: '排除后端慢',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-backend'],
      hypotheses: [{ id: 'h-backend', status: 'excluded' }],
      result: {
        type: 'text',
        title: '后端核对',
        text: '该接口处理耗时 P99 40ms 正常；无批处理任务。\n→ 排除后端：是请求量打满了单实例容量（360 + 正常调用 > 500 容量的排队阈值），不是处理慢。',
      },
    },
    {
      id: 'a-cachecheck',
      name: '核对轮询接口的缓存语义',
      desc: '评估"每次全量"的放大贡献',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'down' }],
      result: {
        type: 'text',
        title: '缓存评估',
        text: '轮询接口无 ETag/304：列表 50KB 每次全量重传——带宽 ×360 放大。\n→ 降权为放大器：即便响应小，360 QPS 的连接/处理也够打挂单实例——缓存让雪崩更早，不是雪崩的原因。',
      },
    },
    {
      id: 'a-capacitycheck',
      name: '核对环境容量基线',
      desc: '排除容量问题主导',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-capacity'],
      hypotheses: [{ id: 'h-capacity', status: 'excluded' }],
      result: {
        type: 'text',
        title: '容量核对',
        text: '单实例 500 QPS 容量对"9 个团队共用"本就偏小——但平时 40 QPS 从未告警。\n→ 排除容量主导：容量是背景（偏低），轮询风暴是触发（×9）——两者都要治理。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急给轮询接口加网关限流',
      desc: '【状态变更】每 IP 5 QPS 限流',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '限流结果',
        text: '环境保住（不再超时）。\n代价：页面的"实时刷新"变 429——测试同学反馈"列表不更新了"。\n→ 限流是止血：轮询的语义（实时性）没有被替代方案接住之前，砍掉它砍的是功能。',
      },
    },
    {
      id: 'a-fixlifecycle',
      name: '修复：定时器生命周期 + 推送替代',
      desc: '【状态变更】路由切换/页面隐藏暂停轮询；列表改 WebSocket 推送试点',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 生命周期修复：onUnmounted 清理 + visibilitychange 暂停（页面隐藏即停）\n② 列表更新改 WebSocket 推送试点（服务端有变更才推，替代盲轮询）\n③ 回归：午休 QPS 360 → 22（推送只推变更），环境零超时。',
      },
    },
    {
      id: 'a-fixcache',
      name: '沉淀：轮询接口 ETag 化',
      desc: '【状态变更】轮询类接口统一 ETag/304：无变化只回 header——重请求变轻问句',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'ETag 化',
        text: '轮询接口统一加 ETag：数据未变 → 304（0.2KB）。\n即便未来再出现轮询风暴，每次也是"轻问一句"——雪崩的临界点抬高一个数量级。',
      },
    },
    {
      id: 'a-fixdash',
      name: '沉淀：前端负载看板',
      desc: '【状态变更】联调环境按"页面/接口"维度统计轮询 QPS——前端贡献的负载可见化',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '看板上线',
        text: '按页面维度的前端负载看板：哪个页面的轮询占多少 QPS 一目了然。\n前端贡献的负载从"隐形军团"变成"有编制的部队"——联调容量的规划第一次算得清。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-timer', text: '前端轮询定时器不销毁（路由切换无清理、后台标签全速轮询）：30 个常开页面 × 12 次/分 = 360 QPS 打满单实例联调环境（500 QPS）——"没人调用"的时段流量最大', correct: true },
    { id: 'rc-backend', text: '后端午休批处理拖慢接口', correct: false },
    { id: 'rc-cache', text: '轮询接口无 ETag 全量重传（放大器）', correct: false },
    { id: 'rc-capacity', text: '联调环境容量不足（背景因素）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '"没人调用"与"QPS ×9"矛盾——先对齐三条线：超时、流量、人的活动。',
      update: '午休流量最大、来源全是轮询接口——"机器在替人调用"，人工活动与流量的反相关成立。',
      actionId: 'a-impact',
      why: '1⚡︎ 反相关是"非人流量"的签名：人多的时段流量小、人少的时段流量大——调用的主体必然不是人。',
      conclusion: '嫌疑锁定：页面自动轮询（h-timer 升权）。',
    },
    {
      thought: '审计定时器的一生：谁创建、谁销毁、后台标签还跑不跑——三个问题对应三种流量。',
      update: '实锤：切换不清、隐藏不停、活动页全速——隐形军团的兵源、纪律与战斗力全部查清。',
      actionId: 'a-timeraudit',
      why: '2⚡︎ 定时器生命周期审计把 360 QPS 拆成可归因的三部分——修复方案（清理/暂停/推送）恰好一一对应，解剖粒度直接生成修复清单。',
      conclusion: '根因实锤：定时器不销毁。',
    },
    {
      thought: '后端 1⚡︎ 排除——处理耗时正常，是量的问题不是慢的问题。',
      update: '处理 40ms 正常——容量排队（360+常规 > 500 的安全水位）而非处理瓶颈。',
      actionId: 'a-backendlog',
      why: '1⚡︎ "处理慢"与"请求多"的超时症状相同，解法天差地别——处理耗时数据是第一分界线。',
      conclusion: '嫌疑收敛 → 放大器与容量定权。',
    },
    {
      thought: '缓存放大器降权、容量背景确认、止血陷阱点评——修复三层（生命周期/推送/ETag）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（定时器不销毁）✓ 放大器（无 ETag）✓ 背景（容量偏小）✓——主因、放大、背景三层各有处置。',
      conclusion: '沉淀：联调环境的负载是所有打开页面的总和——不销毁的定时器是隐形军团，ETag 让军团轻装，推送让军团解散。',
    },
  ],

  lessons: [
    {
      text: '联调环境的负载是所有打开页面的总和：不销毁的定时器是隐形军团——人不在的时段，流量反而最大。',
      principle: '全栈视野：环境容量的规划必须包含"页面贡献的负载"。定时器生命周期三查（切换清理/隐藏暂停/后台节流）是前端的基本纪律——每一条漏掉的 clearInterval，都是环境容量的一笔隐形负债。',
    },
    {
      text: '"没人调用却打挂"的反相关 = 非人流量签名：定时器/重试风暴/爬虫——先确定"调用的主体是谁"，再谈容量。',
      principle: '假设思维：流量与人工活动的相关性是流量归因的第一线索。反相关时列出"非人调用者"（定时器/重试/爬虫/监控探针），逐个对流量曲线——主体的身份决定修复的武器（生命周期/退避/反爬/降频）。',
    },
    {
      text: '限流砍掉的是功能语义：轮询的"实时性"没有替代方案前，429 让功能降级——止血与替代方案要配套。',
      principle: '产品思维：紧急限流前先问"这个流量的业务语义是什么"——实时列表的语义由 WebSocket 推送接住，盲轮询才敢停。止血（限流）+ 替代（推送）+ 减负（ETag）三步同构，功能与容量兼得。',
    },
  ],
}
