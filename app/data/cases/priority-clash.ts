import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const priorityClashCase: DiagnosisCase = {
  id: 'priority-clash',
  title: '配置中心改了三个月，连接池一直是 20',
  intro: '配置中心连续三次调大连接池，重启后却始终是20。运行值究竟来自哪个来源？',
  domain: 'deploy',
  layer: '同键多源要标明用途及实际覆盖来源，迁移入口时审计遗留值',
  part: 'engineer',
  chapterId: 'config-boot',
  order: 4,
  typeTags: [
    'config',
    'resource',
    'process',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」的 DBA 兼平台工程师，大促前调连接池的操作已经失败了三个月。',
    architecture: 'Spring Boot服务：环境变量、Nacos自定义PropertySource、本地yml均可提供pool.size；具体顺序由当前集成及配置决定。',
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
      {
        type: 'log',
        title: '审计上传失败',
        text: '[WARN] config audit upload failed；与池容量变更同一分钟。',
      },
    ],
    timeline: '连接池配置半年前 K8s 迁移时写死在 Deployment env（POOL_SIZE=20）｜ 此后无人再看过它 ｜ 配置中心上线后成为"大家默认的配置入口"',
    impactHint: '回执说"送到了"，运行值说"没采纳"——应用在两个求婚者之间选了谁？为什么？',
  },
  hypotheses: [
    {
      id: 'h-priority',
      text: '环境变量覆盖：启动脚本 POOL_SIZE=20 在优先级链上压过配置中心——改中心永远无效',
      excludeActionId: 'a-sourcecheck',
    },
    {
      id: 'h-typo',
      text: '键不匹配（config-typo 同款）',
      excludeActionId: 'a-keycheck',
    },
    {
      id: 'h-runtime',
      text: '池大小启动期固定：改了要重启，没重启所以没生效',
      excludeActionId: 'a-runtimecheck',
    },
    {
      id: 'h-multi',
      text: '多个配置源同键不同值，加载顺序混乱不可预期',
      excludeActionId: 'a-multisource',
    },
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
      tests: [
        'h-priority',
        'h-typo',
        'h-multi',
      ],
      hypotheses: [
        {
          id: 'h-priority',
          status: 'confirmed',
        },
        {
          id: 'h-typo',
          status: 'excluded',
        },
        {
          id: 'h-multi',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '来源审计（/actuator/env）',
        text: '当前实例Environment来源诊断（高→低）：systemEnvironment中的POOL_SIZE=20；本案Nacos PropertySource中pool.size=50；application.yml中pool.size=30。\n标准环境变量映射POOL_SIZE→pool.size；三次受控启动均显示相同来源顺序和origin，最终池容量20。不是Nacos在所有版本/接入方式下都低于环境变量。键名匹配，加载顺序确定。\n噪声收线：配置审计附件上传失败不改变PropertySources；本地受控来源诊断已完整生成并能重复取得相同origin。',
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
      tests: [
        'h-multi',
      ],
      hypotheses: [
        {
          id: 'h-multi',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '同键多源扫描',
        text: '同一版本重复启动三次，PropertySources顺序与最终origin一致，排除随机加载。额外审计发现11项多源，其中5项值不同，作为治理线索；它们不构成本局第二个已确认根因。',
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
      tests: [
        'h-typo',
      ],
      hypotheses: [
        {
          id: 'h-typo',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '键名核对',
        text: 'POOL_SIZE按标准环境变量命名映射为pool.size，Nacos及yml都提供同一规范键pool.size；Environment来源报告可见三者。排除拼写不匹配。',
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
      tests: [
        'h-runtime',
      ],
      hypotheses: [
        {
          id: 'h-runtime',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '生效时机核对',
        text: '发布记录和进程startTime证明已在变更后重启；池仍20。池容量确为启动期读取，但“没有重启”与本案事实不符。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急改环境变量为 50 并重启',
      desc: '【状态变更】Deployment env POOL_SIZE=20→50，滚动重启',
      cost: 9,
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
      desc: '【状态变更】按本团队维护入口约定清理遗留POOL_SIZE覆盖',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '清理结果',
        text: '本团队决定pool.size由配置中心维护，删除遗留POOL_SIZE覆盖，并核对本地默认值的用途；这是团队治理选择，不是框架禁止环境变量承载容量参数。\n回归中心调整、受控重启后池容量符合预期，来源可追溯。',
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
        text: '周期生成同键来源及最终origin清单；区分有意默认层与遗留覆盖，按团队维护约定处理，不把所有多源都自动判错。',
      },
    },
    {
      id: 'a-fixdoc',
      name: '沉淀：优先级链文档化',
      desc: '【状态变更】记录当前版本的实际来源顺序及团队用途约定',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '优先级图',
        text: '记录当前集成版本、PropertySources实际顺序及覆盖开关，升级后重新验证。团队约定容量参数的维护入口，并保留可追溯默认值；不要把本案来源顺序写成所有Nacos版本的固定规则。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-priority',
      text: '环境变量覆盖：半年前 K8s 迁移写死的 POOL_SIZE=20 在 Spring 优先级链上压过配置中心——配置中心三次调整（回执全绿）永不采纳；同键三源（env/中心/yml）为体系性缺陷',
      correct: true,
    },
    {
      id: 'rc-typo',
      text: '配置键不匹配',
      correct: false,
    },
    {
      id: 'rc-runtime',
      text: '池大小启动期固定需重启（背景：重启也无效）',
      correct: false,
    },
    {
      id: 'rc-multi',
      text: '多配置源同键不同值（体系性缺陷的普遍形态，5 项确认）',
      correct: false,
    },
  ],
  expertCost: 4,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '对照中心与运行值。',
      update: '重启后仍20，中心为50。',
      actionId: 'a-impact',
      why: '1⚡先证实差异存在，不能把回执当成采用值。',
      conclusion: '核对实际配置来源。',
    },
    {
      thought: '读取有序来源及绑定映射。',
      update: 'POOL_SIZE映射正确、顺序稳定且优先，最终origin为环境变量。',
      actionId: 'a-sourcecheck',
      why: '2⚡实际来源和重复启动对照同时排除键错与随机顺序。',
      conclusion: '确认覆盖根因。',
    },
    {
      thought: '核对启动时间和变更记录。',
      update: '变更后确已重启，未重启假设不成立。',
      actionId: 'a-runtimecheck',
      why: '1⚡时间证据排除生效时机候选，而非只把它含混降权。',
      conclusion: '其余候选排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】实际来源覆盖已确认，键错、随机顺序及未重启均有反证。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '环境变量覆盖：半年前 K8s 迁移写死的 POOL_SIZE=20 在 Spring 优先级链上压过配置中心——配置中心三次调整（回执全绿）永不采纳；同键三源（env/中心/yml）为体系性缺陷',
    },
  ],
  lessons: [
    {
      text: '收到配置与采纳配置是两件事。先列出实际来源、优先级与最终origin，再解释运行值。',
      principle: 'Spring Boot有来源覆盖规则，但远程源位置还依赖集成方式和版本；依据当前Environment实测顺序，不能照搬固定的Nacos优先级表。',
    },
    {
      text: '环境变量名需按绑定规则映射；本案POOL_SIZE对应pool.size，ENV_DB_POOL不会自然变成这个键。',
      principle: '把原始来源键、规范键和运行值三者并列，避免把命名约定误当框架自动推断。',
    },
    {
      text: '迁移配置入口时要处理遗留覆盖；多源默认值可以保留，但用途和最终来源必须清楚。',
      principle: '唯一维护入口属于团队约定。治理目标是可追溯、可验证，而不是宣称所有多源配置都错误。',
    },
  ],
}
