import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 读懂报错 第三批（跨服务日志关联 L2）
 * 教学点：全栈视野——一个请求跨三跳，没有关联 ID 就是三段平行宇宙；
 * requestId 透传（HTTP 头 → MDC → 日志）是分布式排查的毛细血管。
 * 专家路径：impact(1) + correlate(2) + tzcheck(1) = 4⚡︎
 */
export const logCorrelationCase: DiagnosisCase = {
  id: 'log-correlation',
  title: '报错在 C 服务，日志却只在 A 服务搜得到',
  intro: '下单失败跨了三个服务，三段日志"各自完整"却互不相认——没有关联 ID，排查就是三段平行宇宙。',
  domain: 'runtime',
  layer: '关联 ID 是分布式日志的毛细血管——透传到哪，因果就通到哪',
  part: 'apprentice',
  chapterId: 'error-reading',
  order: 3,
  typeTags: ['observability', 'process'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」的新人后端，第二个线上问题：下单失败的根因藏在你看不见的那段日志里。',
    architecture: '网关(生成 requestId) → 订单服务 A → 优惠券服务 B → 库存服务 C ｜ 三段日志分散在各自的 ELK 索引',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '三段日志（各说各话）',
        text: 'A 服务日志：10:00:09  "B 调用失败: timeout" —— 是 B 慢\nB 服务日志：10:00:09  "C 调用异常: read timeout" —— 是 C 慢\nC 服务日志：10:00:09  （什么都没找到——搜"下单失败"零命中）\n每一段都"逻辑自洽"，但拼不出因果。',
      },
      {
        type: 'text',
        title: '新人的困惑',
        text: '时间都接近 10:00:09，可这是同一次下单吗？\n高峰期每秒几百单——三段"接近"的日志，可能来自三个完全不同的请求。',
      },
    ],
    timeline: '故障持续 20 分钟（每天晚高峰出现 10~20 分钟）｜ A/B 服务日志带 requestId，C 服务没有 ｜ 用户贴来的截图只有 B 的报错',
    impactHint: '高峰期"时间接近"不是证据——需要一根线把三段日志串成"同一个请求"。这根线在哪、断在哪？',
  },

  hypotheses: [
    { id: 'h-chain', text: 'requestId 贯穿三段：用同一条 ID 拉齐日志，因果链可见（A 等 B、B 等 C、C 在 GC）', excludeActionId: 'a-correlate' },
    { id: 'h-tz', text: '三服务时区配置不一致，"时间接近"是时区差造成的错觉', excludeActionId: 'a-tzcheck' },
    { id: 'h-level', text: 'C 服务 ERROR-only 日志级别，成功/慢请求无痕迹，时间线天然断', excludeActionId: 'a-loglevel' },
    { id: 'h-retry', text: 'A 的重试产生多份同参数日志，人肉搜索会串到别的请求', excludeActionId: 'a-retrycount' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '盘点三段日志的"关联键"存量',
      desc: '影响面：哪些服务打了 requestId、哪些没打',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '关联键存量盘点',
        text: '网关：requestId=req-7712…（生成 + 打印）✓\nA 服务：日志带 requestId ✓（HTTP 头透传 + MDC）\nB 服务：日志带 requestId ✓（同上）\nC 服务：日志无 requestId ✗（老服务，接入 MDC 前的遗留）\n→ 三段里两段有钥匙——缺的是 C：恰好它是最深的嫌疑层。',
      },
    },
    {
      id: 'a-correlate',
      name: '用 requestId 拉齐三段日志',
      desc: '同一条 req-7712，三段日志变成一个故事',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-chain'],
      hypotheses: [{ id: 'h-chain', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'requestId=req-7712a 的完整故事',
        text: 'A 10:00:01.200  调 B（超时设置 8s）\nB 10:00:01.250  收到，调 C（无超时设置！）\nC 10:00:01.270  ——（无日志；但主机监控：FullGC 停顿 7.8s）\nB 10:00:09.300  C 读超时，抛异常\nA 10:00:09.320  B 调用超时（累计 8s 触发）\n→ 因果链完整：C 的 FullGC 7.8s 拖住 B，B 拖垮 A。C 侧虽无业务日志，主机 GC 曲线补上最后一环。',
      },
    },
    {
      id: 'a-tzcheck',
      name: '核对三服务时区配置',
      desc: '排除时区错觉',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-tz'],
      hypotheses: [{ id: 'h-tz', status: 'excluded' }],
      result: {
        type: 'text',
        title: '时区核对',
        text: '三服务 JVM/容器时区统一 UTC+8（镜像统一模板）。\n→ 排除时区：时间戳可比。',
      },
    },
    {
      id: 'a-loglevel',
      name: '核对 C 服务的日志级别策略',
      desc: '评估"成功无日志"的影响',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-level'],
      hypotheses: [{ id: 'h-level', status: 'down' }],
      result: {
        type: 'text',
        title: '日志级别评估',
        text: 'C 服务生产环境仅 ERROR + WARN（GC GC WARN 恰好在）——慢请求无业务日志。\n→ 降权为改进项：本次靠 GC 曲线补位破案；但"慢请求无 INFO"让下次更隐蔽。列入整改（耗时日志/慢请求采样）。',
      },
    },
    {
      id: 'a-retrycount',
      name: '核对 A 的重试配置',
      desc: '排除重试串线',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-retry'],
      hypotheses: [{ id: 'h-retry', status: 'excluded' }],
      result: {
        type: 'text',
        title: '重试核对',
        text: 'A→B 无重试（单次调用）；同 requestId 日志唯一。\n→ 排除串线：req-7712a 的故事是独一份的。',
      },
    },
    {
      id: 'a-danger',
      name: '临时把三服务日志合到一个索引混搜',
      desc: '【状态变更】合并索引"方便搜索"',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '合并结果（陷阱动作）',
        text: '三服务日志混入同一索引：搜索结果噪声 ×3，没有 requestId 依然无法关联——\n方便的感觉有了，破案能力没变，ELK 存储成本翻倍。\n→ 复盘点评：把日志放一起 ≠ 让日志关联。关联靠键，不靠邻居。',
      },
    },
    {
      id: 'a-fixmdc',
      name: '修复：C 服务补 requestId（MDC 透传）',
      desc: '【状态变更】C 服务接入 MDC：HTTP 头收 requestId → 全链路日志携带',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '透传补齐',
        text: 'C 服务拦截器接收 X-Request-Id → MDC.put → logback 模板输出。\n回归：req-7712b 三段日志一键串联——"三段平行宇宙"合并。',
      },
    },
    {
      id: 'a-fixspread',
      name: '沉淀：关联键规范',
      desc: '【状态变更】规范：网关生成 → 头透传 → MDC 落日志；新服务接入 checklist 必查项',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '关联键规范',
        text: 'requestId 规范：网关生成（无则自造）→ 每一跳透传 → MDC → 日志格式模板。\n新服务接入 checklist 新增："日志含 requestId"必查——关联键的断链在接入时拦下。',
      },
    },
    {
      id: 'a-fixgc',
      name: '沉淀：C 服务 GC 治理工单',
      desc: '【状态变更】7.8s FullGC 另立 P2 工单（堆分析 + 分代调优）——本案的"下回分解"',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '工单拆分',
        text: '本案（日志关联）与 GC 治理是两个问题：前者已修，后者立 P2 工单（堆 dump 分析 + 堆参数调优）。\n排查的边界感：找到根因 ≠ 顺手修完所有病——每个病有自己的工单与优先级。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-chain', text: 'C 服务日志无 requestId（MDC 未接入）且 FullGC 停顿 7.8s 拖垮 B、B 拖垮 A——三段日志因关联键断链而"各自完整、互不相认"，排查退化为拼图', correct: true },
    { id: 'rc-tz', text: '三服务时区不一致导致时间戳错位', correct: false },
    { id: 'rc-level', text: 'C 服务日志级别过高无慢请求痕迹（改进项）', correct: false },
    { id: 'rc-retry', text: '重试产生重复日志导致人肉搜索串线', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '高峰期"时间接近"不是证据——先盘点三段日志的关联键存量：线在哪里、断在哪里。',
      update: 'A/B 有 requestId、C 没有——断链位置恰好是最深的嫌疑层。',
      actionId: 'a-impact',
      why: '1⚡︎ 关联键盘点把"拼不了图"的原因可视化：不是缺拼图块，是缺拼法——C 的断链既是排查障碍，本身也是待修缺陷。',
      conclusion: '修复与排查双线确立（h-chain 升权）。',
    },
    {
      thought: '用 requestId 拉齐三段——让"同一个请求"的三段日志讲一个完整的故事。',
      update: '实锤：C FullGC 7.8s → B 超时 → A 超时；C 无业务日志，主机 GC 曲线补上最后一环。',
      actionId: 'a-correlate',
      why: '2⚡︎ 关联键拉齐是分布式日志排查的核心动作：三段"各自完整"的日志被一根线串成因果链——没有这根线，每段都是平行宇宙。',
      conclusion: '因果链闭合。',
    },
    {
      thought: '时区错觉假设 1⚡︎ 排除——"时间接近是不是假的"必须先验证，否则整条链可疑。',
      update: '时区统一——时间戳可信，链条成立。',
      actionId: 'a-tzcheck',
      why: '1⚡︎ 时间戳的可信度是日志关联的地基：时区/时钟偏差没排除前，任何"先后关系"都可能是错觉。',
      conclusion: '地基验证完毕。',
    },
    {
      thought: '日志级别降权（GC 曲线补位破案）、重试串线排除、止血陷阱点评、MDC 修复 + 规范。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】断链（C 无 requestId）✓ 因果（GC 链）✓ 防线（MDC 规范）✓——机制、因果、防线三层闭合；GC 治理按边界感另立工单。',
      conclusion: '沉淀：关联 ID 是分布式日志的毛细血管——透传到哪，因果就通到哪；把日志放一起不等于让日志关联。',
    },
  ],

  lessons: [
    {
      text: '一个请求跨三跳，没有关联 ID 就是三段平行宇宙：requestId 透传到哪，因果就通到哪。',
      principle: '全栈视野：关联键规范（网关生成 → HTTP 头透传 → MDC 落日志）是分布式系统的毛细血管。新服务接入 checklist 必查"日志含 requestId"——断链的代价是每次跨服务故障都退化为人肉拼图。',
    },
    {
      text: '把日志放一起 ≠ 让日志关联：合并索引只带来噪声翻倍——关联靠键（requestId/traceId），不靠邻居。',
      principle: '验证思维：日志类止血动作要回答"它提升了关联能力吗"。合并索引是"物理相邻"的伪解法；真正让三段日志互认的是那根键——修复前先问：缺的是位置，还是身份？',
    },
    {
      text: '排查找到根因 ≠ 顺手修完所有病：GC 治理是独立的 P2 工单——边界感让每个病有自己的优先级。',
      principle: '沉淀思维：一次排查常牵出多个问题（日志断链 + GC 停顿）。主案修主线，连带病立工单记档——把"下回分解"制度化，比在主案里越修越散更专业。',
    },
  ],
}
