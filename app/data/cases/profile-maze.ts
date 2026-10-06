import { DiagnosisCase } from '../../types/case'

/**
 * 第 7 章 · 配置与启动 第五批（profile 分层合并 L2）
 * 教学点：验证思维——profile 分层合并的隐形差异：环境专属键只在某一层存在，本地永远测不到；
 * 配置 dump 对比工具 + 环境红线（行为类键三环境同值）。
 * 专家路径：impact(1) + profilediff(2) + artifactcompare(1) = 4⚡︎
 */
export const profileMazeCase: DiagnosisCase = {
  id: 'profile-maze',
  title: '本地测得好好的，生产行为不同',
  intro: '导出格式本地是 CSV，生产是 XLSX：一个键只在 prod 的 yml 里——profile 合并的隐形差异，本地测不到。',
  domain: 'deploy',
  layer: 'profile 分层合并的隐形差异——环境专属键必须显式盘点',
  part: 'engineer',
  chapterId: 'config-boot',
  order: 5,
  typeTags: ['config', 'data'],
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
    timeline: 'export.format 配置三个月前引入（本地与测试默认 CSV）｜ 生产 application-prod.yml 三个月前被"顺手加过一行"｜ 无人记得此事',
    impactHint: '代码相同、配置中心无键、行为不同——三层合并的中间层里，藏着一行没人记得的配置。',
  },

  hypotheses: [
    { id: 'h-profile', text: 'profile 分层差异：application-prod.yml 有 export.format=XLSX，本地/test 无此键走默认 CSV', excludeActionId: 'a-profilediff' },
    { id: 'h-artifact', text: '构建产物不同：打包含不同配置文件', excludeActionId: 'a-artifactcompare' },
    { id: 'h-env', text: '部署时环境变量注入了不同值', excludeActionId: 'a-envinject' },
    { id: 'h-version', text: '生产实例运行不同版本代码', excludeActionId: 'a-versioncheck' },
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
        text: '镜像 hash：三环境一致 ✓（同一份代码）\n配置中心：export.format 键不存在（任何环境）✓\n行为差异：仅生产为 XLSX\n→ 代码同、中心同、行为异——差异必在"本地文件层"（application*.yml）的合并里。',
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
      tests: ['h-profile'],
      hypotheses: [{ id: 'h-profile', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '生效配置 diff（三环境）',
        text: '本地生效：export.format = CSV（application.yml 默认值）\ntest 生效：  export.format = CSV（同上）\nprod 生效：  export.format = XLSX ← application-prod.yml 多了一行！\n考古：三个月前某次"生产导出兼容旧系统"的临时调整，写进了 application-prod.yml——\n当时说"回头统一"，然后无人记得。配置合并语义：prod 层覆盖默认层。\n实锤：环境专属键的隐形差异——本地永远测不到生产的那一行。',
      },
    },
    {
      id: 'a-artifactcompare',
      name: '核对构建产物内容',
      desc: '排除打包含不同配置',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-artifact'],
      hypotheses: [{ id: 'h-artifact', status: 'excluded' }],
      result: {
        type: 'text',
        title: '产物核对',
        text: '三环境 jar 内 application*.yml 内容一致（差异在部署侧的外置配置目录）。\n→ 排除构建：外置 prod 配置目录是差异源（应用启动时叠加）。',
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
      tests: ['h-env'],
      hypotheses: [{ id: 'h-env', status: 'excluded' }],
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
      tests: ['h-version'],
      hypotheses: [{ id: 'h-version', status: 'excluded' }],
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
      cost: 1,
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
        text: 'profile 分层规则：\n✔ 环境专属：连接地址、凭据、容量参数（本来就应不同）\n✘ 禁止分叉：行为类键（格式/单位/开关语义）——三环境强制同值，或走配置中心统一管理\n"顺手在生产加一行"从此有了红线。',
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
    { id: 'rc-profile', text: 'application-prod.yml 三个月前被加入 export.format=XLSX（本地/test 无此键走默认 CSV）——profile 分层合并的隐形环境差异：本地永远测不到生产的那一行', correct: true },
    { id: 'rc-artifact', text: '构建打包含不同配置文件', correct: false },
    { id: 'rc-env', text: '部署时环境变量注入不同值', correct: false },
    { id: 'rc-version', text: '生产实例运行不同版本代码', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-fixalign',

  expertChain: [
    {
      thought: '代码同、中心同、行为异——先盘点三层配置源的"同异"，差异必藏在没对过的那一层。',
      update: '镜像与配置中心排除——剩余嫌疑：本地文件层（application*.yml）的分层合并。',
      actionId: 'a-impact',
      why: '1⚡︎ 配置的"三层合并"（本地默认→profile 层→配置中心）每层都可能藏键——先盘点哪些层对过账，剩下没对的就是盲区。',
      conclusion: '嫌疑锁定：profile 层（h-profile 升权）。',
    },
    {
      thought: '三环境生效配置 dump 对比——不猜哪一层，直接 diff 最终合并结果并标注来源。',
      update: '实锤：application-prod.yml 多一行 export.format=XLSX（三个月前的临时调整被遗忘）。',
      actionId: 'a-profilediff',
      why: '2⚡︎ 生效配置 diff 是 profile 迷宫的地图：合并语义（下层覆盖上层）让"某层独有的键"只在该环境生效——dump 标注来源层，一行配置的来历一目了然。',
      conclusion: '根因实锤：环境专属键隐形分叉。',
    },
    {
      thought: '产物/环境变量/版本三个常规嫌疑各 1⚡︎ 排除——"同代码不同行为"的教科书排除链。',
      update: '产物一致、无变量注入、版本一致——三层配置源之外全部清白。',
      actionId: 'a-artifactcompare',
      why: '1⚡︎ "同代码不同行为"的三源排查（产物/注入/分层）是固定套路——产物与注入排除后，分层合并成为唯一解。',
      conclusion: '嫌疑收敛单点。',
    },
    {
      thought: '修复（显式对齐）、工具（dump-diff）、红线（行为键同值）、冒烟（行为一致性断言）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（prod 层独有键）✓ 工具（dump-diff）✓ 红线（行为键同值）✓——个案、工具、规范三层闭合。',
      conclusion: '沉淀：profile 分层合并的隐形差异——环境专属键必须显式盘点，行为类键三环境同值；本地测不到的差异，用 dump-diff 让它可见。',
    },
  ],

  lessons: [
    {
      text: 'profile 分层合并的隐形差异：某层独有的键只在该环境生效——本地永远测不到生产的那一行。',
      principle: '验证思维：配置三层合并（本地默认→profile→中心）每层都可能藏键——"同代码不同行为"先做三环境生效配置 dump-diff（标注来源层）。环境专属键必须显式盘点，不能靠"没人会加"的假设。',
    },
    {
      text: 'profile 红线：环境专属配置仅限"本来就应不同"项（地址/凭据/容量），行为类键（格式/单位/开关语义）三环境强制同值。',
      principle: '程序设计：行为类配置分叉 = 同一份代码在不同环境"人格分裂"——测试通过的语义到生产失效。"顺手在生产加一行"是环境差异最常见的诞生方式：红线 + dump-diff 巡检让它无法隐身。',
    },
    {
      text: '"生产像本地"要靠冒烟断言：发布后抽样关键行为的输出特征（格式/单位）三环境比对——本地测得到的才是真的测到了。',
      principle: '流程设计：环境差异的暴露时机决定代价——运营提 bug（最贵）→ 发布冒烟（可接受）→ 本地开发（理想）。行为一致性断言让"环境像不像"成为发布门禁的一部分，与"边缘验证"同理：终态要在每个世界验证。',
    },
  ],
}
