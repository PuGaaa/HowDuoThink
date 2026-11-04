import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const profileMazeCase: DiagnosisCase = {
  id: 'profile-maze',
  title: '本地测得好好的，生产行为不同',
  intro: '同一镜像在本地导出CSV，在生产导出XLSX；配置中心没有这个键。先对比最终生效值及来源。',
  domain: 'deploy',
  layer: 'profile 分层合并的隐形差异——环境专属键必须显式盘点',
  part: 'engineer',
  chapterId: 'config-boot',
  order: 5,
  typeTags: [
    'config',
    'data',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」报表服务的后端，运营的疑问让你发现"同一个配置，两个世界"。',
    architecture: '报表服务(配置三层合并: application.yml → application-{profile}.yml → 配置中心) ｜ 三环境：dev/test/prod',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '环境行为差异',
        text: '导出格式：本地与测试环境都是 CSV；生产环境是 XLSX。\n代码相同（镜像 hash 一致）、配置中心无此键——"行为不同"的来源成谜。',
      },
      {
        type: 'text',
        title: '业务困扰',
        text: '运营依赖 CSV 做对账脚本解析（XLSX 解析成本高）；\n生产却一直产出 XLSX——功能方提了 bug，开发者本地复现不了。',
      },
    ],
    timeline: '三个月前引入导出格式配置；本地和测试一直导出CSV，生产导出XLSX；本周运营对账脚本首次暴露差异。',
    impactHint: '镜像相同并不能证明运行配置相同，先看最终值及其来源。',
  },
  hypotheses: [
    {
      id: 'h-profile',
      text: 'profile 分层差异：application-prod.yml 有 export.format=XLSX，本地/test 无此键走默认 CSV',
      excludeActionId: 'a-profilediff',
    },
    {
      id: 'h-artifact',
      text: '构建产物不同：打包含不同配置文件',
      excludeActionId: 'a-artifactcompare',
    },
    {
      id: 'h-env',
      text: '部署时环境变量注入了不同值',
      excludeActionId: 'a-envinject',
    },
    {
      id: 'h-version',
      text: '生产实例运行不同版本代码',
      excludeActionId: 'a-versioncheck',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '先排除"版本不同"再说配置',
      desc: '影响面：三环境镜像与配置中心的键位盘点',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '同异盘点',
        text: '三个环境同一镜像digest；同输入在dev/test得到CSV，在prod得到XLSX。中心各环境均无export.format。\n日志归档有一次上传重试，但三环境导出均完成；重试不在格式选择调用链。差异来源仍需查配置和注入。',
      },
    },
    {
      id: 'a-profilediff',
      name: '三环境生效配置 dump 对比',
      desc: '逐环境 dump 最终合并结果，diff 出差异键',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-profile',
      ],
      hypotheses: [
        {
          id: 'h-profile',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '生效配置 diff（三环境）',
        text: '最终配置与origin：dev/test的export.format=CSV，来自打包application.yml；prod为XLSX，来自部署侧外置application-prod.yml。\n当前激活profile分别为dev/test/prod，符合部署意图。只在同构副本移除prod外置文件这一行、保持其他来源不变，输出变回CSV。',
      },
    },
    {
      id: 'a-artifactcompare',
      name: '核对产物与部署注入清单',
      desc: '排除打包含不同配置',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-artifact',
        'h-env',
        'h-version',
      ],
      hypotheses: [
        {
          id: 'h-artifact',
          status: 'excluded',
        },
        {
          id: 'h-env',
          status: 'excluded',
        },
        {
          id: 'h-version',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '产物核对',
        text: '同一部署清单诊断：三个环境运行镜像digest和JAR校验和相同，包内application*.yml相同；部署进程环境变量/命令行均无export.format覆盖。\n生产差异只在外置目录，不在构建产物，也不是代码版本或环境注入。',
      },
    },
    {
      id: 'a-envinject',
      name: '核对环境变量注入',
      desc: '排除环境变量',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-env',
      ],
      hypotheses: [
        {
          id: 'h-env',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '环境变量核对',
        text: '三环境均无 export.* 相关变量（呼应 priority-clash 的红线：环境变量只放基础设施）。\n→ 排除环境变量。',
      },
    },
    {
      id: 'a-versioncheck',
      name: '核对生产实例版本',
      desc: '排除版本差异',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-version',
      ],
      hypotheses: [
        {
          id: 'h-version',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '版本核对',
        text: '生产实例镜像 hash 与测试一致。\n→ 排除版本：行为差异 100% 来自配置分层。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急回滚 prod 配置文件到三个月前版本',
      desc: '【状态变更】git 回滚 application-prod.yml——把三个月的变更全部冲掉',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果（陷阱动作）',
        text: 'export.format 消失了（行为回归 CSV）——但同文件里三个月内合法加入的 7 个键（容量参数/凭据轮换）也一并消失，\n生产启动报两个"必填键缺失"告警，紧急二次修复。\n→ 复盘点评：文件级回滚是霰弹枪——只打一个键，用"键级删除"或"编辑回滚"。',
      },
    },
    {
      id: 'a-fixalign',
      name: '修复：环境键显式对齐',
      desc: '【状态变更】prod 的 export.format 清除（回归 CSV）；行为类键三环境显式同值',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '对齐结果',
        text: '① prod 的 export.format=XLSX 删除（运营确认 CSV 是标准）\n② 行为类键（格式/单位/开关）三环境显式同值写入各自层——"默认值兜底"改为"显式声明"\n三环境导出格式统一 CSV。',
      },
    },
    {
      id: 'a-fixdump',
      name: '沉淀：配置 dump 对比工具',
      desc: '【状态变更】任意两环境"生效配置 diff"一键生成——环境差异从隐形变可见',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'diff 工具',
        text: '配置平台上线 dump-diff：选择环境 A/B → 生成生效配置逐键 diff（标注来源层）。\n本案例的差异一行就能看见——"本地复现不了"从玄学变成一张 diff 报告。',
      },
    },
    {
      id: 'a-fixrule',
      name: '沉淀：profile 红线',
      desc: '【状态变更】环境专属配置仅限"必须不同"项（地址/凭据/容量）；行为类键三环境强制同值',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'profile 红线',
        text: '本团队约定：地址、凭据、容量允许按环境配置；格式、单位及开关语义若无明确测试目标则保持一致。采用配置中心也要比较各环境生效值与来源，中心管理不自动保证同值。',
      },
    },
    {
      id: 'a-fixsmoke',
      name: '沉淀："生产像本地"冒烟断言',
      desc: '【状态变更】发布后关键行为断言与环境无关：格式/单位/开关的输出抽样比对',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '冒烟断言',
        text: '发布冒烟新增"行为一致性"断言：抽样关键功能的输出特征（格式/单位）三环境比对。\n环境差异的暴露时机从"运营提 bug"前移到"发布冒烟"——本地测得到的才是真的测到了。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-profile',
      text: 'application-prod.yml 三个月前被加入 export.format=XLSX（本地/test 无此键走默认 CSV）——profile 分层合并的隐形环境差异：本地永远测不到生产的那一行',
      correct: true,
    },
    {
      id: 'rc-artifact',
      text: '构建打包含不同配置文件',
      correct: false,
    },
    {
      id: 'rc-env',
      text: '部署时环境变量注入不同值',
      correct: false,
    },
    {
      id: 'rc-version',
      text: '生产实例运行不同版本代码',
      correct: false,
    },
  ],
  expertCost: 4,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '先验证相同输入的行为差异。',
      update: '同镜像但prod输出不同，中心无该键。',
      actionId: 'a-impact',
      why: '1⚡确定比较条件，不能凭镜像相同直接排除所有注入。',
      conclusion: '核对最终配置来源。',
    },
    {
      thought: '读取最终值和origin并做单变量对照。',
      update: 'prod外置profile值覆盖默认值，移除这一行则恢复CSV。',
      actionId: 'a-profilediff',
      why: '2⚡来源追溯与同构对照证明差异因果，不靠记忆考古。',
      conclusion: '确认profile分叉。',
    },
    {
      thought: '读取产物及部署注入清单。',
      update: '代码/包相同，无环境变量或命令行覆盖。',
      actionId: 'a-artifactcompare',
      why: '1⚡同一份部署诊断给出三个候选各自的反证。',
      conclusion: '其余候选排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】外置profile差异及输出对照已确认，产物、版本、注入均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: 'application-prod.yml 三个月前被加入 export.format=XLSX（本地/test 无此键走默认 CSV）——profile 分层合并的隐形环境差异：本地永远测不到生产的那一行',
    },
  ],
  lessons: [
    {
      text: 'profile 分层合并的隐形差异：某层独有的键只在该环境生效——本地永远测不到生产的那一行。',
      principle: '验证思维：配置三层合并（本地默认→profile→中心）每层都可能藏键——"同代码不同行为"先做三环境生效配置 dump-diff（标注来源层）。环境专属键必须显式盘点，不能靠"没人会加"的假设。',
    },
    {
      text: 'profile 红线：环境专属配置仅限"本来就应不同"项（地址/凭据/容量），行为类键（格式/单位/开关语义）三环境强制同值。',
      principle: '行为差异必须是可审查的明确选择。统一配置入口仍可能有各环境独立值；通过生效值diff及同输入冒烟验证语义一致，不能只看配置放在哪里。',
    },
    {
      text: '"生产像本地"要靠冒烟断言：发布后抽样关键行为的输出特征（格式/单位）三环境比对——本地测得到的才是真的测到了。',
      principle: '流程设计：环境差异的暴露时机决定代价——运营提 bug（最贵）→ 发布冒烟（可接受）→ 本地开发（理想）。行为一致性断言让"环境像不像"成为发布门禁的一部分，与"边缘验证"同理：终态要在每个世界验证。',
    },
  ],
}
