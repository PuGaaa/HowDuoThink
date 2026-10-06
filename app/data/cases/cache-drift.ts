import { DiagnosisCase } from '../../types/case'

/**
 * 第 2 章 · 数据的脾气（缓存不一致 L2）
 * 教学点：缓存与 DB 是两份数据；"先更新 DB 再删缓存"的时序窗口；TTL 是最后防线。
 * 专家路径：impact(1) + userprobe(1) + dbcheck(2) = 4⚡︎
 */
export const cacheDriftCase: DiagnosisCase = {
  id: 'cache-drift',
  title: '用户的头像变回了旧的',
  intro: '客服反馈：一批用户上传了新头像，App 里显示的还是旧头像，但网页版是新的。',
  domain: 'data',
  layer: '缓存与数据库之间，永远隔着一致性窗口',
  part: 'engineer',
  chapterId: 'data',
  order: 2,
  typeTags: ['data', 'timing'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」电商的社区服务后端，头像服务由你负责。',
    architecture: 'App(读缓存优先) → 缓存 Redis(头像 URL, TTL 24h) → MySQL(真相)',
    symptoms: [
      {
        type: 'text',
        title: '用户反馈',
        text: '上传了新头像，App 上还是旧头像；但网页版（读 DB 不走缓存）显示的是新头像。',
      },
      {
        type: 'error',
        title: '服务端监控',
        text: '头像上传接口 100% 成功；无报错、无超时——上传链路完全正常。',
      },
    ],
    timeline: '反馈集中在今天 10:00 后 ｜ 昨晚 22:00 发布过一次"头像上传优化"（上传后不再主动删除缓存，改为定时任务批量刷新）',
    impactHint: 'App 和网页版显示不一致——哪边是真相？受影响的是谁？',
  },

  hypotheses: [
    { id: 'h-cache', text: 'App 读到的是缓存里的旧值，缓存没被更新', excludeActionId: 'a-userprobe' },
    { id: 'h-cdn', text: '头像图片本身有 CDN 缓存，URL 没变图片还是旧的', excludeActionId: 'a-imgurl' },
    { id: 'h-db', text: '数据库写入失败，新头像根本没存上', excludeActionId: 'a-dbcheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定影响范围',
      desc: '哪些用户、哪个端、什么时间后上传的',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '影响范围',
        text: '昨晚 22:00 之后上传过头像的 App 用户全部受影响；\n之前上传的不受影响；网页版（直读 DB）全部正常。',
      },
    },
    {
      id: 'a-userprobe',
      name: '抽查受影响用户的缓存值',
      desc: '读该用户在 Redis 里的头像 URL',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'Redis 缓存值 vs DB 值',
        text: 'Redis:  avatar_url = https://img.example.com/u/8899_old.jpg\nMySQL:  avatar_url = https://img.example.com/u/8899_new.jpg\n→ 缓存里是旧值：DB 已更新但缓存没失效',
      },
    },
    {
      id: 'a-dbcheck',
      name: '查数据库写入成功率',
      desc: '排除 DB 写入失败',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-db'],
      hypotheses: [{ id: 'h-db', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'DB 写入监控',
        text: '头像表写入成功率 100%，无失败无回滚——真相（新头像）已经落库。',
      },
    },
    {
      id: 'a-imgurl',
      name: '查头像图片 URL 规则',
      desc: '新头像是不是生成了新 URL（还是覆盖原 URL）',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cdn'],
      hypotheses: [{ id: 'h-cdn', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'URL 规则',
        text: '上传生成**新 URL**（带内容哈希），不覆盖旧文件。\n→ 即使 CDN 有旧图缓存，只要缓存里的 URL 更新成新的，显示就会正确。',
      },
    },
    {
      id: 'a-applog2',
      name: '查 App 端请求的接口返回值',
      desc: 'App 拿到的接口响应里头像 URL 是新是旧',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-cache', 'h-cdn'],
      hypotheses: [{ id: 'h-cdn', status: 'down' }],
      result: {
        type: 'code',
        title: '接口响应',
        text: 'App 请求 /api/user 返回的 avatar_url 是**旧 URL**。\n→ 旧 URL 来自服务端缓存（接口层就读了 Redis），不是 App 或 CDN 的问题。',
      },
    },
    {
      id: 'a-cdntest',
      name: '直接访问新旧两个图片 URL',
      desc: '两个 URL 的图片内容分别是什么',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-cdn'],
      hypotheses: [{ id: 'h-cdn', status: 'excluded' }],
      result: {
        type: 'text',
        title: '图片内容对比',
        text: '旧 URL 显示旧头像、新 URL 显示新头像——两个 URL 都能正常出图。\n→ 排除 CDN 问题：只要缓存里的 URL 刷新成新的，显示就正确。',
      },
    },
    {
      id: 'a-gitlog',
      name: '查昨晚发布的代码 diff',
      desc: '看"头像上传优化"到底改了什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '昨晚的 diff',
        text: '- delete(Redis, avatar:{user_id})   ← 删缓存逻辑被删除！\n+ // 改为定时任务批量刷新（每 6 小时）\n→ 为了"降低缓存写压力"删掉了更新后删缓存的逻辑，引入一致性窗口',
      },
    },
    {
      id: 'a-rollback',
      name: '恢复"更新后删缓存"逻辑并全量刷缓存',
      desc: '【状态变更】发布修复 + 主动清理受影响用户的旧缓存',
      cost: 6,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '发版恢复删缓存逻辑 + 按受影响名单清理 Redis 旧值。\n用户重新打开 App，新头像恢复显示。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-cache', text: '昨晚发布删掉了"上传后删缓存"逻辑，App 读到未失效的旧缓存', correct: true },
    { id: 'rc-cdn', text: 'CDN 缓存了旧头像图片', correct: false },
    { id: 'rc-db', text: '数据库写入失败导致新头像丢失', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-rollback',

  expertChain: [
    {
      thought: 'App 和网页版显示不一致——两份数据源必然有一个是旧的。先圈范围。',
      update: '时间线（昨晚发布）+ 端差异（App 走缓存）→ h-cache 升权。',
      actionId: 'a-impact',
      why: '1⚡︎ 圈范围：受影响的是"发布后上传的 App 用户"，时间线和特征都指向缓存。',
      conclusion: 'App 受影响、网页正常 → App 读的缓存里是旧值。',
    },
    {
      thought: '直接抽查一个受影响用户的 Redis 值 vs DB 值——一锤定音的比较。',
      update: '实锤：缓存旧值、DB 新值。',
      actionId: 'a-userprobe',
      why: '1⚡︎ 的对比动作直接给出答案：两份数据不一致实锤，且知道旧值具体是什么。',
      conclusion: '缓存未失效 → "缓存没被更新"实锤，接下来查为什么没更新。',
    },
    {
      thought: '为什么没更新？两条路：DB 写入失败（真相就是旧的）或 更新缓存逻辑缺失。',
      update: '先排除 DB 写入失败（它是"真相错"级别的严重问题）。',
      actionId: 'a-dbcheck',
      why: '2⚡︎ 先验证真相正确性——如果 DB 都没写上，问题严重性完全不同。',
      conclusion: 'DB 写入 100% 成功 → 真相正确，问题锁定在缓存失效逻辑。',
    },
    {
      thought: '昨晚刚好发布过"头像上传优化"。变更必进时间线——看 diff。',
      update: '实锤：删缓存逻辑被删除，一致性窗口从 0 变成最长 6 小时。',
      actionId: 'a-gitlog',
      why: '2⚡︎ 看 diff 一步定位到引入问题的变更——变更相关不等于变更因果，但这里 diff 直接给出了机制解释。',
      conclusion: '实锤：昨晚发布删掉了"上传后删缓存"，且 URL 是新生成的（CDN 假设排除）。',
    },
    {
      thought: '证据闭合：机制（删缓存被删）+ 实锤（缓存旧值）+ 时间线（发布后）。停止收集，转入修复。',
      update: '停止。',
      actionId: '',
      why: '修复方案明确（恢复删缓存 + 主动清理），继续收集不改变行动。',
      conclusion: '发版恢复 + 清理受影响名单缓存，问题解决。沉淀：改缓存策略前必须评估一致性窗口。',
    },
  ],

  lessons: [
    {
      text: '同一份数据两个端显示不一致 = 至少有两份数据源，先找出"谁是真相"。',
      principle: '缓存架构下每份数据存在多处（DB 真相 + 缓存副本 + CDN 副本）。不一致排查的第一步永远是：确定真相在哪，再比较其他副本与真相的差异。',
    },
    {
      text: '"更新后删缓存"是缓存一致性的生命线，删掉它等于打开一致性窗口。',
      principle: 'Cache-Aside 模式下更新数据后必须失效缓存。任何"优化"（延迟删、批量刷）都会引入一致性窗口——窗口内用户看到旧数据。优化前先问：业务能容忍多旧的值？',
    },
    {
      text: '变更必进时间线：昨晚的 diff 一眼给出了机制解释。',
      principle: '所有故障排查里，"最近改了什么"永远是性价比最高的一个问题。变更相关不一定因果，但因果常有变更参与。',
    },
  ],
}
