import { DiagnosisCase } from '../../types/case'

/**
 * 第 2 章 · 可观测性迷雾（日志消失 L3）
 * 教学点：日志平台看到的不是全部真相——采样、级别配置、实例覆盖都会吞日志；"查不到"不等于"没发生"。
 * 专家路径：impact(1) + platsearch(1) + hostdiff(2) = 4⚡︎
 */
export const logSamplingCase: DiagnosisCase = {
  id: 'log-sampling',
  title: '报错了，但日志里什么都没有',
  intro: '有用户反馈支付失败，但日志平台搜不到任何相关报错——仿佛故障从未发生。',
  domain: 'runtime',
  layer: '可观测性：日志平台是间接证据，它的覆盖有盲区',
  part: 'master',
  chapterId: 'observability',
  order: 1,
  typeTags: ['config', 'observability'],
  difficulty: 3,

  scene: {
    role: '你是支付服务后端，用户反馈支付失败，你在日志平台搜了十分钟，一无所获。',
    architecture: '8 台支付实例 → Filebeat 采集 → 日志平台(ES)',
    symptoms: [
      {
        type: 'text',
        title: '用户反馈',
        text: '3 位用户反馈支付失败（有支付流水号），但交易侧显示支付实际成功——失败发生在支付后的回调处理。',
      },
      {
        type: 'error',
        title: '日志平台搜索结果',
        text: '按流水号搜索：0 条结果。按时间范围搜该时段 ERROR：0 条。按服务名过滤：日志量正常。',
      },
    ],
    timeline: '反馈 3 例集中在 14:00~14:20 ｜ 两周前新上线 2 台扩容实例（共 8 台）',
    impactHint: '"日志里没有"有两种可能：没发生，或发生了但没被记录。先验证哪个。',
    // 注意：症状里给的是"查不到"，不是"看到了什么"——本案的迷雾属性
  },

  hypotheses: [
    { id: 'h-host', text: '报错发生在未接入日志采集的实例上', excludeActionId: 'a-hostdiff' },
    { id: 'h-sample', text: 'ERROR 日志被采样策略丢弃', excludeActionId: 'a-sampleconf' },
    { id: 'h-level', text: '实例日志级别被调高，错误没输出', excludeActionId: 'a-hostdiff' },
    { id: 'h-noerr', text: '回调处理其实没报错（是静默失败）', excludeActionId: 'a-codepath' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '核实故障真实性',
      desc: '按流水号查支付回调的请求日志（非错误日志）',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-noerr'],
      hypotheses: [{ id: 'h-noerr', status: 'down' }],
      result: {
        type: 'log',
        title: '按流水号搜请求日志（INFO）',
        text: '3 笔流水的回调请求日志都在：收到回调 → 开始处理 → ……然后日志戛然而止。\n→ 故障真实发生：处理中断，但 ERROR 日志消失。',
      },
    },
    {
      id: 'a-platsearch',
      name: '检查日志平台的采集覆盖',
      desc: '8 台实例的日志采集 Agent 状态',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-host'],
      hypotheses: [{ id: 'h-host', status: 'up' }],
      result: {
        type: 'text',
        title: '采集覆盖',
        text: '8 台实例 Filebeat 心跳全部正常，采集管道无丢弃——平台侧覆盖完整。',
      },
    },
    {
      id: 'a-hostdiff',
      name: '绕过平台，逐台直查实例本地日志文件',
      desc: '对比 8 台机器本地 ERROR 数量',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-host', 'h-level'],
      hypotheses: [{ id: 'h-level', status: 'confirmed' }, { id: 'h-host', status: 'confirmed' }],
      result: {
        type: 'log',
        title: '实例本地日志对比',
        text: '实例 1~6：各 20~40 条 ERROR\n实例 7、8（两周前新扩容）：本地文件里 ERROR 大量存在，但平台上一条都没有\n→ 实锤：7、8 两台的 ERROR 没有进平台',
      },
    },
    {
      id: 'a-sampleconf',
      name: '查日志采样与级别配置',
      desc: '对比新旧实例的日志配置',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-sample', 'h-level'],
      hypotheses: [{ id: 'h-sample', status: 'excluded' }, { id: 'h-level', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '配置对比',
        text: '实例 1~6: log.level=ERROR, 采样=off\n实例 7、8: log.level=WARN  ← 配置漂移！ERROR 级别低于 WARN 被吞\n（新扩容实例用了未更新的基础镜像）',
      },
    },
    {
      id: 'a-codepath',
      name: '读该时段实例 7 的本地日志原文',
      desc: '看被吞掉的 ERROR 到底是什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'error',
        title: '实例 7 本地 ERROR 原文',
        text: 'PayCallbackError: 库存服务 RPC 超时，回调处理失败 order=xxx\n→ 3 位用户的失败原因一致：依赖的库存服务瞬时超时',
      },
    },
    {
      id: 'a-kibanare',
      name: '在平台按实例名重搜',
      desc: '排除"搜错条件"的可能',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-host'],
      hypotheses: [],
      result: {
        type: 'text',
        title: '平台重搜',
        text: '加实例名过滤重搜：gw-pay-07/08 零日志——平台里这两台实例完全隐形。',
      },
    },
    {
      id: 'a-usercomp',
      name: '补偿 3 位用户',
      desc: '【状态变更】重放回调处理并补偿用户',
      cost: 4,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '补偿结果',
        text: '3 笔回调重放成功，用户支付后处理完成——被掩盖的真实故障处置完毕。',
      },
    },
    {
      id: 'a-redeploy',
      name: '统一配置并重发实例',
      desc: '【状态变更】基础镜像更新 + 全实例重部署',
      cost: 6,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '部署结果',
        text: '8 台实例日志级别统一为 ERROR，平台日志量恢复正常梯度。\n失败回调触发自动重试补偿，3 位用户的支付后处理完成。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-config', text: '新扩容实例使用未更新的基础镜像，日志级别为 WARN 吞掉 ERROR，叠加库存服务瞬时超时导致故障不可见', correct: true },
    { id: 'rc-sample', text: '日志平台采样策略丢弃了错误日志', correct: false },
    { id: 'rc-noerr', text: '回调处理静默成功，用户反馈与支付无关', correct: false },
    { id: 'rc-plat', text: '日志平台采集管道故障导致日志丢失', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-redeploy',

  expertChain: [
    {
      thought: '"日志里没有"不能证明"没发生"。先按流水号搜 INFO 级请求日志——请求日志通常不采样。',
      update: '故障真实性确认：回调处理中途日志戛然而止，ERROR 消失。',
      actionId: 'a-impact',
      why: '1⚡︎ 先验证真实性再查原因——如果连 INFO 都没有，方向就会变成"请求根本没到达"。',
      conclusion: '处理中断 + ERROR 缺失 → 排除静默成功，锁定"错误日志去哪了"。',
    },
    {
      thought: '错误去哪了有三个去向：平台采样丢了、实例没输出、实例没接入。先查平台侧覆盖。',
      update: '平台采集心跳正常 → 平台侧排除。',
      actionId: 'a-platsearch',
      why: '1⚡︎ 从最便宜的平台侧查起——如果采集断了就是平台问题，不用逐台登录机器。',
      conclusion: '采集完整 → 问题在实例输出的内容或级别上。',
    },
    {
      thought: '绕过平台直查实例本地文件——如果本地有而平台没有，差异就在采集链或输出级别。',
      update: '实锤：7、8 两台本地有大量 ERROR 但平台零条。',
      actionId: 'a-hostdiff',
      why: '2⚡︎ 逐台对比是本案的决定性动作：本地/平台的差异直接把范围收缩到特定实例。',
      conclusion: '新扩容的 7、8 两台输出异常 → 查它们的配置与旧实例的差异。',
    },
    {
      thought: '配置对比给出机制解释：新实例日志级别 WARN，ERROR 低于阈值被吞。再读本地原文确认故障内容。',
      update: '根因闭环：配置漂移 + 库存服务超时（真实故障被掩盖）。',
      actionId: 'a-codepath',
      why: '1⚡︎ 读被吞掉的日志原文——修复可观测性之外，还要处理被掩盖的真实故障，否则只修了半个案子。',
      conclusion: '双重结案：配置漂移修复 + 库存超时补偿。检查单：扩容实例必须过日志配置基线检查。',
    },
    {
      thought: '证据链闭合：配置漂移实锤 + 真实故障找到 + 修复动作确定。停止。',
      update: '停止收集。',
      actionId: '',
      why: '统一配置、补偿用户、镜像基线化三个行动已明确。',
      conclusion: '重部署统一配置 → 补偿处理 → 加入扩容基线检查清单。',
    },
  ],

  lessons: [
    {
      text: '"日志里查不到"≠"没发生"：日志平台有采样、级别、覆盖三重盲区。',
      principle: '日志平台展示的是"被采集且被允许输出"的日志，不是系统的全部输出。查不到时先验证真实性（搜不采样/不过滤的 INFO 请求日志），再怀疑覆盖。',
    },
    {
      text: '扩容/新实例必须过"可观测性基线检查"：日志级别、采样、采集 Agent、指标暴露。',
      principle: '配置漂移最常发生在新实例上——基础镜像旧、模板未同步。扩容自动化里必须包含可观测性基线校验，否则故障发生时你会"失明"。',
    },
    {
      text: '修好可观测性只是半个案子：被掩盖的真实故障仍要处理与补偿。',
      principle: '可观测性故障常与真实故障叠加：看不见错误 ≠ 没有错误。修好"看得见"之后，必须回头处理窗口期内被吞掉的真实故障。',
    },
  ],
}
