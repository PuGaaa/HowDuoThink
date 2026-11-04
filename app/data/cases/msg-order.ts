import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-master-systems-calibration.md。 */
export const msgOrderCase: DiagnosisCase = {
  id: 'msg-order',
  title: '已送达的订单跳回"配送中"',
  intro: '订单源状态未回退，展示一度变旧，稍后恢复。对照同一订单的提交版本、消费重试与缓存写入，而非只看日志时间。',
  domain: 'concurrency',
  layer: '顺序是隐藏的维度：至少一次投递 + 覆盖写 = 旧数据随时可以覆盖新数据',
  part: 'master',
  chapterId: 'concurrency',
  order: 3,
  typeTags: [
    'race',
    'timing',
  ],
  difficulty: 2,
  scene: {
    role: '你是交易平台推送服务的负责人，客服把一批"状态回退"的工单转给了你。',
    architecture: '订单服务 → MQ(状态变更事件, 至少一次投递) → 推送服务 → Redis(最新状态) → App 轮询展示',
    symptoms: [
      {
        type: 'error',
        title: '用户工单（摘录）',
        text: '12:01 显示"已送达"，12:03 跳回"配送中"，12:06 又变回"已送达"。\n没有操作，自己变的。今日同类工单 14 单。',
      },
      {
        type: 'text',
        title: '服务侧监控',
        text: '推送服务无报错；Redis 写入全部成功；\n订单库里的状态机流转记录正确且从未回退。',
      },
      {
        type: 'log',
        title: '通知图标失败',
        text: '[WARN] delivery icon 404；App控制台同时上报。',
      },
    ],
    timeline: '回退集中在状态快速流转的订单 ｜ 上周推送服务从单消费者扩到 8 个并发消费者（提升吞吐）',
    impactHint: '"几分钟后又自己变回来"——说明新数据一直都在，是有谁在某个时刻用旧数据覆盖了它。',
  },
  hypotheses: [
    {
      id: 'h-order',
      text: 'MQ 消息乱序：旧状态事件晚到，覆盖了新状态',
      excludeActionId: 'a-msgtrace',
    },
    {
      id: 'h-app',
      text: 'App 端缓存了旧状态，是展示层的问题',
      excludeActionId: 'a-apiread',
    },
    {
      id: 'h-redis',
      text: 'Redis 写入丢失或被其他服务覆盖',
      excludeActionId: 'a-redislog',
    },
    {
      id: 'h-statebug',
      text: '订单服务状态机流转错误，状态真的回退了',
      excludeActionId: 'a-orderstate',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '圈定回退订单的共性',
      desc: '什么样的订单会回退；杀掉 App 重进后状态对不对',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [
        {
          id: 'h-statebug',
          status: 'down',
        },
      ],
      result: {
        type: 'text',
        title: '共性分析',
        text: '14单集中在短时多次变更；12:03时即使重开App也仍旧，12:06后刷新才恢复。重开只是重新读当时服务数据，不能当作数据未损坏或客户端清白的证明。',
      },
    },
    {
      id: 'a-apiread',
      name: '抓 App 轮询接口的返回值',
      desc: '跳回"配送中"的时刻，服务端返回的到底是什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-app',
      ],
      hypotheses: [
        {
          id: 'h-app',
          status: 'excluded',
        },
      ],
      result: {
        type: 'log',
        title: '网关访问日志（问题时刻）',
        text: 'GET /order/8899/status → 200 {"status": "shipping"}  12:03:11\n→ 服务端那一刻返回的就是"配送中"：不是 App 缓存，是源头（Redis）里就是旧值。\n噪声收线：图标请求不改变状态JSON；故障时API明确返回shipping，Redis写审计可独立复核。',
      },
    },
    {
      id: 'a-msgtrace',
      name: '按订单号查 MQ 消息轨迹',
      desc: '同一订单的状态事件，发出与消费的先后顺序',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-order',
      ],
      hypotheses: [
        {
          id: 'h-order',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '消息轨迹（订单 8899）',
        text: '同订单业务版本v2 shipping、v3 shipped、v4 delivered依次提交，生产记录带该版本。扩容后轮询到不同RabbitMQ队列；v2首次通知超时并重投，v4先写，v2在12:03:05完成。\n12:06对账任务读取订单库v4并补发，缓存恢复；不是无原因自己变回。时间戳经过事件ID/版本和写入确认关联，不仅凭不同机器最早日志判乱序。',
      },
    },
    {
      id: 'a-orderstate',
      name: '查订单库状态机流转记录',
      desc: '确认源头状态是否真的回退过',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-statebug',
      ],
      hypotheses: [
        {
          id: 'h-statebug',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '状态机流水',
        text: '订单审计v2 shipping→v3 shipped→v4 delivered，最后库仍v4，无回退提交；版本来自同一权威事务序列。',
      },
    },
    {
      id: 'a-redislog',
      name: '查 Redis 状态写入历史',
      desc: '是写丢了，还是按错误的顺序写成功了',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-redis',
      ],
      hypotheses: [
        {
          id: 'h-redis',
          status: 'excluded',
        },
      ],
      result: {
        type: 'log',
        title: 'Redis 写入审计',
        text: 'Redis写审计及actor：12:00:59 v3 shipped，12:01:00 v4 delivered，12:03:05重试v2 shipping，12:06对账补发v4 delivered。均同一推送服务，无第三方写入且无丢写；错误在允许旧版本覆盖。',
      },
    },
    {
      id: 'a-consumerlog',
      name: '查消费者失败与重试日志',
      desc: '消费为什么会失败重试、重试间隔多久',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '消费失败日志',
        text: 'v2在通知阶段失败并被延迟重投。至少一次意味着可能重复，并不逻辑蕴含必然乱序；本案跨队列并行和独立重试实际使旧版本晚完成。',
      },
    },
    {
      id: 'a-partition',
      name: '查 MQ 队列路由规则',
      desc: '同一订单的消息是否落在同一队列',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-order',
      ],
      hypotheses: [
        {
          id: 'h-order',
          status: 'up',
        },
      ],
      result: {
        type: 'text',
        title: '路由配置',
        text: '扩容时新增的 8 个队列采用轮询路由——同一订单的消息被分散到不同队列，队列间无顺序保障。\n→ 扩容改了吞吐，也悄悄丢掉了"按订单哈希保序"的顺序键。',
      },
    },
    {
      id: 'a-codepush',
      name: '读推送服务的消费代码',
      desc: '收到消息后是怎么写状态的',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-order',
      ],
      hypotheses: [
        {
          id: 'h-order',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: 'push-worker.js（消费逻辑）',
        text: '消费者直接SET状态后执行notify，notify失败就重投；没有比较业务版本。可复放v4后再v2，缓存回到shipping。\n用Redis Lua原子比较版本并写状态（仅新版本更新），重投副作用再用自己的业务键幂等。单独GET版本再SET仍有竞态；状态枚举序号不应替代业务版本，业务可能撤销或重开。',
      },
    },
    {
      id: 'a-repush',
      name: '让客服触发"重新推送"',
      desc: '用最新状态重发一次消息，看能否恢复',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重推结果',
        text: '重推后状态立即恢复"已送达"——最新事件还在 MQ 轨迹里，重放即可修复。\n→ 这验证了数据可自愈，但也说明下一次快速流转还会复发。',
      },
    },
    {
      id: 'a-fixseq',
      name: '上保序与版本校验修复',
      desc: '【状态变更】按订单号哈希路由 + 状态版本号只前进不后退，灰度发布',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '同实体路由键和有序消费约束减少乱序；独立重试队列会绕开原顺序，不能声称它还能严格保证实体顺序。缓存采用原子业务版本比较；外部notify用独立幂等键，分别验证丢弃旧状态和保留必要副作用。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-order',
      text: '扩容改轮询路由丢了顺序键 + 失败重试打乱时序 + 覆盖写无版本校验——旧状态消息晚到后把新状态打了回去',
      correct: true,
    },
    {
      id: 'rc-app',
      text: 'App 端缓存了旧状态未刷新',
      correct: false,
    },
    {
      id: 'rc-redis',
      text: 'Redis 写入丢失，导致读到旧值',
      correct: false,
    },
    {
      id: 'rc-statebug',
      text: '订单服务状态机错误，状态真的回退了',
      correct: false,
    },
  ],
  expertCost: 8,
  restartActionId: 'a-fixseq',
  expertChain: [
    {
      thought: '确定回退和恢复时窗。',
      update: '重开不修Redis，12:06才恢复。',
      actionId: 'a-impact',
      why: '1⚡观察提示时序，但不是因果证明。',
      conclusion: '核对服务返回。',
    },
    {
      thought: '读取故障时API响应。',
      update: '服务器确返回shipping。',
      actionId: 'a-apiread',
      why: '1⚡分离客户端展示与服务快照。',
      conclusion: '排除App缓存。',
    },
    {
      thought: '关联版本和重试轨迹。',
      update: 'v4先完成，v2晚写；对账v4恢复。',
      actionId: 'a-msgtrace',
      why: '2⚡业务版本与调用归属支持跨系统先后，不能只排序墙钟。',
      conclusion: '确认乱序完成。',
    },
    {
      thought: '复放v4再v2并核对写代码。',
      update: '无版本比较使缓存回退。',
      actionId: 'a-codepush',
      why: '2⚡实际覆盖语义解释为什么晚到导致错误。',
      conclusion: '写边界缺失。',
    },
    {
      thought: '核对权威状态审计。',
      update: '源库只到v4，从未回退。',
      actionId: 'a-orderstate',
      why: '1⚡独立反证源状态机错误。',
      conclusion: '排除源状态。',
    },
    {
      thought: '核对Redis写入和actor。',
      update: '无丢写或第三方，确为旧版覆盖。',
      actionId: 'a-redislog',
      why: '1⚡写审计证明缓存服务执行了错误语义，而非存储随机丢失。',
      conclusion: '候选全部收敛。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】业务版本、写审计与回放一致，App、源状态机及存储丢写/第三方覆盖均排除，恢复由明确对账动作解释。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '扩容改轮询路由丢了顺序键 + 失败重试打乱时序 + 覆盖写无版本校验——旧状态消息晚到后把新状态打了回去',
    },
  ],
  lessons: [
    {
      text: '至少一次投递可能重复，但不自动等于必乱序；本案由跨队列并行和重试改变完成顺序。',
      principle: '保序条件包括生产顺序、路由键、队列/分区、并行处理及重试策略。只改成同一队列而继续并行或绕行重试仍可能乱序。',
    },
    {
      text: '缓存写入用权威业务版本做原子比较，不用墙钟或状态枚举的大小判新旧。',
      principle: 'GET后SET并非原子；Redis Lua可将比较与写合成一步。单调业务版本允许业务状态合法撤销，同时防旧事件覆盖新快照。',
    },
    {
      text: '丢弃旧快照与执行外部通知是两项不同副作用，必须分别定义幂等和重试。',
      principle: '旧版本不覆盖缓存，不代表旧事件的所有业务动作都可丢弃。以动作业务键审计是否执行，不能混成一个消费成功标记。',
    },
    {
      text: '恢复必须有具体制造者。本案12:06对账补发v4，App重开本身不改Redis。',
      principle: '用户观察可帮助定位时窗，但不能证明“最终正确所以数据没坏”；应查哪个动作写回最新版本。',
    },
  ],
}
