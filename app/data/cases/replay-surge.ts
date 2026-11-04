import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const replaySurgeCase: DiagnosisCase = {
  id: 'replay-surge',
  title: '死信重放把生产系统炸了',
  intro: '旧死信拟重放30000条，停止时已执行11000条。核对实际重复积分、候选历史兑现与共享数据库预算，别把潜在损失写成已发生。',
  domain: 'runtime',
  layer: '重放是全量负载注入——幂等窗口、下游容量、时效语义都要在重放前对表',
  part: 'master',
  chapterId: 'messaging',
  order: 7,
  typeTags: [
    'messaging',
    'capacity',
    'data',
  ],
  difficulty: 3,
  scene: {
    role: '你是「鲜到家」积分平台的负责人，一次"修复性重放"让大促前的系统雪上加霜。',
    architecture: '积分平台：死信队列(3 万条积分发放失败消息) → 重放工具(批量推送) → 积分服务 → 积分 DB ｜ 同机群: 下单主链路',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '重放后雪崩',
        text: '重放限速100条/s，每条5次DB操作；共享实例正常800查询/s、给定同负载预算约1000，额外500使需求约1300。停止时11000条已执行，下单排队明显。',
      },
      {
        type: 'text',
        title: '更糟的发现',
        text: '全30000候选中27000已有人工兑付记录，潜在重复81000积分；实际11000已执行中9900重复，各3积分，实际重复29700。两种口径不能混用。',
      },
      {
        type: 'log',
        title: '账单附件重试',
        text: '[WARN] points statement attachment upload retry。',
      },
      {
        type: 'log',
        title: '注销头像失败',
        text: '[WARN] user avatar tombstone image 404。',
      },
      {
        type: 'log',
        title: '查询指标外送延期',
        text: '[WARN] DB metrics archive delayed。',
      },
    ],
    timeline: '历史90天候选，格式修复后重放；7天去重记录由清理任务删除；本次只评估已核实业务键与容量，不调用真实积分/短信服务。',
    impactHint: '每一条死信单独看都合法，合起来是洪水——重放前要对哪些表？限速 100/s 又是对谁的 100/s？',
  },
  hypotheses: [
    {
      id: 'h-idemwindow',
      text: '重放未核对历史兑付与业务时效，短期msgId记录不足，又未按共享DB余量限速',
      excludeActionId: 'a-idemaudit',
    },
    {
      id: 'h-capacity',
      text: '100消息/s一定小于共享DB余量，负载不可能影响下单',
      excludeActionId: 'a-dbnorm',
    },
    {
      id: 'h-stale',
      text: '所有历史事件即使已退款/注销也始终有发积分资格',
      excludeActionId: 'a-stalecheck',
    },
    {
      id: 'h-bugremain',
      text: '格式bug仍导致重放全部未执行，所以没有任何积分副作用',
      excludeActionId: 'a-fixverify',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '给重放建立三层影响账',
      desc: '影响面：负载账 / 资损账 / 时效账',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '三层账本',
        text: '候选30000，已兑现27000；实际执行11000中重复9900×3=29700积分，81000是若全部重复候选再执行的潜在量。样本200条90%不能单独证明全量27000；本题该数来自兑付账本全量关联。',
      },
    },
    {
      id: 'a-idemaudit',
      name: '审计幂等窗口与死信年龄的匹配',
      desc: '幂等键的 TTL 是多久、死信最老多老',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-idemwindow',
      ],
      hypotheses: [
        {
          id: 'h-idemwindow',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '幂等窗口审计',
        text: '去重以msgId保留7天，候选92%超过7天；这只表示可能超出去重窗口，不等于92%都应处理或都重复。按稳定积分权益业务键关联人工和自动流水，确认27000已兑现；人工补发的不同msgId也必须归到同权益。\n实际重复9900个业务键都有历史兑现记录，短期消息记录已无或不能关联人工补发，重放把历史当新任务。',
      },
    },
    {
      id: 'a-dbnorm',
      name: '核算重放的真实 DB 负载',
      desc: '"限速 100/s"限的是消息，不是查询',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-capacity',
      ],
      hypotheses: [
        {
          id: 'h-capacity',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '负载换算',
        text: '100消息/s×5操作=500查询/s；给定同事务组合压测预算1000，正常约800，余量约200，叠加需求1300>1000。查询类型和事务锁成本仍须同负载验证，不能仅看QPS定所有系统容量。\n噪声收线：给定预算与本地查询计数不依赖异步归档，消息速率仍需换算目标操作数。',
      },
    },
    {
      id: 'a-stalecheck',
      name: '抽验死信的时效有效性',
      desc: '三个月的死信里有多少已"失去发放资格"',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-stale',
      ],
      hypotheses: [
        {
          id: 'h-stale',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '时效抽验',
        text: '全量权益核对有1300退款相关候选，另有注销/规则失效记录需按业务政策处理；9/200退款样本只估4.5%，不能直接当全量。反证所有历史永远有资格。积分已使用后能否冲正也由业务规则决定，不一概说无法收回或必能回收。\n噪声收线：图片404不自动决定权益失效，资格依据退款/账户与业务规则。',
      },
    },
    {
      id: 'a-fixverify',
      name: '核对当初 bug 的修复状态',
      desc: '排除"重放会再失败"——修复是否真的生效',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-bugremain',
      ],
      hypotheses: [
        {
          id: 'h-bugremain',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '修复核对',
        text: '同旧格式样本在修复版可通过，实际11000个执行记录及29700重复积分已确认；原格式错误不会解释“根本没执行任何副作用”。新10条测试通过不足以证明全部历史语义正确。\n噪声收线：附件失败不撤销已提交积分，本次11000执行与重复流水已独立核实。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急中止重放并回滚已发积分',
      desc: '【状态变更】kill 重放任务 + 按 msgId 回滚 8.1 万重复积分',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '中止结果',
        text: '中止后按实际11000执行ID对账，再评估29700重复积分的冲正/已用部分；没有依据声称回收72000。暂停减轻新增负载，恢复速度由当前队列与DB状态决定，不预先保证P99为300ms。',
      },
    },
    {
      id: 'a-fixgate',
      name: '修复：重放前三张表门禁',
      desc: '【状态变更】重放工具强制预检：幂等窗口表 / 下游容量表 / 时效过滤表，任一红灯禁止启动',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '门禁 v2',
        text: '预检按业务权益ID核对已兑现、待处理、失效与未知；换算目标DB/下游预算并保留主链路余量；先只读审查输出计划，再按业务确认和有界速率执行。dry-run自身也有读负载，不能无限跑生产。',
      },
    },
    {
      id: 'a-fixidem',
      name: '沉淀：死信重放的标准流程',
      desc: '【状态变更】SOP：补写幂等记录（重放前按 msgId 预插防重表）→ 影子重放 → 分级限速 → 对账',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重放 SOP',
        text: '只为已确认完成的权益保留/重建完成事实；待兑现任务保留可执行状态，在实际发放事务里用稳定权益键做唯一约束。\n把全部msgId预插“已处理”会让尚未执行的合法任务直接跳过，造成新漏发。发送/外部副作用需各自恢复协议；不存在统一默认使用目标容量30%即可安全。',
      },
    },
    {
      id: 'a-fixdrain',
      name: '沉淀：死信队列的"排水制度"',
      desc: '【状态变更】死信按周排水（不让它积压三个月）+ 重放预检制度化——杜绝"三个月的雷一次排"',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '排水制度',
        text: '死信排水排班：每周处理当周死信（重放或人工），积压 > 7 天告警。\n——本案例的真正教训：三个月不排水的死信队列，重放那天每一颗都是过期的雷。\n呼应 mq-disk：只进不出的死信，堆的不只是磁盘，还有时效炸弹。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-idemwindow',
      text: '重放只看旧消息未核对稳定权益的历史兑付/资格，短期msgId防重不能覆盖人工补发和90天记录；又超共享DB余量限速，造成实际重复及排队',
      correct: true,
    },
    {
      id: 'rc-capacity',
      text: '100消息/s天然不影响共享DB，负载无需换算',
      correct: false,
    },
    {
      id: 'rc-stale',
      text: '退款/注销后所有历史权益仍永久有效',
      correct: false,
    },
    {
      id: 'rc-bugremain',
      text: '格式bug使所有重放均未执行，无积分副作用',
      correct: false,
    },
  ],
  expertCost: 6,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '分开候选与实际执行损失。',
      update: '81000潜在，29700实际重复。',
      actionId: 'a-impact',
      why: '1⚡实际11000执行与30000候选不能混算。',
      conclusion: '核对稳定权益账本。',
    },
    {
      thought: '关联历史人工/自动兑付。',
      update: '短期msgId不覆盖同权益历史兑现。',
      actionId: 'a-idemaudit',
      why: '2⚡年龄只是风险，重复须由实际账本证明。',
      conclusion: '确认历史幂等缺口。',
    },
    {
      thought: '按共享目标换算负载。',
      update: '额外500超余量200。',
      actionId: 'a-dbnorm',
      why: '1⚡消息/s不能直接与DB预算比较。',
      conclusion: '排除天然安全速率。',
    },
    {
      thought: '核对退款和当前资格。',
      update: '部分历史已失效。',
      actionId: 'a-stalecheck',
      why: '1⚡不以少样本或过期天数直接决定所有权益。',
      conclusion: '排除永久资格。',
    },
    {
      thought: '核对实际副作用与修复范围。',
      update: '历史样例通过，11000已执行。',
      actionId: 'a-fixverify',
      why: '1⚡新格式可用不代表历史重放语义安全。',
      conclusion: '候选全部收敛。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】实际兑付账本、资格与资源预算共同解释后果，天然安全速率、永久资格和全部未执行三个命题均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '重放只看旧消息未核对稳定权益的历史兑付/资格，短期msgId防重不能覆盖人工补发和90天记录；又超共享DB余量限速，造成实际重复及排队',
    },
  ],
  lessons: [
    {
      text: '窗口外不等于该执行，msgId不同也不等于不同权益；历史人工补发必须按稳定业务键关联。',
      principle: '先区分已完成、待兑现、失效和未知，再决定重放。全部预插已处理键会吞掉未执行任务，正确幂等事实应与实际兑现事务绑定。',
    },
    {
      text: '候选潜在81000与实际重复29700必须分开，11000已执行不能声称27000已全部重复。',
      principle: '每个数字注明候选/执行范围、唯一业务键及积分单位；抽样比例不能冒充全量账本。',
    },
    {
      text: '消息速率不是最终资源负载，本题100×5=500超200查询/s余量。',
      principle: '按相同查询组合、事务与共享链路验证容量，再配有界速率。只读预检也消耗资源，固定30%不是所有系统的安全定律。',
    },
  ],
}
