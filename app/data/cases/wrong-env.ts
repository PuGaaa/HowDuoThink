import { DiagnosisCase } from '../../types/case'

/**
 * 第 14 章 · 部署与发布 第五批（测试包发到生产 L2）
 * 教学点：沉淀思维——危险的默认值（--env=prod）是事故的种子；部署后环境自检是最后一道闸；
 * 数据污染的清洗是独立动作，回滚不等于修复。
 * 专家路径：impact(1) + scriptaudit(2) + postgate(1) = 4⚡︎
 */
export const wrongEnvCase: DiagnosisCase = {
  id: 'wrong-env',
  title: '测试包在生产线了 40 分钟的假支付',
  intro: '凌晨的"发测试包"把制品发到了生产：审批、打包、推送三道关全过——环境标识从没有人核对过。',
  domain: 'deploy',
  layer: '危险的默认值是事故的种子——环境自检是最后一道闸',
  part: 'master',
  chapterId: 'deployment',
  order: 9,
  typeTags: ['deploy', 'config', 'process'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」支付平台的 SRE 值班负责人，凌晨 2:17 你亲手把测试包发到了生产。',
    architecture: '发布脚本(deploy.sh, 参数 ENV 默认 prod) → 制品库(app-2.1.0-rc3 测试制品) → 生产集群(mock 支付开关随制品带入)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '生产异常',
        text: '凌晨 2:17 发布后：3,200 笔支付走 mock 通道"成功"——回调全部带 TEST 标记，钱没真的动。\n风控/积分按"支付成功"入账：污染已扩散到 3 个下游系统。',
      },
      {
        type: 'text',
        title: '当时经过',
        text: '值班执行"发测试包到预发验证"：deploy.sh 2.1.0-rc3（没传 env 参数）。\n脚本按模板默认 --env=prod 静默落产；审批走"紧急通道"一键批——全程无人核对环境。',
      },
    ],
    timeline: '2:17 误发布 ｜ 2:57 用户工单发现"支付成功但没扣款" ｜ 3:10 人工熔断 ｜ mock 回调带 TEST 标记（可识别）',
    impactHint: '三道关全过 = 三道关都没核对环境——流程的每一关都在检查别的什么。污染已入账，回滚够吗？',
  },

  hypotheses: [
    { id: 'h-default', text: '脚本危险默认值：ENV=${1:-prod}——省略参数静默落产；输出被日志淹没', excludeActionId: 'a-scriptaudit' },
    { id: 'h-approval', text: '审批流形式化：紧急通道一键批，审批单环境字段无人核对', excludeActionId: 'a-approvallog' },
    { id: 'h-artifact', text: '制品命名混乱：prod/rc3 仅差后缀，选错制品', excludeActionId: 'a-artifactname' },
    { id: 'h-nogate', text: '部署后无环境自检：test 制品在生产启动成功且 mock 开关生效无人拦截', excludeActionId: 'a-postgate' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '量化污染面与可回收性',
      desc: '影响面：多少笔假支付、扩散到哪些下游、能否冲正',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '污染面盘点',
        text: '假支付：3,200 笔（mock 回调带 TEST 标记——可识别）\n扩散：风控(3,200 条风险画像) / 积分(按假支付发放 32 万分) / 通知(3,200 条"支付成功"短信)\n可回收性：TEST 标记全链路可追踪 → 冲正可行（幸运：测试制品的打标习惯救了场）\n→ 污染面清楚、可回收——处置顺序：先熔断再清洗。',
      },
    },
    {
      id: 'a-scriptaudit',
      name: '解剖发布脚本的参数语义',
      desc: 'ENV 默认值、输出可见性、二次确认',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-default'],
      hypotheses: [{ id: 'h-default', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '脚本解剖',
        text: 'deploy.sh：\n  ENV=${1:-prod}          ← 最危险的默认值：省略参数 = 部署生产\n  echo "deploying to $ENV" ← 唯一的环境提示，淹没在 200 行日志里\n  无交互确认、无制品环境标核对\n实锤：默认值指向最高危环境 × 无确认 × 提示不可见——三重设计缺陷叠加。\n值班"省略参数"是 8 个月养成的习惯——缺陷一直在等人踩。',
      },
    },
    {
      id: 'a-postgate',
      name: '审计部署后的环境自检',
      desc: '第二道闸：test 制品在生产启动，为什么没人拦',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-nogate'],
      hypotheses: [{ id: 'h-nogate', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '自检审计',
        text: '生产集群无任何"环境一致性门禁"：\n制品带 build-metadata（env=test）✓ 部署清单可读 ✓ 但无断言消费它\nmock 支付开关随配置进入生产生效——若启动时有"生产禁 mock"断言，40 分钟窗口归零。\n→ 确认第二道闸缺失：发布链路的正确性不能只靠"人不犯错"。',
      },
    },
    {
      id: 'a-approvallog',
      name: '核对审批流的环境字段',
      desc: '审批单写了 prod，谁该看见它',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-approval'],
      hypotheses: [{ id: 'h-approval', status: 'down' }],
      result: {
        type: 'text',
        title: '审批核对',
        text: '审批单环境字段=prod（信息其实是全的）；凌晨紧急通道一键批（值班权限），审批人 3 秒过单。\n→ 降权为放大器：信息在但无人核对——审批"形式化"是人的因素，制度缺陷（默认值/无自检）才是结构。',
      },
    },
    {
      id: 'a-artifactname',
      name: '核对制品命名规范',
      desc: '排除命名混淆为主因',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-artifact'],
      hypotheses: [{ id: 'h-artifact', status: 'excluded' }],
      result: {
        type: 'text',
        title: '命名核对',
        text: 'app-2.1.0-rc3（测试）vs app-2.1.0（生产）——后缀可区分但语义弱。\n→ 排除命名为主因：命名是弱信号，环境标（build metadata）才是强信号——它存在但没被消费。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急回滚版本（不清洗数据）',
      desc: '【状态变更】回滚到上一生产版本',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果（陷阱动作）',
        text: '假支付停止（新版本退出）。\n但 3,200 笔假支付/32 万积分/风控画像还在账上——回滚只停了"继续污染"，\n"已发生的污染"是独立动作：清洗 SOP 缺失的话，这部分永远不会被修。\n→ 复盘点评：回滚 ≠ 修复，数据污染要单独立项。',
      },
    },
    {
      id: 'a-fixgate',
      name: '修复：三重环境闸门',
      desc: '【状态变更】①ENV 必填无默认 ②制品环境标写入部署自检 ③部署后关键开关断言',
      cost: 3,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '闸门 v2',
        text: '① 脚本：ENV 必填（无默认值），prod 需二次交互确认"即将部署生产"\n② 部署自检：制品 metadata.env vs 目标集群——不一致拒绝启动\n③ 部署后断言：生产环境 mock/test 类开关必须 off，否则自动回滚\n回归演练：复刻当夜操作——三道闸依次拦截，0 分钟生产暴露。',
      },
    },
    {
      id: 'a-fixcleanup',
      name: '沉淀：污染数据清洗 SOP',
      desc: '【状态变更】按 TEST 标记的冲正脚本（支付/积分/风控反向回滚）+ 每季度演练',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '清洗 SOP',
        text: '① 识别：TEST 标记全链路追踪（幸运项制度化：测试流量必须打标）\n② 冲正：支付/积分/风控的反向脚本 + 影响名单导出\n③ 演练：每季度在预发演练清洗——数据污染的修复能力要像备份一样可验证。',
      },
    },
    {
      id: 'a-fixapproval',
      name: '沉淀：审批实质化',
      desc: '【状态变更】生产审批单回显制品指纹+目标环境+变更摘要，审批人对指纹签核',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '审批 v2',
        text: '紧急通道保留但不可跳过"指纹签核"：审批对象从"发布申请"变成"具体制品×具体环境"。\n3 秒过单至少过的是对的信息——形式化审批至少要形式化在正确的信息上。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-default', text: '发布脚本 ENV=${1:-prod} 危险默认值：省略参数静默部署生产，环境提示淹没在日志里、无二次确认——测试制品（带 mock 开关）上线生产 40 分钟', correct: true },
    { id: 'rc-approval', text: '紧急审批一键过单，环境字段无人核对（放大器）', correct: false },
    { id: 'rc-artifact', text: '制品命名后缀混淆导致选错制品', correct: false },
    { id: 'rc-nogate', text: '部署后无环境一致性自检，mock 开关在生产生效无拦截（确认的闸门缺失）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '三道关全过 = 三道关都没核对环境——先量化污染面与可回收性，处置级别由此定。',
      update: '3,200 笔可识别（TEST 标记）、可冲正、已扩散 3 个下游——先熔断、再清洗，两件事分开。',
      actionId: 'a-impact',
      why: '1⚡︎ 可回收性评估决定处置节奏：TEST 打标是"不幸中的万幸"——它同时告诉我们"打标习惯的价值"，要把幸运变成制度。',
      conclusion: '处置框架确立 → 解剖放行链。',
    },
    {
      thought: '解剖放行链的第一关：脚本参数语义——省略参数落哪个环境，是整个链路最深的坑。',
      update: '实锤：ENV=${1:-prod} 危险默认值 + 无确认 + 提示不可见——三重设计缺陷，值班省略参数是必然踩中。',
      actionId: 'a-scriptaudit',
      why: '2⚡︎ 脚本解剖揭示"默认值的方向性"：默认值应该指向最安全的环境（test），却指向最高危的（prod）——危险默认值是"等着被踩的地雷"，审计要专门看每个默认值指向哪里。',
      conclusion: '根因实锤 → 追问其他闸门。',
    },
    {
      thought: '第二道闸专项：部署后有没有环境一致性自检——"人不犯错"之外机器拦不拦。',
      update: '确认缺失：制品环境标存在但无断言消费，mock 开关生产生效零拦截——40 分钟窗口本可归零。',
      actionId: 'a-postgate',
      why: '1⚡︎ 闸门审计的关键问句："信息存在吗？被消费了吗？"——环境标早就在制品里，缺的是消费它的断言。已有的信息不自动成为防线。',
      conclusion: '两道闸的缺陷都确认 → 审批层定权。',
    },
    {
      thought: '审批层单独定权：它有信息（prod 字段）但无人核对——放大器而非结构缺陷；命名假设排除。',
      update: '审批形式化降权；命名弱信号排除——结构缺陷集中在脚本默认值与自检缺失。',
      actionId: 'a-approvallog',
      why: '1⚡︎ 多层失效要分层定责：人的因素（3 秒过单）与制度因素（危险默认值/无自检）分开——制度改革能防住"下一次凌晨"，人的培训不能。',
      conclusion: '定权完成 → 三重闸门修复。',
    },
    {
      thought: '止血（回滚+清洗分开）、修复（三重闸门）、制度（清洗 SOP+审批实质化）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（危险默认值）✓ 闸门（自检缺失）✓ 放大器（形式化审批）✓——三层缺陷三层修复，数据清洗单独立项。',
      conclusion: '沉淀：默认值指向哪里，事故就埋在哪里；环境自检是最后一道闸——人不该是防线，人只该是防线上被保护的那个。',
    },
  ],

  lessons: [
    {
      text: '默认值指向哪里，事故就埋在哪里：ENV=${1:-prod} 让"省略参数"这个最常见的习惯直接部署生产。',
      principle: '流程设计：危险操作的默认值必须指向最安全路径（test），高危环境必须显式选择 + 二次确认。"方便"与"危险"在同一处权衡——默认值审计（每个默认值指向哪）应进工具脚本评审清单。',
    },
    {
      text: '部署后环境自检是最后一道闸：制品环境标 vs 目标集群断言、高危开关断言——人不该是防线，人只该是被保护者。',
      principle: '验证思维：制品里"已经有"环境标不等于防线——信息必须被断言消费。三重闸门（脚本必填+自检拒启+开关断言）让误发布在任何一层被截断；最终防线自动化，凌晨的人只负责被叫醒。',
    },
    {
      text: '回滚不等于修复：假支付停止了，但已入账的污染要独立的清洗动作——数据污染必须单独立项。',
      principle: '沉淀思维：污染数据的可回收性来自"打标"（TEST 标记）——把幸运制度化：所有测试流量强制打标进生产可追踪。清洗 SOP（识别/冲正/演练）与备份一样：没有演练过的修复能力，等于没有。',
    },
  ],
}
