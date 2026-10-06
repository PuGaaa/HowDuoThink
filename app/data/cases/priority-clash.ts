import { DiagnosisCase } from '../../types/case'

/**
 * 第 7 章 · 配置与启动 第四批（配置来源优先级覆盖 L2）
 * 教学点：验证思维——同一键多个来源时，优先级链决定"最终事实"：环境变量压过配置中心；
 * 来源审计制度化（同键多源 = 治理工单）；环境变量只放基础设施连接信息。
 * 专家路径：impact(1) + sourcecheck(2) + multisource(1) = 4⚡︎
 */
export const priorityClashCase: DiagnosisCase = {
  id: 'priority-clash',
  title: '配置中心改了三个月，连接池一直是 20',
  intro: '运维在配置中心把连接池 20→50 调了三个月都没生效：启动脚本里的 ENV_DB_POOL=20 悄悄赢了一切。',
  domain: 'deploy',
  layer: '同一键多个来源时，优先级链决定最终事实——同键多源就是治理工单',
  part: 'engineer',
  chapterId: 'config-boot',
  order: 4,
  typeTags: ['config', 'resource', 'process'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」的 DBA 兼平台工程师，大促前调连接池的操作已经失败了三个月。',
    architecture: '配置来源三层(优先级从高到低)：容器环境变量 ENV_DB_POOL → 配置中心(Nacos) → 本地 application.yml ｜ DB 连接池(Druid, pool.size)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '三个月的操作记录',
        text: '三次尝试：配置中心 pool.size 20→35→50，每次"变更成功"（回执在岗）、每次重启后连接池依然 20。\n大促 5 天后：高峰连接不足的告警预案再次落空。',
      },
      {
        type: 'text',
        title: '回执的迷惑',
        text: '上次的 config-drift 整改装了 ACK 回执——回执证明"配置送到了应用"。\n但"送到"与"被采纳"是两回事：应用收到了 50，转身用了 20。',
      },
    ],
    timeline: '连接池配置半年前 K8s 迁移时写死在 Deployment env（ENV_DB_POOL=20）｜ 此后无人再看过它 ｜ 配置中心上线后成为"大家默认的配置入口"',
    impactHint: '回执说"送到了"，运行值说"没采纳"——应用在两个求婚者之间选了谁？为什么？',
  },

  hypotheses: [
    { id: 'h-priority', text: '环境变量覆盖：启动脚本 ENV_DB_POOL=20 在优先级链上压过配置中心——改中心永远无效', excludeActionId: 'a-sourcecheck' },
    { id: 'h-typo', text: '键不匹配（config-typo 同款）', excludeActionId: 'a-keycheck' },
    { id: 'h-runtime', text: '池大小启动期固定：改了要重启，没重启所以没生效', excludeActionId: 'a-runtimecheck' },
    { id: 'h-multi', text: '多个配置源同键不同值，加载顺序混乱不可预期', excludeActionId: 'a-multisource' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '三处对质：中心、回执、运行时',
      desc: '影响面：送达链正常，采纳链断在哪',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '三处对质',
        text: '中心值 50 ✓（回执 12/12 送达 ✓）\n运行时连接池：20（三个月未变，与三次调整无关）\n重启验证：重启后依然 20——连"要重启"的假设都被数据驳回。\n→ "送达了但从不采纳"，且重启无效——应用有一个比配置中心更强的来源。',
      },
    },
    {
      id: 'a-sourcecheck',
      name: '配置来源审计：actuator/env 全景',
      desc: 'pool.size 的所有来源与优先级排序',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-priority'],
      hypotheses: [{ id: 'h-priority', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '来源审计（/actuator/env）',
        text: 'pool.size 的候选来源（按优先级）：\n① 系统环境变量 ENV_DB_POOL=20          ← 赢家\n② Nacos 配置中心 pool.size=50          ← 三个月被忽略的求婚者\n③ application.yml pool.size=30         ← 更老的求婚者\nSpring 优先级：系统环境变量 > 远程配置中心 > 本地文件。\n来源考古：ENV_DB_POOL 写死于半年前 K8s 迁移（当时配置中心未接入，它是唯一来源）。\n实锤：优先级链上它站得最高——配置中心的 50 永远是"备胎"。',
      },
    },
    {
      id: 'a-multisource',
      name: '扩展审计：全仓"同键多源"扫描',
      desc: 'pool.size 是个例还是普遍——三源同键的清单',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-multi'],
      hypotheses: [{ id: 'h-multi', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '同键多源扫描',
        text: '全仓配置项来源比对：\n同键多源 ×11 项（环境变量 ∩ 配置中心 ∩ 本地 yml）：连接池/超时/开关类为主\n三源同值 ×6（无害）｜三源三值 ×5（每项都是一颗 config-drift+本案例的合体雷）\n→ 体系缺陷确认："配置入口"从本地文件→配置中心迁移了三年，旧来源从未清理——每个旧值都是优先级链上的一颗雷。',
      },
    },
    {
      id: 'a-keycheck',
      name: '核对键名一致性',
      desc: '排除 config-typo 同款',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-typo'],
      hypotheses: [{ id: 'h-typo', status: 'excluded' }],
      result: {
        type: 'text',
        title: '键名核对',
        text: '三来源键名一致（pool.size）；绑定校验在岗。\n→ 排除 typo：这次键名全对，错的是"谁说了算"。',
      },
    },
    {
      id: 'a-runtimecheck',
      name: '核对池参数的生效时机',
      desc: '验证"改了要重启"假设——重启后依然 20',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-runtime'],
      hypotheses: [{ id: 'h-runtime', status: 'down' }],
      result: {
        type: 'text',
        title: '生效时机核对',
        text: '池大小确为启动期固定（这半句对）；但重启后依然 20（环境变量还在）——\n"改了要重启"解释不了"重启也没用"。→ 降权：生效时机是背景，优先级覆盖是根因。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急改环境变量为 50 并重启',
      desc: '【状态变更】Deployment env ENV_DB_POOL=20→50，滚动重启',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '改环境变量结果',
        text: '连接池 50 生效，大促预案落地。\n但"同键三源"变成"同键三源（又改了一处）"——三个值依然存在，\n下一个人改配置中心，三个月后重演。止血没有动结构。',
      },
    },
    {
      id: 'a-fixsingle',
      name: '修复：单一事实源清理',
      desc: '【状态变更】pool.size 只留配置中心；环境变量与 yml 同键清除；基础设施层红线',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '清理结果',
        text: '① pool.size：环境变量与 yml 中的同键删除——配置中心成为唯一事实源\n② 环境变量红线：只保留"基础设施连接信息"（DB 地址/凭据/区域），业务参数禁入\n③ 5 项三源三值配置逐项清理（每项确认唯一来源）。\n回归：配置中心调整 → 重启后生效（预期明确），无幽灵值。',
      },
    },
    {
      id: 'a-fixaudits',
      name: '沉淀：来源审计制度化',
      desc: '【状态变更】actuator/env 周期扫描"同键多源"清单；多源即治理工单（带期限）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '审计制度',
        text: '每周来源扫描：同键多源清单自动生成（各源值并列展示）→ 多源即工单限期清理。\n"同键多源"从隐形状态变成有账本的债务——优先级链上不再藏雷。',
      },
    },
    {
      id: 'a-fixdoc',
      name: '沉淀：优先级链文档化',
      desc: '【状态变更】Spring 配置优先级图进新人手册；"环境变量只放基础设施"红线写进规范',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '优先级图',
        text: '配置优先级图（命令行 > 环境变量 > 远程中心 > 本地文件 > 默认值）+ 各层用途约定。\n新人第一次配置前就看到这张图——"谁说了算"从玄学变成常识。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-priority', text: '环境变量覆盖：半年前 K8s 迁移写死的 ENV_DB_POOL=20 在 Spring 优先级链上压过配置中心——配置中心三次调整（回执全绿）永不采纳；同键三源（env/中心/yml）为体系性缺陷', correct: true },
    { id: 'rc-typo', text: '配置键不匹配', correct: false },
    { id: 'rc-runtime', text: '池大小启动期固定需重启（背景：重启也无效）', correct: false },
    { id: 'rc-multi', text: '多配置源同键不同值（体系性缺陷的普遍形态，5 项确认）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '回执全绿但运行值三个月不动——上次修的"送达"在岗，断点在"采纳"。三处对质先确认这一点。',
      update: '重启验证都被驳回（依然 20）——应用有一个比配置中心更强的来源。',
      actionId: 'a-impact',
      why: '1⚡︎ "重启也无效"是本案例的关键证据：它同时排除了"要重启"和"网络没送达"两类解释，指向"有更强的值"。',
      conclusion: '嫌疑锁定：来源优先级覆盖（h-priority 升权）。',
    },
    {
      thought: '来源审计：actuator/env 全景列出 pool.size 的所有求婚者与优先级排序。',
      update: '实锤：环境变量 20 压过中心 50——半年前迁移的遗留值站在优先级链顶端。',
      actionId: 'a-sourcecheck',
      why: '2⚡︎ 来源审计是配置排查的"全家福"：单看配置中心永远发现不了"被谁覆盖"——只有把所有来源按优先级排开，采纳链的断点才可见。',
      conclusion: '根因实锤：优先级覆盖。',
    },
    {
      thought: '同键多源普查把个案升级为体系：11 项多源、5 项三值——每个旧来源都是一颗雷。',
      update: '体系缺陷确认：配置入口迁移三年，旧来源从未清理——"配置中心是唯一入口"只是团队的以为。',
      actionId: 'a-multisource',
      why: '1⚡︎ 体系审计的杠杆：一个 pool.size 背后是 11 项同键多源——修复单位从"一个键"升级为"来源治理制度"，否则修一个雷排一颗雷。',
      conclusion: '修复升级：单一事实源清理 + 审计制度。',
    },
    {
      thought: '键名排除（上次防线在岗）、生效时机降权、止血陷阱（改环境变量=又埋一处）点评。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（优先级覆盖）✓ 体系（11 项多源）✓ 防线（单一事实源+审计制度+优先级图）✓——个案、体系、防线三层闭合。',
      conclusion: '沉淀：同一键多个来源时，优先级链决定最终事实——同键多源就是治理工单，环境变量只放基础设施连接信息。',
    },
  ],

  lessons: [
    {
      text: '同一键多个来源时，优先级链决定最终事实：环境变量压过配置中心——配置中心的回执再绿，也赢不了站得更高的来源。',
      principle: '验证思维：配置排查的"全家福"是来源审计（actuator/env 全景）——把所有来源按优先级排开。"送达了但没采纳"的证据组合，直接指向优先级覆盖而非传输问题。',
    },
    {
      text: '同键多源是体系性缺陷：配置入口迁移时旧来源不清理，每个旧值都是优先级链上的一颗雷——11 项多源意味着 11 颗。',
      principle: '沉淀思维：配置入口迁移（本地文件→配置中心）必须伴随"旧来源清理"步骤——迁移不是叠加。来源审计制度化（周期扫描同键多源→治理工单）让雷有账本、有期限，而不是等某次大促引爆。',
    },
    {
      text: '环境变量只放基础设施连接信息：业务参数进环境变量 = 给优先级链埋雷——红线写进规范。',
      principle: '架构设计：配置分层的用途约定——环境变量（基础设施：地址/凭据/区域）、配置中心（业务参数：唯一事实源）、本地文件（默认值兜底）。红线一旦写清，"该把配置放哪"从口味问题变成规范问题。',
    },
  ],
}
