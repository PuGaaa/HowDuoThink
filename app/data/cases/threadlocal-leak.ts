import { DiagnosisCase } from '../../types/case'

/**
 * 第 5 章 · 并发迷宫 第三批（ThreadLocal 残留串数据 L2）
 * 教学点：假设思维——"偶发串数据"的经典结构：线程池复用 + 上下文未清理 + 绕过写入路径的读取；
 * ThreadLocal 必须有确定性清理（finally remove）与 fail-fast 读取。
 * 专家路径：impact(1) + tlexamine(2) + threadreplay(1) = 4⚡︎
 */
export const threadlocalLeakCase: DiagnosisCase = {
  id: 'threadlocal-leak',
  title: '用户偶尔看到别人的收货地址',
  intro: '客服转来诡异工单：用户 A 偶尔看到用户 B 的收货地址。低频、随机、无法复现——数据像在池子里"串了"。',
  domain: 'concurrency',
  layer: '线程池复用线程——ThreadLocal 不清理，上下文就会穿越请求',
  part: 'master',
  chapterId: 'concurrency',
  order: 7,
  typeTags: ['race', 'data', 'security'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」用户中心服务的后端，三张"串数据"工单让你脊背发凉。',
    architecture: '网关(透传 X-User-Id) → 用户服务(Tomcat 线程池 200) → 上下文过滤器(写 ThreadLocal) → 业务代码(读 UserContext)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '客服工单 ×3',
        text: '用户 A 打开"我的地址"，页面显示用户 B 的收货地址与手机号尾号。\n接口日志：请求头 X-User-Id=A（正确），响应里却是 B 的地址数据。',
      },
      {
        type: 'text',
        title: '排查困境',
        text: '无法复现：回归测试全绿、压测两小时零复现、本地开发从没见过。\n三例分散在三天，无机型无区域聚集——像骰子随机掷中了谁。',
      },
    ],
    timeline: '上月引入上下文过滤器（ThreadLocal 传递用户身份，替代逐层传参）｜ 串数据工单自此出现 ｜ 业务代码三个月未改',
    impactHint: '偶发、无痕、无法复现——数据在一个请求里没换过手，那它是从哪"继承"来的？',
  },

  hypotheses: [
    { id: 'h-threadlocal', text: 'ThreadLocal 残留：异常请求路径漏清理，线程带着上一个用户的上下文回池，被下一个请求读到', excludeActionId: 'a-tlexamine' },
    { id: 'h-cachekey', text: '地址缓存键冲突：缓存键未带用户维度，不同用户互相覆盖', excludeActionId: 'a-cachekey' },
    { id: 'h-gateway', text: '网关透传错乱：连接复用时把 A 的请求头写给了 B 的请求', excludeActionId: 'a-gatewaylog' },
    { id: 'h-race', text: '异步任务共享上下文对象，两个用户的并行任务互相覆盖', excludeActionId: 'a-asyncshare' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '给三例工单做时间线考古',
      desc: '影响面：串数据时刻，那个线程刚经历过什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '三例工单的时间线考古',
        text: '例 1：串数据前 1.2s，同线程（tomcat-042）刚处理过一个抛异常的请求（NPE 日志）\n例 2：前 0.8s，同线程刚处理过参数校验失败的 400\n例 3：前 2.1s，同线程刚处理过下游超时异常\n共性：串数据的请求都"继承"了同线程上一个请求的上下文；\n且三例的读取路径都是"内部组件间接读 UserContext"（非显式传参）。\n→ 偶发骰子 = 异常路径 × 复用线程。',
      },
    },
    {
      id: 'a-tlexamine',
      name: '审计过滤器的清理逻辑',
      desc: 'ThreadLocal 的 set 与 remove 是否成对',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-threadlocal'],
      hypotheses: [{ id: 'h-threadlocal', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '过滤器代码审计',
        text: 'try {\n  UserContext.set(userId)          ← set 有\n  chain.doFilter(...)\n} catch (Exception e) {\n  log.error("unhandled", e)        ← 异常被吞，不 rethrow\n}\nfinally remove：没有！afterCompletion 只覆盖正常返回路径。\n另发现：拦截器注册排除了 /actuator/* 与 /internal/*——\n这些路径不执行 set，但公共组件照样读 UserContext。\n实锤：异常残留 × 绕过写入的读取 = 串数据。',
      },
    },
    {
      id: 'a-threadreplay',
      name: '定向复现：构造异常残留序列',
      desc: '指定同一线程：先发异常请求，再发绕过路径的读取请求',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '定向复现（100% 命中）',
        text: '步骤 1：向 tomcat-042 线程发一个会抛异常的请求（带用户 B 上下文）\n步骤 2：紧接着发 /internal/address-query（带用户 A，绕过过滤器）\n结果：响应包含 B 的地址——100% 复现，需同时满足两个条件：\n① 上一个请求异常路径漏清理 ② 当前请求绕过拦截器但读上下文。\n"无法复现"的真相：压测只打了正常请求，两个条件从未同时出现。',
      },
    },
    {
      id: 'a-cachekey',
      name: '核对地址缓存键结构',
      desc: '排除缓存串键',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cachekey'],
      hypotheses: [{ id: 'h-cachekey', status: 'excluded' }],
      result: {
        type: 'text',
        title: '缓存键核对',
        text: '键结构 addr:{userId}，用户维度齐全，无覆盖痕迹。\n→ 排除缓存串键。',
      },
    },
    {
      id: 'a-gatewaylog',
      name: '比对网关侧与服务端的请求头',
      desc: '排除网关透传错乱',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-gateway'],
      hypotheses: [{ id: 'h-gateway', status: 'excluded' }],
      result: {
        type: 'text',
        title: '请求头比对',
        text: '三例工单：网关出站 X-User-Id 与服务端入站完全一致，无误传。\n→ 排除网关。',
      },
    },
    {
      id: 'a-asyncshare',
      name: '审计异步任务的上下文使用',
      desc: '排除共享对象竞态（顺带发现隐患）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-race'],
      hypotheses: [{ id: 'h-race', status: 'excluded' }],
      result: {
        type: 'text',
        title: '异步任务审计',
        text: '异步地址任务显式传 userId 快照，不共享上下文对象——主路径排除。\n但顺带发现：任务的兜底逻辑里也读 UserContext.get()——\n它在异步线程上永远读不到正确值，属于同源隐患，列入整改。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急下线 ThreadLocal 上下文机制',
      desc: '【状态变更】回退为显式参数传递，Filter 整体摘除',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '上下文机制下线，全部改回显式传参——代码改动面 40 个文件，回滚包紧急发布。\n串数据通道物理关闭。隐私事件上报流程同步触发（3 例需按合规处理）。',
      },
    },
    {
      id: 'a-fixremove',
      name: '修复：确定性清理 + fail-fast 读取',
      desc: '【状态变更】finally remove 兜底 + 拦截器全路径覆盖 + get() 无值即抛',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① Filter 改为 try/finally remove——任何路径（含异常）必然清理\n② 拦截器覆盖全路径：/actuator 与 /internal 不再是"不写只读"的盲区\n③ UserContext.get() 改 fail-fast：无值直接抛异常，杜绝"读到别人的"这种静默错误\n定向复现序列重放 1000 次：零串数据。',
      },
    },
    {
      id: 'a-fixlint',
      name: '沉淀：ThreadLocal 静态检查',
      desc: '【状态变更】CI lint：ThreadLocal.set 必须在 try/finally 内配对 remove；上下文工具默认 fail-fast',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '规范落进工具',
        text: '静态检查上线：检出"set 无配对 remove"直接拦截合并。\n上下文组件收敛为唯一公共库（自带清理与 fail-fast），禁止业务自建 ThreadLocal。',
      },
    },
    {
      id: 'a-fixprobe',
      name: '沉淀：上下文残留探针',
      desc: '【状态变更】请求入口检测 ThreadLocal 非空残留，残留计数指标上线',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控 v2',
        text: '探针指标：请求开始时 ThreadLocal 非空 = 残留 +1。\n残留率 > 0 即告警——下次这类问题在第一单就现形，而不是等客服工单。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-threadlocal', text: 'ThreadLocal 上下文机制缺陷叠加：异常路径无 finally remove（线程带残留回池）+ 拦截器排除路径"不写但读"——上一个用户的上下文被后续请求静默继承，偶发串数据', correct: true },
    { id: 'rc-cachekey', text: '地址缓存键缺少用户维度，不同用户互相覆盖', correct: false },
    { id: 'rc-gateway', text: '网关连接复用时请求头透传错乱', correct: false },
    { id: 'rc-race', text: '异步任务共享上下文对象互相覆盖', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '三例工单的共同点藏在"看不见的前情"里——考古串数据时刻同线程的上一笔请求。',
      update: '三例前一秒同线程都有异常请求；读取路径都是"间接读上下文"——偶发骰子的两个面浮出。',
      actionId: 'a-impact',
      why: '1⚡︎ 线程池串数据类问题的第一证据是"线程的前情"：数据不会凭空串，它是被某个线程"随身带过来"的。',
      conclusion: '嫌疑锁定：ThreadLocal 残留 × 绕过写入的读取（h-threadlocal 升权）。',
    },
    {
      thought: '审计 set 与 remove 是否成对——上下文机制的全部正确性就在这一对操作里。',
      update: '实锤：异常路径无 finally remove + 拦截器盲区路径"不写只读"——残留通道完整。',
      actionId: 'a-tlexamine',
      why: '2⚡︎ 机制审计一查一个准：ThreadLocal 的正确性 = 写与清的严格配对，任何一条路径漏掉 remove，整个池都被污染——这不是概率问题，是结构问题。',
      conclusion: '根因实锤 → 定向复现钉死因果。',
    },
    {
      thought: '把两个条件人工凑齐做定向复现——"无法复现"往往只是"条件没凑齐"。',
      update: '100% 复现：异常残留 + 绕过路径读取，缺一不串。压测不复现的原因也解开了：压测全是正常请求。',
      actionId: 'a-threadreplay',
      why: '1⚡︎ 定向复现是"假设思维"的收官动作：条件凑齐即必现，证明这不是玄学而是确定性机制——修复的验收标准（重放 1000 次）也同时产出。',
      conclusion: '因果钉死 → 修复三件套（清理/覆盖/fail-fast）。',
    },
    {
      thought: '缓存、网关、异步三个常规嫌疑各 1⚡︎ 排除留证；异步审计顺带揪出同源隐患。',
      update: '三个假设有证据排除；异步任务的兜底读取列入同源整改。',
      actionId: 'a-asyncshare',
      why: '1⚡︎ 排除动作的副产品价值：审计"是否共享上下文"时发现它也在读 ThreadLocal——同一根因的第二暴露面，不修则修复后仍留残根。',
      conclusion: '整改清单扩充 → 全量治理。',
    },
    {
      thought: '止血（下线机制）、修复（确定性清理+fail-fast）、沉淀（lint+探针）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】结构（残留×盲区读取）✓ 复现（定向 100%）✓ 制度（工具守门）✓——机制、因果、防复发三层闭合。',
      conclusion: '沉淀：线程池里的 ThreadLocal 是"跨请求的隐形行李"——set 与 remove 必须在同一双手里完成，读取必须有值可读，否则宁可炸不可串。',
    },
  ],

  lessons: [
    {
      text: '线程池复用线程，ThreadLocal 不清理 = 上下文穿越请求：上一个用户的身份、事务、追踪信息都可能被下一个请求静默继承。',
      principle: '程序设计：ThreadLocal 的正确性 = set 与 remove 严格配对，且 remove 必须在 finally（异常路径也要清）。上下文组件收敛为公共库统一管理，禁止业务自建——"必须成对"靠人的记忆不如靠工具拦截。',
    },
    {
      text: '串数据类故障的复现条件是复合的：残留（漏清理）× 读取（绕过写入路径）——压测不复现只说明两个条件没同时出现。',
      principle: '假设思维：把"偶发"翻译成条件表达式，再定向凑齐条件做复现实验。100% 复现的"偶发"是确定性机制——复现实验同时给出修复的验收标准。',
    },
    {
      text: '读取端要 fail-fast：UserContext.get() 读不到值时，宁可抛异常也不能返回"别人留下的值"——静默错误比崩溃可怕得多。',
      principle: '防御式设计：上下文类读取必须有明确的"缺失即失败"语义。串数据的代价是隐私事故与信任崩塌——让错误在第一跳爆炸，而不是在第三跳变成别人的数据。',
    },
  ],
}
