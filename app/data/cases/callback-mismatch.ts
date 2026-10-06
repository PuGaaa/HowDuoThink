import { DiagnosisCase } from '../../types/case'

/**
 * 第 9 章 · 并发迷宫 结业（并发回调结果串位 L2）
 * 教学点：程序设计——闭包捕获共享变量 × 并发交错 = 结果串位；
 * 异步回调必须携带显式上下文对象；敏感投递要有"附件与收件人一致性"断言。
 * 专家路径：impact(1) + closureread(2) + repro(1) = 4⚡︎
 */
export const callbackMismatchCase: DiagnosisCase = {
  id: 'callback-mismatch',
  title: 'A 的财务报表，发进了 B 的邮箱',
  intro: '批量导出的报表偶发发错收件人：0.2% 的附件与收件人错配——并发回调里，结果串了位。',
  domain: 'concurrency',
  layer: '闭包捕获共享变量 × 并发交错 = 结果串位',
  part: 'master',
  chapterId: 'concurrency',
  order: 9,
  typeTags: ['race', 'security', 'data'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」报表平台的后端，财务总监的一封质询邮件让整个团队脊背发凉。',
    architecture: '导出请求 → 任务池(并发 50) → 报表生成回调 → 邮件服务(按请求携带的收件人发送)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '审计发现',
        text: '30 天 12 例：报表附件与收件人错配（B 收到 A 的门店财务数据）。\n全部是敏感级报表——财务/薪酬/供应商结算。',
      },
      {
        type: 'text',
        title: '日志表象',
        text: '生成成功 ✓ 邮件发送成功 ✓ 每一步"看起来都对"。\n错配对的两次请求：提交时间间隔 < 50ms（同一批并发提交）。',
      },
    ],
    timeline: '批量导出功能上月优化：单任务循环改为并发提交（提速 8 倍）｜ 错配自此出现 ｜ 邮件服务零变更',
    impactHint: '错配只发生在"同一批并发提交"里——并发的哪一步，把 A 的结果贴给了 B 的信封？',
  },

  hypotheses: [
    { id: 'h-closure', text: '循环变量被闭包共享捕获：并发回调执行时读到的是"别的请求"的上下文', excludeActionId: 'a-closureread' },
    { id: 'h-map', text: 'requestId → 上下文 的映射表并发写冲突（非线程安全容器）', excludeActionId: 'a-mapcheck' },
    { id: 'h-mail', text: '邮件服务端队列乱序，按提交顺序错配', excludeActionId: 'a-maillog' },
    { id: 'h-form', text: '用户表单复用残留，本来就填错了收件人', excludeActionId: 'a-formcheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '给 12 例错配画并发画像',
      desc: '影响面：错配对的时间关系、批次关系',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '错配画像',
        text: '12 例全部来自"批量提交"场景（单请求零错配）\n错配对：同批次内两个请求，提交间隔 < 50ms\n方向性：结果错配发生在"同批次"内——A 批的结果永远不会发到 C 批的人\n→ 错配被"批次"边界框住：串位的源头在批次内的共享结构。',
      },
    },
    {
      id: 'a-closureread',
      name: '解剖批量提交的闭包结构',
      desc: '回调里引用的"收件人"变量，到底是谁的',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-closure'],
      hypotheses: [{ id: 'h-closure', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '代码解剖（Node 报表服务）',
        text: 'for (var r of batch) {\n  pool.submit(() => render(r.data).then(\n    res => mailer.send(res, r.recipient)   ← r 是 var：整个循环共享同一个绑定\n  ))\n}\n并发语义：所有回调共享同一个 r 绑定 → 回调真正执行时，\nr 已经是循环"后来者"的值 → A 的结果 + B 的收件人。\n实锤：共享绑定 × 异步交错 = 串位。单请求（绑定不变）永远正确——与画像吻合。',
      },
    },
    {
      id: 'a-repro',
      name: '受控复现：并发度与错配率',
      desc: '批量大小、并发数、错配率的三角实验',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '复现矩阵',
        text: '串行提交（batch 逐个 await）：错配 0/1000\n并发提交（batch 50 并发）：错配 81/1000（8.1%）\n并发 + 循环内 const 副本：错配 0/1000 ✓\n→ 变量隔离完成：触发条件 = 并发 × 共享绑定；修复一行 const 即归零——但制度修复不止一行。',
      },
    },
    {
      id: 'a-mapcheck',
      name: '核对上下文映射容器',
      desc: '排除非线程安全容器',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-map'],
      hypotheses: [{ id: 'h-map', status: 'excluded' }],
      result: {
        type: 'text',
        title: '容器核对',
        text: 'requestId → 上下文 使用 Map（单线程事件循环内无写冲突）；错配对的线程轨迹无共享写。\n→ 排除容器问题。',
      },
    },
    {
      id: 'a-maillog',
      name: '核对邮件服务收到时的配对',
      desc: '错在上游还是邮件服务',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-mail'],
      hypotheses: [{ id: 'h-mail', status: 'excluded' }],
      result: {
        type: 'text',
        title: '邮件服务核对',
        text: '邮件服务收到的请求里，"附件与收件人"就已错配——它照单全发，忠实执行了错误的指令。\n→ 排除邮件服务：串位发生在它之前。',
      },
    },
    {
      id: 'a-formcheck',
      name: '核对表单提交原始数据',
      desc: '排除用户填错',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-form'],
      hypotheses: [{ id: 'h-form', status: 'excluded' }],
      result: {
        type: 'text',
        title: '表单核对',
        text: '12 例的表单提交记录：收件人填写与用户意图一致。\n→ 排除用户侧。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急切回串行导出',
      desc: '【状态变更】批量导出退回逐个 await',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '串行结果',
        text: '错配归零。代价：高峰导出排队 20 分钟，财务月结期间投诉上升。\n→ 止血保住了敏感数据边界；提速要用"正确的方式"找回来——上下文显式传递。',
      },
    },
    {
      id: 'a-fixcapture',
      name: '修复：显式上下文 + 一致性断言',
      desc: '【状态变更】const 局部副本 + 回调携带显式 ctx；发送前断言 res.ownerId === ctx.requesterId',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 循环内 const ctx = { requester, recipient, requestId } 闭包捕获副本\n② 恢复并发（提速 8 倍回归）\n③ 邮件发送前断言：res.ownerId !== ctx.requesterId → 拒发 + 告警\n回归：并发 1000 批 × 复现矩阵，错配 0；断言拦截 2 例"差点错配"（证明防线真实工作）。',
      },
    },
    {
      id: 'a-fixlint',
      name: '沉淀：异步上下文静态检查',
      desc: '【状态变更】lint：循环内 var 捕获拦截；异步回调禁止引用循环变量，必须走显式 ctx',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '工具守门',
        text: '静态检查上线：检出"异步回调引用循环绑定"直接拦截。\n全仓扫描另揪出 3 处同款隐患（通知/工单/对账模块）——一次学费，四处偿还。',
      },
    },
    {
      id: 'a-fixdual',
      name: '沉淀：敏感投递一致性断言制度化',
      desc: '【状态变更】所有"内容→收件人"类投递（邮件/短信/Push）统一发送前一致性断言',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '投递防线',
        text: '投递网关统一断言：payload.ownerId === envelope.recipientId，不一致拒发并告警。\n→ "串位"类缺陷从"静默泄露"升级为"秒级拦截"——不管上游怎么错，敏感数据出不了门。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-closure', text: '批量提交循环用 var 声明循环变量并被异步闭包共享捕获：并发回调执行时读到"别的请求"的收件人——A 的结果 + B 的信封，0.2% 敏感报表错配', correct: true },
    { id: 'rc-map', text: 'requestId 映射容器并发写冲突', correct: false },
    { id: 'rc-mail', text: '邮件服务队列乱序导致错配', correct: false },
    { id: 'rc-form', text: '用户表单复用残留填错收件人', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '错配被"批次"边界框住——先画并发画像：串位发生在批内的哪两个请求之间。',
      update: '错配对 = 同批 < 50ms 提交的两个请求；单请求零错配——串位源头在批内的共享结构。',
      actionId: 'a-impact',
      why: '1⚡︎ 边界画像省掉半次排查：错配不跨批 → 批间通信无辜；批内共享的只有循环变量与池——嫌疑空间瞬间收窄。',
      conclusion: '嫌疑锁定：批内共享绑定（h-closure 升权）。',
    },
    {
      thought: '解剖闭包结构：回调里的"收件人"变量，在执行那一刻到底是谁的。',
      update: '实锤：var 循环变量被全部回调共享，执行时读"后来者"的值——A 的结果贴 B 的信封。',
      actionId: 'a-closureread',
      why: '2⚡︎ 闭包解剖是 JS 并发串位的标准刑侦：异步回调的执行时机与捕获时机的错位，是"每步看起来都对"的唯一解释——日志不会说谎，但绑定会变脸。',
      conclusion: '根因实锤 → 复现矩阵钉死。',
    },
    {
      thought: '复现矩阵把因果与修复一起钉死：串行/并发/并发+副本 三个象限对照。',
      update: '并发 8.1% → const 副本归零：变量隔离完成；修复验收标准（错配 0）同时产出。',
      actionId: 'a-repro',
      why: '1⚡︎ 三象限实验一次回答"是什么、为什么、怎么修、修没修好"——并发问题的复现矩阵是最高性价比的实验设计。',
      conclusion: '因果钉死 → 排除旁支。',
    },
    {
      thought: '容器/邮件/表单三个常规嫌疑各 1⚡︎ 排除——每步"看起来都对"的案例，排除证据尤其重要。',
      update: '映射线程安全、邮件照单转发、表单无误——三个假设有证据排除。',
      actionId: 'a-mapcheck',
      why: '1⚡︎ "每步都对但结果错"的案例里，排除证据是防止自我怀疑的锚：每一步的无责证明串起来，剩下的闭环才是唯一的真相。',
      conclusion: '嫌疑收敛 → 修复 + 制度防线。',
    },
    {
      thought: '止血（串行）、修复（显式 ctx + 一致性断言）、门禁（lint）、制度（投递统一断言）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（共享绑定）✓ 复现（三象限）✓ 防线（投递断言）✓——个案、家族、兜底三层闭合。',
      conclusion: '沉淀：异步回调必须携带显式上下文——共享绑定在并发下会变脸；敏感投递的最后一道闸是"内容与收件人一致性断言"。',
    },
  ],

  lessons: [
    {
      text: '闭包捕获共享变量 × 异步交错 = 结果串位：回调执行时读到的绑定，早已不是提交时的那个。',
      principle: '程序设计：异步回调必须携带显式上下文对象（const 副本/ctx 参数），禁止引用循环绑定与外层可变变量。静态检查拦"循环内 var 捕获"——这类缺陷的修复是一行 const，防复发是规则进 lint。',
    },
    {
      text: '"每步看起来都对"的错配，要用边界画像收网：错配不跨批 = 批内共享结构有鬼——边界就是嫌疑人名单。',
      principle: '假设思维：数据串位类问题的第一动作是画"错配对的关系图"（时间/批次/空间邻居）——关系边界框住的范围就是共享结构所在。方向性（永不跨批）比错误率（0.2%）信息量大得多。',
    },
    {
      text: '敏感投递的最后一道闸是内容与收件人的一致性断言：不管上游怎么错，敏感数据不能出得了门。',
      principle: '防御式设计：投递网关统一断言 payload.ownerId === envelope.recipientId，不一致拒发告警——把"上游永远正确"的假设换成"上游错了也出不去"的保证。断言拦截记录（2 例差点错配）是防线真实工作的证明。',
    },
  ],
}
