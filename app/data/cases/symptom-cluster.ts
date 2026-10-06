import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 读懂报错 第五批（多症状归一 L2）
 * 教学点：假设思维——多模块同时报不同异常，先找公共依赖与起始时刻：同一块骨牌的三声回响；
 * 配置读取 fail-fast 让"缺配置"在启动时尖叫。
 * 专家路径：impact(1) + originstamp(2) + cointoss(1) = 4⚡︎
 */
export const symptomClusterCase: DiagnosisCase = {
  id: 'symptom-cluster',
  title: '三种报错，三夜排查，其实是同一块骨牌',
  intro: '推荐模块 NPE、积分模块类型转换异常、通知模块空列表——三个值班员查了三夜。同一秒开始，同一个根因。',
  domain: 'runtime',
  layer: '多症状归一：同时同源的多异常，先找公共依赖的第一块骨牌',
  part: 'apprentice',
  chapterId: 'error-reading',
  order: 5,
  typeTags: ['config', 'observability'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」会员平台的值班后端，三个模块的告警在同一分钟把你淹没。',
    architecture: '会员平台三模块(推荐/积分/通知，各自独立服务) → 共享配置中心 → 各自 DB',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '三个告警（同分钟）',
        text: '推荐服务：NullPointerException（tier 分层逻辑）\n积分服务：NumberFormatException: "null"\n通知服务：推送列表为空（零发送）\n三个值班员各自拉群排查，三夜无果。',
      },
      {
        type: 'text',
        title: '共同点（没人注意到）',
        text: '三个异常的起始时刻：10:02:41（同一分钟）。\n三个模块互不调用、各有各的 DB——"独立的三个服务"为什么同时出事？',
      },
    ],
    timeline: '昨天 10:02 起三模块同时异常 ｜ 昨天上午有一次"会员分层功能"发布（新增配置键 member.tier.isEnabled）｜ 三模块共用一个配置中心命名空间',
    impactHint: '三个独立服务、三种异常、同一秒开始——"独立"的三个服务共享着什么？',
  },

  hypotheses: [
    { id: 'h-onecause', text: '三症状同根因：新增配置键缺失，三模块各自读到 null 走进各自的异常路径——同一块骨牌', excludeActionId: 'a-originstamp' },
    { id: 'h-three', text: '三个独立故障巧合同时发生（各修各的）', excludeActionId: 'a-cointoss' },
    { id: 'h-jar', text: '发布包损坏，class 文件缺失导致三服务连锁', excludeActionId: 'a-jarcompare' },
    { id: 'h-upstream', text: '上游用户服务变更导致三模块连锁失败', excludeActionId: 'a-upstreamcheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '把三个异常放上同一条时间线',
      desc: '影响面：起始时刻、异常类型、调用栈尾部',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '三异常对时',
        text: '推荐 NPE：          10:02:41.003\n积分 NumberFormat： 10:02:41.011\n通知 空列表：        10:02:41.020（首个告警触发）\n调用栈尾部：三者的栈底都有一帧 ConfigService.get(…)\n→ 同秒开始 + 栈底同源——"三个独立故障"的叙事开始动摇。',
      },
    },
    {
      id: 'a-originstamp',
      name: '倒序找第一块骨牌',
      desc: '时间线上第一条异常之前发生了什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-onecause'],
      hypotheses: [{ id: 'h-onecause', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '首因定位',
        text: '10:02:41.001  ConfigService WARN: key "member.tier.isEnabled" not found, return null\n（此后 3ms 内三模块连锁异常）\n考古：昨天"会员分层"发布新增此键——功能代码读它，配置中心从未录入。\n三模块的读法各不相同：推荐 if(tier==null)NPE / 积分 Integer.parseInt(null) / 通知 null→空列表。\n实锤：同一块骨牌（配置键缺失）的三声回响——每个模块用自己的方式摔倒。',
      },
    },
    {
      id: 'a-cointoss',
      name: '算"巧合"的概率',
      desc: '三个独立故障同秒发生的可能性',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-three'],
      hypotheses: [{ id: 'h-three', status: 'excluded' }],
      result: {
        type: 'text',
        title: '概率反证',
        text: '三模块月均各 1 次故障 → 同秒相遇概率 ≈ 十亿分之一；\n且三异常栈底同源（ConfigService）——巧合论出局。',
      },
    },
    {
      id: 'a-jarcompare',
      name: '核对发布包完整性',
      desc: '排除包损坏',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-jar'],
      hypotheses: [{ id: 'h-jar', status: 'excluded' }],
      result: {
        type: 'text',
        title: '包核对',
        text: '三服务 jar 校验和一致、类加载正常。\n→ 排除包损坏：丢的不是 class，是配置。',
      },
    },
    {
      id: 'a-upstreamcheck',
      name: '核对上游用户服务',
      desc: '排除上游连锁',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-upstream'],
      hypotheses: [{ id: 'h-upstream', status: 'excluded' }],
      result: {
        type: 'text',
        title: '上游核对',
        text: '用户服务零变更零异常。\n→ 排除上游：唯一的公共依赖是配置中心——它"少了一个键"。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急重启三模块期望配置重载',
      desc: '【状态变更】三模块滚动重启',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重启结果（陷阱动作）',
        text: '重启后键依然缺失——异常照旧，还叠加了重启期间的容量抖动。\n→ 复盘点评：重启解决"状态坏了"，解决不了"东西没了"——缺配置的重启等于把坑再挖一遍。',
      },
    },
    {
      id: 'a-fixconfig',
      name: '修复：配置键补录 + 语义确认',
      desc: '【状态变更】member.tier.isEnabled 补录 true；缺失语义修正为"关闭分支"',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 键补录 true（分层功能开启）\n② 三模块的缺失语义统一为 false（关闭分支）——未来再缺键，走关闭而不是崩溃\n三模块 10 分钟内全部恢复——一块骨牌立起来，三声回响同时消失。',
      },
    },
    {
      id: 'a-failfast',
      name: '沉淀：必填配置 fail-fast',
      desc: '【状态变更】新增配置键必须"先录后发"：代码引用的键在配置中心缺失 → 启动失败',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '门禁上线',
        text: '配置引用扫描进 CI：代码里引用的键必须在配置中心存在（或声明默认值）——\n"先发代码后补配置"的发布顺序被禁止。呼应 config-typo 的绑定校验：缺键要在启动时尖叫。',
      },
    },
    {
      id: 'a-fixcluster',
      name: '沉淀：多症状归一排错法',
      desc: '【状态变更】值班 SOP：多模块同时异常 → 先对时找首因 → 再找公共依赖 → 禁止各修各的',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'SOP 条目',
        text: '多症状归一三步：①同一条时间线对时（同秒=同因嫌疑大）\n②找公共依赖（配置/网络/共享服务）\n③验证"修一检全"（修骨牌一，回响全消才算真修好）。\n三个值班员三夜，不如一个值班员半小时——前提是知道这套方法。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-onecause', text: '"会员分层"发布新增配置键 member.tier.isEnabled 未在配置中心录入：三模块读到 null 各自走进异常路径（NPE/NumberFormat/空列表）——同一秒、同一根因、三种表象', correct: true },
    { id: 'rc-three', text: '三个独立故障巧合同时发生', correct: false },
    { id: 'rc-jar', text: '发布包损坏 class 缺失', correct: false },
    { id: 'rc-upstream', text: '上游用户服务变更连锁', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '三个独立服务同一秒出事——第一动作不是分头排查，是上同一条时间线对时。',
      update: '同秒开始 + 栈底同源（ConfigService）——"三个独立故障"叙事动摇。',
      actionId: 'a-impact',
      why: '1⚡︎ 对时是最便宜的归一动作：同秒同源这两个特征值十亿分之一的巧合概率——时间线一拉，独立叙事自动瓦解。',
      conclusion: '归一假设升权（h-onecause）。',
    },
    {
      thought: '倒序找第一块骨牌：时间线上第一条记录之前发生了什么。',
      update: '实锤：配置键缺失 WARN 领先 3ms，三个异常是它的三种摔法——骨牌一，回响三。',
      actionId: 'a-originstamp',
      why: '2⚡︎ 倒序找首因是多症状归一的核心技术：日志按时间倒着读，第一条异常之前的那行（往往是 WARN/INFO）才是真正的起点——"读报错"的最高阶形态：读没有"报错"二字的行。',
      conclusion: '根因实锤：配置键缺失。',
    },
    {
      thought: '巧合论用概率反证——三个独立故障的同秒相遇，数字上不可能。',
      update: '十亿分之一 + 栈底同源——独立叙事正式出局。',
      actionId: 'a-cointoss',
      why: '1⚡︎ 概率反证是归一的最后一道论证：即使机制已经清楚，也要关掉"就是巧合"的心理退路——值班群里的争论才会停止。',
      conclusion: '独立叙事出局。',
    },
    {
      thought: '包与上游各 1⚡︎ 排除；止血陷阱（重启不解决缺失）；修复+门禁+SOP。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（键缺失）✓ 归一（概率反证）✓ 防线（fail-fast+归一 SOP）✓——个案、机制、流程三层闭合。',
      conclusion: '沉淀：多症状归一——同时同源的多异常是同一块骨牌的回响；修一检全，回响全消才算真修好。',
    },
  ],

  lessons: [
    {
      text: '多模块同时报不同异常 = 同一块骨牌的多声回响：先对时找首因，再找公共依赖——禁止各修各的。',
      principle: '假设思维：多症状归一三步——时间线对时（同秒嫌疑）、公共依赖盘点（配置/网络/共享服务）、修一检全。三个独立故障同秒发生的概率在数学上近乎为零——"巧合"是排查中最贵的心理退路。',
    },
    {
      text: '倒序读日志：第一条异常之前的那行（往往是 WARN/INFO）才是真正的起点——"报错"只是回响，源头常在"不报错"的行里。',
      principle: '验证思维：读报错的最高阶形态是读没有报错二字的行。配置缺失、依赖降级、静默重试——这些 WARN/INFO 才是多米诺的第一推。三模块的"各自摔法"不同，恰好暴露它们共享同一块地。',
    },
    {
      text: '缺配置的重启等于把坑再挖一遍：重启解决"状态坏了"，解决不了"东西没了"——先判断丢的是什么类型。',
      principle: '程序设计：状态类故障（内存脏/连接死）重启有效；缺失类故障（配置键/文件/依赖）重启无效。止血前的第一问：我们丢的是"状态"还是"存在"？——两者的止血动作完全相反。',
    },
  ],
}
