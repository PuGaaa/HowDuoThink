import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const mqDelayCase: DiagnosisCase = {
  id: 'mq-delay',
  title: '同是19点开售，为什么提前量不同',
  intro: '三个19点开售活动在18:47、18:52、18:55执行。把创建、入调度和目标时刻列在同一张表，反推实际剩余时长。',
  domain: 'runtime',
  layer: '时刻与时长要分开，已从目标减去当前时间后不能再次扣创建后经过时长',
  part: 'master',
  chapterId: 'messaging',
  order: 4,
  typeTags: [
    'messaging',
    'time',
    'verification',
  ],
  difficulty: 3,
  scene: {
    role: '你是「鲜到家」电商的订单平台后端，"定时开售"延迟消息链路由你负责。',
    architecture: '运营创建活动→延迟服务写应用调度表dueAt→扫描dueAt<=now后发布MQ→开售执行器；时间统一为带时区解析后的epoch。',
    symptoms: [
      {
        type: 'error',
        title: '开售执行日志',
        text: '三个本应 19:00 开售的活动，分别在 18:47、18:52、18:55 被执行——全部提前 5~13 分钟，无一延后。',
      },
      {
        type: 'text',
        title: '运营反馈',
        text: '三活动目标均2026-09-29T19:00+08:00，同在18:30+08:00写入调度表；创建时间分别18:17、18:22、18:25。实际提前量13、8、5分钟。',
      },
      {
        type: 'log',
        title: '日历资源失败',
        text: '[WARN] activity calendar icon 404。',
      },
      {
        type: 'log',
        title: '指标投递重试',
        text: '[WARN] scheduler metrics export retry。',
      },
      {
        type: 'log',
        title: '通知附件重试',
        text: '[WARN] campaign notice attachment retry。',
      },
    ],
    timeline: '倒计时改为“扣除已等待时长”模式后出现；扫描器只按已写dueAt投递，是否时区问题需实际核算。',
    impactHint: '提前量不一致（5~13 分钟）是关键线索——如果是固定配置错误，提前量应该恒定。什么因素让"错多少"在变？',
  },
  hypotheses: [
    {
      id: 'h-cron',
      text: '到期检查器轮询间隔/批量扫描配置错误，提前捞取了未到期的任务',
      excludeActionId: 'a-poller',
    },
    {
      id: 'h-tz',
      text: '已用target-now算剩余时间，又重复扣now-created，创建后经过时长被扣两次',
      excludeActionId: 'a-tzaudit',
    },
    {
      id: 'h-dst',
      text: '活动设定的目标时刻被误解（本地时间 vs UTC），倒计时基于错误基准',
      excludeActionId: 'a-settime',
    },
    {
      id: 'h-clock',
      text: '服务器时钟漂移：执行器机器时间快了几分钟',
      excludeActionId: 'a-ntp',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '拉全量延迟任务的对时表',
      desc: '影响面：设定时刻 vs 实际执行时刻的偏差全景',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '设定 vs 实际执行（三天全量）',
        text: '同目标19:00、同写表18:30：创建18:17→执行18:47（提前13）；18:22→18:52（提前8）；18:25→18:55（提前5）。提前量恰等于写表前已经经过的13/8/5分钟。变化形状提示输入依赖，不足以单独排除任何机器漂移。',
      },
    },
    {
      id: 'a-poller',
      name: '检查到期扫描器配置',
      desc: '轮询间隔/提前量容忍窗口',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-cron',
      ],
      hypotheses: [
        {
          id: 'h-cron',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '扫描器配置',
        text: '扫描条件dueAt<=now，无预取提前窗口；该三个消息的实际发布均在各自已写dueAt后。不能仅用10秒轮询间隔排除分钟级提前，决定性证据是调度字段本身已早。\n噪声收线：附件任务独立，扫描谓词只看已写dueAt；它不提前发布活动消息。',
      },
    },
    {
      id: 'a-ntp',
      name: '核对全部机器的时钟同步',
      desc: '排除服务器时钟漂移',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-clock',
      ],
      hypotheses: [
        {
          id: 'h-clock',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'NTP 状态',
        text: '调度服务、扫描器与执行器对同一UTC参考偏差<50ms；Broker接收与dueAt差也在正常投递范围，不能解释5~13分钟。',
      },
    },
    {
      id: 'a-queuelog',
      name: '查延迟消息入队时的时长字段',
      desc: '看写入队列的 delay 值是否已经错了',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '入队消息体',
        text: '三个记录delayMs为1020000/1320000/1500000（17/22/25分钟），dueAt为18:47/18:52/18:55；正确剩余均1800000。MQ是在对应dueAt后收到，提前已发生在调度字段。\n噪声收线：调度表dueAt已从数据库快照取得，外送指标不参与delay公式或更新dueAt。',
      },
    },
    {
      id: 'a-tzaudit',
      name: '核对时刻解析与时长公式',
      desc: '把三个epoch代入，判断是否重复扣已等待时长',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-tz',
      ],
      hypotheses: [
        {
          id: 'h-tz',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '倒计时代码 diff（本周一变更）',
        text: '实际代码：const remaining = targetEpoch - nowEpoch;\nconst delayMs = remaining - (nowEpoch - createdEpoch);\n三个epoch均由带+08:00的ISO时刻正确解析，没有跨时区相减错误。remaining已经扣到现在，再扣elapsed会多扣13/8/5分钟。\nDate.parse(上海带偏移时间)返回epoch与Date.now epoch可直接相减；旧说法“本地parse减UTC epoch必错8小时且变动几分钟”不成立。',
      },
    },
    {
      id: 'a-settime',
      name: '核对运营设定的时间语义',
      desc: '活动目标时刻存的是什么时间',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-dst',
      ],
      hypotheses: [
        {
          id: 'h-dst',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '设定端记录',
        text: '运营提交目标字符串含+08:00，解析epoch与业务确认的上海19:00一致，created也带偏移。仅target-now为正确30分钟，目标时区未误设。\n噪声收线：图标不改变提交的带偏移目标字符串，业务确认与epoch已核对。',
      },
    },
    {
      id: 'a-boundary',
      name: '设计边界用例验证修复',
      desc: '跨时区/跨天/整点边界上验证新代码——不止验"周二19:00"',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '边界用例矩阵（验证思维）',
        text: '修复回归矩阵应覆盖：创建→入调度经过0/5/13分钟、跨日目标、带不同偏移但相同epoch、目标已过期和大时长边界。上海无现行DST，UTC也无DST；若支持DST必须用实际有夏令时的区域并定义歧义/不存在本地时刻策略。',
      },
    },
    {
      id: 'a-haltdeliver',
      name: '紧急下线定时开售功能',
      desc: '【状态变更】暂停延迟开售入口，已创建活动转人工执行',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '延迟开售入口下线，未执行的活动转人工定时；队列中未到期消息全部废弃重建。\n→ 超前执行风险解除，等待修复验证后恢复。',
      },
    },
    {
      id: 'a-fixtz',
      name: '统一时间语义：全链路 UTC 纪元秒',
      desc: '【状态变更】延迟计算改为 epoch 差值，展示层才做时区转换',
      cost: 3,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '仅使用delayMs=targetEpoch-nowEpoch并以正确dueAt存储，创建时刻用于审计而非再扣一次。epoch用于时刻，纯持续时间无需时区；不必宣称所有系统都只能存epoch而不能存带时区时间。\n重建未执行任务前按活动ID和版本去重，已经开售的不能因重建再次触发。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-tz',
      text: 'target-now已经是剩余时长，新公式又扣now-created，使提前量等于创建到入调度经过的13/8/5分钟；不是正确epoch之间的时区差',
      correct: true,
    },
    {
      id: 'rc-cron',
      text: '到期扫描器配置了提前捞取窗口',
      correct: false,
    },
    {
      id: 'rc-dst',
      text: '运营设定的目标时刻本身存错时区',
      correct: false,
    },
    {
      id: 'rc-clock',
      text: '执行器服务器时钟漂移导致提前执行',
      correct: false,
    },
  ],
  expertCost: 7,
  restartActionId: 'a-haltdeliver',
  expertChain: [
    {
      thought: '把创建与入调度都放进对时表。',
      update: '提前13/8/5恰等于已经过时长。',
      actionId: 'a-impact',
      why: '1⚡形状提供计算变量，不直接指定时区结论。',
      conclusion: '读取实际dueAt。',
    },
    {
      thought: '核对已写delay与MQ投递。',
      update: '17/22/25分钟已在入调度时写错。',
      actionId: 'a-queuelog',
      why: '2⚡确定错误发生在入调度前，而非扫描提前。',
      conclusion: '定位到计算边界。',
    },
    {
      thought: '逐epoch代入公式。',
      update: 'target-now后又扣now-created。',
      actionId: 'a-tzaudit',
      why: '1⚡正确带偏移解析不会与UTC epoch产生额外时区差。',
      conclusion: '确认重复扣时长。',
    },
    {
      thought: '核对扫描谓词和发布时点。',
      update: '按已写dueAt发布，无提前窗口。',
      actionId: 'a-poller',
      why: '1⚡轮询间隔本身不证明安全，需读实际选择条件。',
      conclusion: '排除扫描器。',
    },
    {
      thought: '核对同参考时钟偏差。',
      update: '小于50ms而故障为分钟级。',
      actionId: 'a-ntp',
      why: '1⚡实际时钟证据反证漂移。',
      conclusion: '排除时钟。',
    },
    {
      thought: '核对目标带偏移及业务意图。',
      update: '上海19点epoch正确。',
      actionId: 'a-settime',
      why: '1⚡目标正确与公式错误是不同层。',
      conclusion: '候选全部收敛。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】13/8/5分钟公式复算与实际dueAt吻合，扫描提前、目标误解和时钟漂移均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: 'target-now已经是剩余时长，新公式又扣now-created，使提前量等于创建到入调度经过的13/8/5分钟；不是正确epoch之间的时区差',
    },
  ],
  lessons: [
    {
      text: '变化的提前量需要函数对账：本案提前量=now-created，并由公式重复扣除解释。',
      principle: '曲线形状提供候选，实际字段和单变量公式复算才证因果。不能凭偏移不固定就直接排除时钟，也不能捏造UTC+8产生不定分钟数。',
    },
    {
      text: '带偏移本地时刻正确parse得到epoch后，可以与UTC epoch直接相减；时长不是另一个时区里的时刻。',
      principle: '本案错误是重复扣elapsed。目标与现在属于同一时间尺度，先确认解析语义，再谈存储格式；epoch和带时区时间都可正确表示瞬间。',
    },
    {
      text: '重建延迟任务也要保留活动ID/版本幂等，防已经执行的活动被再次开售。',
      principle: '测试应覆盖创建后延迟入队、跨日和已过期等边界；UTC或上海都不提供夏令时切换样例，需选真实DST地区才算覆盖。',
    },
  ],
}
