import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const configTypoCase: DiagnosisCase = {
  id: 'config-typo',
  title: '启动全绿，导出仍然三十秒超时',
  intro: '面板里的超时已调大，导出仍在旧时限失败。配置从修改到运行，断在哪一环？',
  domain: 'deploy',
  layer: '配置键对不上时，框架静默用默认值——生效断言要成为配置的习惯',
  part: 'engineer',
  chapterId: 'config-boot',
  order: 1,
  typeTags: [
    'config',
    'verification',
  ],
  difficulty: 1,
  scene: {
    role: '你是「鲜到家」报表服务的新任负责人，接手第一天就遇到"配置改了像没改"的灵异现象。',
    architecture: '配置中心(Nacos) → 报表服务(启动读取 @Value("${export.timeout}")) → 导出功能(大报表生成)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '现象',
        text: '配置中心面板显示导出超时已调到120s；大报表仍在30s失败。\n启动日志全绿，没有配置未生效告警。',
      },
      {
        type: 'text',
        title: '前情',
        text: '前任开发口头交接："导出超时默认 30 秒，配置中心可以调。"——"可以调"，但没有验证过真的调得动。',
      },
    ],
    timeline: '配置 3 天前调整为 120s（大促报表变大的预案）｜ 今天的导出失败告警让预案现出原形 ｜ @Value 注入代码一年未动',
    impactHint: '配置中心的值、代码想读的键、运行时实际生效的值——三个数字，先对质再下结论。',
  },
  hypotheses: [
    {
      id: 'h-typo',
      text: '配置键拼写不一致：配置中心 timeouts，代码读 timeout——键对不上，@Value 静默回退默认 30s',
      excludeActionId: 'a-keydiff',
    },
    {
      id: 'h-load',
      text: '配置文件没被加载（未打进包/路径不对）',
      excludeActionId: 'a-loadcheck',
    },
    {
      id: 'h-priority',
      text: '配置优先级被其他来源覆盖（环境变量/命令行）',
      excludeActionId: 'a-priority',
    },
    {
      id: 'h-profile',
      text: '部署环境激活了错误的 profile，读的是另一套配置',
      excludeActionId: 'a-profilecheck',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '三处对质：配置中心、代码、运行时',
      desc: '影响面：三个"值"各是什么、谁在最后说话',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '三处对质',
        text: '小报表正常；大报表均在30s超时，调整前后相同。\n12个实例表现一致；中心面板显示120s。先比较配置意图、绑定代码和实际生效值。',
      },
    },
    {
      id: 'a-keydiff',
      name: '逐字符 diff 配置键与注入键',
      desc: 'timeouts vs timeout——差一个字母的世界',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-typo',
      ],
      hypotheses: [
        {
          id: 'h-typo',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '键名逐字符对照',
        text: '中心实际键：export.timeouts=120000\n代码：@Value("${export.timeout:30000}")\n逐字比对：中心多一个s。当前Environment没有精确键export.timeout，Bean字段为30000；占位符采用显式默认值。',
      },
    },
    {
      id: 'a-loadcheck',
      name: '核对加载来源与激活环境快照',
      desc: '读取同一份来源诊断：配置版本、profile与同名键覆盖',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-load',
        'h-priority',
        'h-profile',
      ],
      hypotheses: [
        {
          id: 'h-load',
          status: 'excluded',
        },
        {
          id: 'h-priority',
          status: 'excluded',
        },
        {
          id: 'h-profile',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '加载核对',
        text: '同一份启动诊断快照：激活prod，Nacos group/dataId及版本与预期一致；同源行数限制已生效。\nPropertySources逐源检索：环境变量、命令行、JVM参数及本地文件均无export.timeout；没有更高来源覆盖该键。\n加载、来源覆盖、错误profile三项均排除。',
      },
    },
    {
      id: 'a-priority',
      name: '核对配置优先级链',
      desc: '排除被环境变量覆盖',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-priority',
      ],
      hypotheses: [
        {
          id: 'h-priority',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '优先级核对',
        text: '环境变量/命令行/JVM 参数中均无 export.* 相关键——不存在更高优先级的覆盖。\n→ 排除优先级。',
      },
    },
    {
      id: 'a-profilecheck',
      name: '核对激活的 profile',
      desc: '排除环境 profile 错误',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-profile',
      ],
      hypotheses: [
        {
          id: 'h-profile',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'profile 核对',
        text: '激活profile=prod；读取的正是prod中心配置，其中存在export.timeouts而没有export.timeout。不是选错环境。',
      },
    },
    {
      id: 'a-fixkey',
      name: '修复：统一键名并验证生效',
      desc: '【状态变更】配置中心键改为 export.timeout；启动后断言运行值为 120000',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '键名统一后发布：启动日志读到 120000 ✓\n大报表导出 30s→115s 完成（不再被 30s 掐断）。\n→ 修复后必须断言"运行时读到的值"——这一次，生效是被验证过的。',
      },
    },
    {
      id: 'a-fixbind',
      name: '沉淀：绑定校验 fail-fast',
      desc: '【状态变更】@ConfigurationProperties 替代散落 @Value；未知配置键启动告警；必填键缺失启动失败',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '绑定校验',
        text: '采用@ConfigurationProperties集中绑定；显式设置ignoreUnknownFields=false拒绝未知字段。结合@Validated与必填字段约束拒绝缺失配置，不再靠默认值掩盖必填项。\n同构回归：旧拼写启动失败，修正键后字段为120000。仅替换注解并不会默认拒绝未知键。',
      },
    },
    {
      id: 'a-fixassert',
      name: '沉淀：配置生效断言进发布检查',
      desc: '【状态变更】发布检查单新增：关键配置项"运行时读取值"抽样断言',
      cost: 1,
      gain: 'mid',
      danger: false,
      tests: [],
      hypotheses: [],
      effects: [],
      result: {
        type: 'text',
        title: '检查单',
        text: '发布检查单新增一项：对本次变更涉及的每个配置键，断言"运行时实际读取值 == 期望值"。\n——配置的"改了"要验证成"生效了"，与发布验证边缘节点同理：意图不等于事实。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-typo',
      text: '配置键 typo：中心写 timeouts、代码读 @Value("${export.timeout:30000}")——键不匹配静默回退默认值 30s，无告警无提示',
      correct: true,
    },
    {
      id: 'rc-load',
      text: '配置文件未加载/路径错误',
      correct: false,
    },
    {
      id: 'rc-priority',
      text: '配置被更高优先级来源覆盖',
      correct: false,
    },
    {
      id: 'rc-profile',
      text: '部署环境激活错误 profile',
      correct: false,
    },
  ],
  expertCost: 4,
  restartActionId: '',
  expertChain: [
    {
      thought: '先量出失败边界。',
      update: '只有大报表在30s失败，所有实例一致。',
      actionId: 'a-impact',
      why: '1⚡先分清功能与时限，避免把面板值误当运行值。',
      conclusion: '进入键与来源核对。',
    },
    {
      thought: '逐字核对键名及占位符。',
      update: 'timeouts和timeout不相同，字段取到显式默认30000。',
      actionId: 'a-keydiff',
      why: '2⚡完整键、默认值与运行字段构成可复核机制证据。',
      conclusion: '确认h-typo。',
    },
    {
      thought: '读取来源和环境诊断。',
      update: '加载正确、profile正确、无同名键覆盖。',
      actionId: 'a-loadcheck',
      why: '1⚡同一份来源快照覆盖其余三个候选，而非凭一个正常键排除所有配置问题。',
      conclusion: '其余候选全部排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】精确键不匹配和默认值路径已确认，加载、覆盖、profile均有反证。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '配置键 typo：中心写 timeouts、代码读 @Value("${export.timeout:30000}")——键不匹配静默回退默认值 30s，无告警无提示',
    },
  ],
  lessons: [
    {
      text: '配置键对不上时框架静默用默认值：@Value 的冒号兜底让 typo 无声无息——"启动全绿"不代表"配置生效"。',
      principle: '将配置集中绑定；显式拒绝未知键，并为必填字段配置校验。@ConfigurationProperties本身默认不拒绝未知键，不能把改注解当作已经有了校验。',
    },
    {
      text: '配置三处对质：配置中心的意图、代码的读取、运行时的行为——断点在哪一环，修复就在哪一环。',
      principle: '验证思维：配置类"改了没生效"的鉴别四象限：键名匹配、加载成功、无更高优先级覆盖、环境 profile 正确——逐一留证。三处对质 + 四象限排除，是配置排查的固定起手式。',
    },
    {
      text: '生效要被断言：发布检查单对每个变更配置键断言"运行时实际读取值 == 期望值"——意图不等于事实。',
      principle: '流程设计：配置变更与发布同构——都要有终态验证。验证的成本（一次启动断言）远低于"静默默认值在生产运行三个月"的代价——尤其当那个默认值的行为是"大报表全部超时"。',
    },
  ],
}
