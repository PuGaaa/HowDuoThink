import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const poolExhaustedCase: DiagnosisCase = {
  id: 'pool-exhausted',
  title: '下单体突然卡死',
  intro: '运营活动开始 10 分钟后，下单接口全线超时，但 CPU 和内存都很安静。',
  domain: 'data',
  layer: '连接池：池是共享资源，任何租户不还，所有人都借不到',
  part: 'engineer',
  chapterId: 'data',
  order: 1,
  typeTags: [
    'resource',
    'capacity',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」电商的下单服务后端，今晚运营有大促预热活动。',
    architecture: '用户 App → 下单服务 → 连接池(max=20) → MySQL 主库',
    symptoms: [
      {
        type: 'error',
        title: '下单服务 error.log',
        text: '2026-10-12 20:10:11 [error] GetConnection timeout: waited 5000ms, pool active=20/20\n...（同类错误每秒刷屏）',
      },
      {
        type: 'text',
        title: '监控大盘',
        text: '下单接口 P99 从 200ms 飙到 5000ms+；CPU 15%、内存平稳、MySQL QPS 反而比平时低——"机器不忙，业务却卡死"。',
      },
    ],
    timeline: '20:10 大促预热活动开始后 10 分钟内故障 ｜ 无任何发版（最近一次发布在三天前）',
    impactHint: '下单全挂，但商品浏览正常——范围先画清楚。',
  },
  hypotheses: [
    {
      id: 'h-slow',
      text: '某类慢查询占住连接不放，池被吃光',
      excludeActionId: 'a-slowquery',
    },
    {
      id: 'h-leak',
      text: '代码漏还连接（连接泄漏）',
      excludeActionId: 'a-stack',
    },
    {
      id: 'h-mysql',
      text: 'MySQL 本身故障或过载',
      excludeActionId: 'a-mysql',
    },
    {
      id: 'h-traffic',
      text: '普通订单流量骤增，单纯超过20连接的日常容量',
      excludeActionId: 'a-poolstat',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '查影响范围',
      desc: '哪些接口受影响，读接口是否正常',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '影响范围',
        text: '下单/支付使用该主库连接池，发生借连接超时；浏览/搜索走独立只读库正常。CPU15%、内存平稳。读库正常不能排除主库故障，下一步定位借连接阶段和持有者。',
      },
    },
    {
      id: 'a-errorlog',
      name: '读下单服务 error.log',
      desc: '定位报错发生在哪一层',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'log',
        title: 'error.log 关键行',
        text: 'GetConnection timeout: waited 5000ms, pool active=20/20\n—— 全部报错集中在【服务 ↔ 连接池】借连接阶段\n没有 SQL 执行报错、没有数据库驱动报错',
      },
    },
    {
      id: 'a-poolstat',
      name: '查连接池实时状态',
      desc: 'active/idle/wait 指标与 20 分钟前的对比',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-traffic',
      ],
      hypotheses: [
        {
          id: 'h-traffic',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '连接池指标',
        text: 'active=20/20、idle=0、wait=87；借出超过180s的20个连接均归属本次批量导出job。普通订单QPS与故障前相同；导出任务一次提交24个并行子任务，与订单共用池。\n池满本身不排除流量过大；这里依据普通流量未增长和长期持有记录，排除“正常订单峰值超过既定容量”。',
      },
    },
    {
      id: 'a-slowquery',
      name: '查 MySQL 慢查询与 processlist',
      desc: '有没有 SQL 执行了几十秒还在跑',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-slow',
      ],
      hypotheses: [
        {
          id: 'h-slow',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'log',
        title: 'processlist 关键行',
        text: 'MySQL processlist与池connectionId关联：20条同类orders批量导出SQL，每条Time180~300s，占20个连接；另外4个导出子任务和87个业务请求在借连接前排队。\n对应查询缺少匹配索引，扫描量大。暂停该job并等现有查询结束的受控回放中，active回落4~6、订单恢复。20条足以占满20池，不用6条声称打满20。',
      },
    },
    {
      id: 'a-stack',
      name: '抓借连接处的线程堆栈',
      desc: '看连接被借走后在代码里停在哪一行',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-leak',
      ],
      hypotheses: [
        {
          id: 'h-leak',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '线程堆栈抽样',
        text: '20个已借出连接均可关联到仍执行中的导出SQL，线程阻塞在驱动读取结果；代码在try-with-resources中关闭连接。受控查询完成后借出记录全部消失，无失联连接。87个业务线程等待借连接，不是泄漏持有者。',
      },
    },
    {
      id: 'a-mysql',
      name: '查 MySQL 自身健康度',
      desc: 'CPU/连接数/慢查询总数的数据库侧视角',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-mysql',
      ],
      hypotheses: [
        {
          id: 'h-mysql',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'MySQL 侧',
        text: '故障同窗主库CPU8%，连接23/500、无锁等待；同主库独立诊断连接的小查询延迟正常。仅20条导出扫描慢，排除数据库整体故障或所有SQL同时退化。',
      },
    },
    {
      id: 'a-netprobe',
      name: '抓服务到 MySQL 的网络包',
      desc: 'tcpdump 看连接层面的网络交互',
      cost: 3,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-mysql',
      ],
      hypotheses: [
        {
          id: 'h-mysql',
          status: 'down',
        },
      ],
      result: {
        type: 'text',
        title: '网络包抽样',
        text: 'TCP 连接建立正常、无重传/无 RST——网络层干净。3⚡︎ 只排除了网络问题（本来优先级就低）。',
      },
    },
    {
      id: 'a-restart',
      name: '重启下单服务',
      desc: '【状态变更】重启释放所有连接',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重启结果',
        text: '重启后 3 分钟内正常，随后批量导出任务再次跑起来，连接重新被吃光。\n问题复发 = 有一只手在持续拿走连接。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-slow',
      text: '一次并行导出占用共用池的20个连接，每条SQL持续180~300s；普通订单无法借连接，形成超时排队',
      correct: true,
    },
    {
      id: 'rc-leak',
      text: '代码缺陷导致连接借出后未归还（连接泄漏）',
      correct: false,
    },
    {
      id: 'rc-mysql',
      text: 'MySQL 数据库故障导致所有 SQL 变慢',
      correct: false,
    },
    {
      id: 'rc-traffic',
      text: '大促流量上涨，20 个连接的池配太小不够用',
      correct: false,
    },
  ],
  expertCost: 8,
  restartActionId: 'a-restart',
  expertChain: [
    {
      thought: '圈定主库池与读库边界。',
      update: '只有共用写池的路径受影响。',
      actionId: 'a-impact',
      why: '1⚡读库正常不能直接替主库做健康证明。',
      conclusion: '核对池持有者。',
    },
    {
      thought: '按connectionId和job统计长持有。',
      update: '20个长持有都来自24并发导出，普通订单流量稳定。',
      actionId: 'a-poolstat',
      why: '2⚡占满的算术与流量反证都来自实际持有记录。',
      conclusion: '排除普通订单峰值。',
    },
    {
      thought: '关联processlist与导出job。',
      update: '20条慢SQL占20连接，受控停止后恢复。',
      actionId: 'a-slowquery',
      why: '2⚡20/20能对账，相关性加受控恢复支持因果。',
      conclusion: '确认慢查询饥饿。',
    },
    {
      thought: '核对持有线程及完成后归还。',
      update: '连接仍在执行并最终归还。',
      actionId: 'a-stack',
      why: '2⚡有finally不等于没有泄漏，还需持有归属及归还证据。',
      conclusion: '排除泄漏。',
    },
    {
      thought: '从主库侧核对独立小查询。',
      update: '主库资源、锁和小查询正常。',
      actionId: 'a-mysql',
      why: '1⚡借连接失败不能单凭错误层级排除后端数据库故障。',
      conclusion: '排除主库整体故障。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】20条长查询与20池持有者吻合、受控回放恢复；普通流量、失联泄漏和主库整体故障均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '一次并行导出占用共用池的20个连接，每条SQL持续180~300s；普通订单无法借连接，形成超时排队',
    },
  ],
  lessons: [
    {
      text: '"机器不忙业务卡死"先查资源池：池满时一切请求都在排队。',
      principle: '连接池是所有请求共享的瓶颈资源：池满的症状（排队超时）与数据库故障相似，但数据库侧视角完全不同——分层看池指标是第一动作。',
    },
    {
      text: '慢查询是连接池耗尽的头号成因：一条 3 分钟的 SQL = 3 分钟少一个连接。',
      principle: '连接是租借制共享资源：占用时长 × 频率 决定池的承载力，任何长事务/慢查询都在向所有请求"征税"。',
    },
    {
      text: '重启能救急但不能结案：问题复发说明存在持续占用的手。',
      principle: '重启释放的是症状不是根因——复发的故障必须找到"持续存在的元凶"，否则每次重启只是下一轮故障的倒计时。',
    },
  ],
}
