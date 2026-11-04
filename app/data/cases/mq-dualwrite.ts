import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const mqDualWriteCase: DiagnosisCase = {
  id: 'mq-dualwrite',
  title: '订单落库了，积分消息却消失了',
  intro: '30个订单有提交记录，却没有积分消息。对齐可观察分支和持久意图，再区分进程退出、GC后的期限分支与真正发送失败。',
  domain: 'runtime',
  layer: '两次写入之间没有原子性——消息要和业务数据同生共死',
  part: 'master',
  chapterId: 'messaging',
  order: 9,
  typeTags: [
    'messaging',
    'data',
    'race',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」订单平台的架构师，积分系统的对账差异把双写问题摆上了台面。',
    architecture: '下单服务：① DB 事务(订单落库) ② 发送 MQ(积分消息) → 积分消费者(幂等入账)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '积分对账差异',
        text: '固定30个已满足积分条件的成熟订单样本：订单提交存在，积分意图/投递缺失。此处不从缺一条发送日志直接推断从未发送。',
      },
      {
        type: 'text',
        title: '时间特征',
        text: '22例在提交后进程退出，2例OOM终止；6例GC后恢复，但代码发现请求deadline已过直接return，跳过send。FullGC本身暂停后恢复，并不天然杀请求线程。',
      },
      {
        type: 'log',
        title: '积分图标失败',
        text: '[WARN] loyalty badge icon 404。',
      },
    ],
    timeline: '代码commit→检查请求期限→send；没有与订单同事务持久化的消息意图。样本按事务提交、进程事件与实际分支关联，不使用重启频率×3ms伪造0.05%概率。',
    impactHint: '消息"没被发送"而不是"发送失败"——在 commit 与 send 之间的那个间隙里，世界发生了什么？',
  },
  hypotheses: [
    {
      id: 'h-gap',
      text: '双写间隙：commit 与 send 两步非原子——间隙内进程死亡，消息永远不会发出',
      excludeActionId: 'a-codeseq',
    },
    {
      id: 'h-sendfail',
      text: '这30个样本都已调用send，只是发送异常被吞掉',
      excludeActionId: 'a-sendlog',
    },
    {
      id: 'h-broker',
      text: 'Broker 收到后丢失（持久化缺陷）',
      excludeActionId: 'a-brokercheck',
    },
    {
      id: 'h-consumer',
      text: '消息消费了但积分落库失败（消费侧丢）',
      excludeActionId: 'a-consumerside',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '对齐丢失时刻与进程事件',
      desc: '影响面：丢失订单的时刻与什么进程级事件重合',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '时刻对齐（30 个丢失样本）',
        text: '固定30个业务键：22进程退出、2OOM在commit后且send前；6个长GC后执行明确的deadline过期return分支。GC只是暂停诱因，直接跳过发送来自应用分支。受控故障注入可重现无消息意图状态。',
      },
    },
    {
      id: 'a-codeseq',
      name: '解剖下单代码的两步时序',
      desc: 'commit 与 send 之间有什么保障——答案是"什么都没有"',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-gap',
      ],
      hypotheses: [
        {
          id: 'h-gap',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '时序解剖',
        text: '代码：tx.commit(order);\nif (requestDeadlineExpired()) return;\nmq.send(pointsMessage);\n没有同事务的outbox。提交成功后退出，或走已过期分支，都留下订单而没有可恢复发送意图。\n顺序执行不是跨系统原子；“重启频率×3ms”没有请求分布、并发和单位就不能推日漏发率，删除原概率背书。',
      },
    },
    {
      id: 'a-sendlog',
      name: '审计发送失败的异常处理',
      desc: '顺藤摸瓜：send 阶段还有第二个漏洞吗',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-sendfail',
      ],
      hypotheses: [
        {
          id: 'h-sendfail',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '发送审计',
        text: '同键分支审计与受控断点：24个在send调用前进程终止，6个走return；没有进入send。缺普通日志不是唯一依据，本题有进程/分支关联和定点复放。排除这30个全都调用send失败的命题。\n噪声收线：图标在独立展示路径，不创建outbox也不调用send，该30样本控制流在发送前终止。',
      },
    },
    {
      id: 'a-brokercheck',
      name: '核对 Broker 持久化',
      desc: '排除 Broker 丢消息',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-broker',
      ],
      hypotheses: [
        {
          id: 'h-broker',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'Broker 核对',
        text: '该30个业务ID没有Broker入口事件，且受控在send前退出可复现；不能用其他收到消息都正常就全局宣判Broker零丢失。当前缺口发生在托付给Broker之前。',
      },
    },
    {
      id: 'a-consumerside',
      name: '核对消费侧入账',
      desc: '排除消费丢失',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-consumer',
      ],
      hypotheses: [
        {
          id: 'h-consumer',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '消费核对',
        text: '消费侧从未获得该30个投递事件，没有处理/ack或积分提交；受控send前退出产生同样账差。其他收到事件的成功率只作背景，不是本样本消费因果。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急回退为同步调用积分服务',
      desc: '【状态变更】弃 MQ 改同步 RPC 保证"提交即入账"',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回退结果（陷阱动作）',
        text: '改同步积分调用不会自动原子：若仍先commit再调用，进程在二者之间退出照样漏；若先外呼后commit，又有外部完成而订单回滚风险。同步还耦合期限/容量，不能宣称漏发归零。',
      },
    },
    {
      id: 'a-fixlocal',
      name: '修复：本地消息表（事务内落消息）',
      desc: '【状态变更】订单事务内写"待发消息"记录；独立投递器扫表发送+重试',
      cost: 3,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '订单与outbox发送意图在同库同事务提交；投递器用Broker确认及明确路由结果判断，失败/未知状态可恢复重试。\n发送后标记前崩溃仍可能重复，因此稳定业务键与消费幂等必需；outbox保证该DB事务中的意图，不自动与Broker消息或外部积分同生共死。',
      },
    },
    {
      id: 'a-fixcatch',
      name: '沉淀：发送失败显式化',
      desc: '【状态变更】send 失败进"待重试"而非 log.info；并行缺陷（12 单/天）一并消除',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '显式化',
        text: '若保留提交后快速发送，也必须先有同事务outbox意图，快速路径与后台投递使用同一稳定ID。仅在send失败后再写待重试表仍有“写表前进程退出”窗口，不能替代原子意图。',
      },
    },
    {
      id: 'a-fixrecon',
      name: '沉淀：双向对账制度化',
      desc: '【状态变更】订单表 vs 积分流水的小时级对账，差异自动补发消息',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '对账兜底',
        text: '对已满足积分条件且超过正常处理宽限的成熟订单，按稳定权益键核对outbox/投递/积分流水并恢复遗漏；退款/资格变化单独处理。小时调度不保证所有历史漏洞都在一小时修复，需观察失败与在途。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-gap',
      text: '订单commit与发送意图未原子保存；提交后进程退出或应用deadline分支跳过send，缺少可恢复意图造成该30个成熟订单漏积分',
      correct: true,
    },
    {
      id: 'rc-sendfail',
      text: '该30个样本都已进入send，只是异常被吞',
      correct: false,
    },
    {
      id: 'rc-broker',
      text: 'Broker 收到后持久化丢失',
      correct: false,
    },
    {
      id: 'rc-consumer',
      text: '消息消费成功但积分落库失败',
      correct: false,
    },
  ],
  expertCost: 6,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '关联提交、进程退出与期限分支。',
      update: '24在发送前终止，6恢复后return。',
      actionId: 'a-impact',
      why: '1⚡GC与终止不同，必须查实际控制流。',
      conclusion: '核对持久意图。',
    },
    {
      thought: '读取commit后分支。',
      update: '没有同事务发送意图。',
      actionId: 'a-codeseq',
      why: '2⚡顺序不是原子，未托付的任务没有恢复者。',
      conclusion: '确认双写间隙。',
    },
    {
      thought: '核对send是否进入。',
      update: '该30样本未调用send。',
      actionId: 'a-sendlog',
      why: '1⚡普通日志缺失不足，需分支与受控退出证据。',
      conclusion: '排除全为send异常。',
    },
    {
      thought: '核对Broker入口。',
      update: '样本未交给Broker。',
      actionId: 'a-brokercheck',
      why: '1⚡不以其他消息正常推Broker全局绝对零丢。',
      conclusion: '排除Broker后丢。',
    },
    {
      thought: '核对消费事件与流水。',
      update: '没有该批输入可消费。',
      actionId: 'a-consumerside',
      why: '1⚡明确消费边界，不能把未到达归消费失败。',
      conclusion: '候选全部收敛。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】提交与发送前终止/分支复现吻合，send异常、Broker后丢和消费提交失败均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '订单commit与发送意图未原子保存；提交后进程退出或应用deadline分支跳过send，缺少可恢复意图造成该30个成熟订单漏积分',
    },
  ],
  lessons: [
    {
      text: 'FullGC暂停不天然杀线程，本题跳过send来自恢复后的deadline分支；进程终止是另一种机制。',
      principle: '先关联真实分支和提交记录，再解释日志缺失。时间吻合不是充分因果，重启频率乘几毫秒也不是合法日漏发模型。',
    },
    {
      text: 'outbox把订单和发送意图原子保存，投递后标记前崩溃仍可能重复。',
      principle: '稳定业务键、Broker确认和消费唯一约束负责后续边界；不能把本地事务意图保证说成跨DB/MQ/外部积分的恰好一次。',
    },
    {
      text: '同步外呼与失败后才补待重试表都仍可能留下间隙；同事务意图才覆盖提交后退出。',
      principle: '对账按真实积分资格和成熟观察窗执行，用来恢复遗漏，不承诺固定一小时兜住所有未知故障。',
    },
  ],
}
