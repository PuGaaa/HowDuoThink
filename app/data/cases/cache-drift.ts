import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const cacheDriftCase: DiagnosisCase = {
  id: 'cache-drift',
  title: '用户的头像变回了旧的',
  intro: '客服反馈：一批用户上传了新头像，App 里显示的还是旧头像，但网页版是新的。',
  domain: 'data',
  layer: '缓存新鲜度需要明确时效与失效机制，副本差异必须按同一主键核对',
  part: 'engineer',
  chapterId: 'data',
  order: 2,
  typeTags: [
    'data',
    'timing',
  ],
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
      {
        type: 'log',
        title: 'CDN日志投递告警',
        text: '[WARN] CDN log delivery delayed；新头像上传当天出现。',
      },
    ],
    timeline: '昨晚22:00发布后取消主动失效，改为每6小时批量刷新；10:00反馈来自之前已有缓存且在本次刷新窗口内改过头像的用户。',
    impactHint: 'App 和网页版显示不一致——哪边是真相？受影响的是谁？',
  },
  hypotheses: [
    {
      id: 'h-cache',
      text: 'App 读到的是缓存里的旧值，缓存没被更新',
      excludeActionId: 'a-userprobe',
    },
    {
      id: 'h-cdn',
      text: '头像图片本身有 CDN 缓存，URL 没变图片还是旧的',
      excludeActionId: 'a-imgurl',
    },
    {
      id: 'h-db',
      text: '数据库写入失败，新头像根本没存上',
      excludeActionId: 'a-dbcheck',
    },
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
        text: '受影响：已有旧头像Redis缓存，且最近一次批量刷新后上传过新头像的App用户。未命中缓存的首次读取可加载新值；网页直读DB正常。\n不能声称发布后所有上传用户全部受影响，是否已有缓存及刷新时点都会改变结果。',
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
      tests: [
        'h-cache',
        'h-db',
      ],
      hypotheses: [
        {
          id: 'h-cache',
          status: 'confirmed',
        },
        {
          id: 'h-db',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: 'Redis 缓存值 vs DB 值',
        text: '同一用户最近上传已返回成功，MySQL持久化avatar_url为u/8899_new_hash.jpg；Redis仍为u/8899_old_hash.jpg，App接口返回旧URL，网页返回新URL。对该用户写入已成功，排除“新头像根本没入库”。',
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
      tests: [
        'h-db',
      ],
      hypotheses: [
        {
          id: 'h-db',
          status: 'excluded',
        },
      ],
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
      tests: [
        'h-cdn',
      ],
      hypotheses: [
        {
          id: 'h-cdn',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'URL 规则',
        text: '上传生成新内容哈希URL，不覆盖旧文件。直接访问新URL得到新图，旧URL仍为旧图；App接口实际返回旧URL，图片层没有把新URL错误缓存成旧图。\n噪声收线：告警是访问日志异步投递；直接GET新URL能取新图，头像API返回旧URL发生在图片请求之前。',
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
      tests: [
        'h-cache',
        'h-cdn',
      ],
      hypotheses: [
        {
          id: 'h-cdn',
          status: 'down',
        },
      ],
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
      tests: [
        'h-cdn',
      ],
      hypotheses: [
        {
          id: 'h-cdn',
          status: 'excluded',
        },
      ],
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
        text: 'diff删除了DB事务提交后的缓存失效，改为每6小时批量刷新。任务最近一次04:00成功，下次10:00；样例用户04:10上传、09:50读到旧值，与窗口一致。\n同构仅恢复提交后失效，重新上传后下次读取新URL；若批处理失败还可能更久，不能把6小时无条件当严格上限。',
      },
    },
    {
      id: 'a-rollback',
      name: '恢复"更新后删缓存"逻辑并全量刷缓存',
      desc: '【状态变更】发布修复 + 主动清理受影响用户的旧缓存',
      cost: 9,
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
    {
      id: 'rc-cache',
      text: '发布移除了上传提交后的缓存失效，已缓存用户在下一次批量刷新前持续读取旧URL；DB已有新头像，图片URL和CDN均正常',
      correct: true,
    },
    {
      id: 'rc-cdn',
      text: 'CDN 缓存了旧头像图片',
      correct: false,
    },
    {
      id: 'rc-db',
      text: '数据库写入失败导致新头像丢失',
      correct: false,
    },
  ],
  expertCost: 5,
  restartActionId: 'a-rollback',
  expertChain: [
    {
      thought: '按缓存存在与修改时点切影响面。',
      update: '有旧缓存且在刷新窗口内更新者受影响。',
      actionId: 'a-impact',
      why: '1⚡不能把部分命中用户扩大为所有发布后上传用户。',
      conclusion: '比较同一用户各层数据。',
    },
    {
      thought: '对比DB、Redis与实际API返回。',
      update: 'DB新值、Redis旧值、App接口返回旧URL。',
      actionId: 'a-userprobe',
      why: '1⚡同一主键证据同时确认副本旧值和数据库写入成功。',
      conclusion: '确认缓存并排除DB失败。',
    },
    {
      thought: '对齐代码diff与调度窗口并回放。',
      update: '取消主动失效可复现，恢复后读取新URL。',
      actionId: 'a-gitlog',
      why: '2⚡时间线和单变量对照共同解释为何持续旧值。',
      conclusion: '机制完整。',
    },
    {
      thought: '独立请求新旧内容哈希URL。',
      update: '新URL确为新图，接口未返回它。',
      actionId: 'a-imgurl',
      why: '1⚡排除图像/CDN候选需要真实URL对照，不能凭diff代替。',
      conclusion: '其余候选排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】旧缓存返回与失效变更对照成立，数据库写入和新图片访问证据齐备。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '发布移除了上传提交后的缓存失效，已缓存用户在下一次批量刷新前持续读取旧URL；DB已有新头像，图片URL和CDN均正常',
    },
  ],
  lessons: [
    {
      text: '同一份数据两个端显示不一致 = 至少有两份数据源，先找出"谁是真相"。',
      principle: '缓存架构下每份数据存在多处（DB 真相 + 缓存副本 + CDN 副本）。不一致排查的第一步永远是：确定真相在哪，再比较其他副本与真相的差异。',
    },
    {
      text: '本案主动失效被周期刷新替代，造成业务不可接受的旧值窗口；更新后失效也要考虑并发回填和事件失败。',
      principle: 'Cache-Aside不会自动保证强一致。先规定可接受时效，再设计提交后失效、版本化或事件机制，并验证并发读写，不能承诺删缓存后窗口永远为0。',
    },
    {
      text: '变更必进时间线：昨晚的 diff 一眼给出了机制解释。',
      principle: '所有故障排查里，"最近改了什么"永远是性价比最高的一个问题。变更相关不一定因果，但因果常有变更参与。',
    },
  ],
}
