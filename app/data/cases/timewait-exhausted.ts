import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const timewaitCase: DiagnosisCase = {
  id: 'timewait-exhausted',
  title: '接近三万个TIME_WAIT，出站请求开始失败',
  intro: '物流调用报EADDRNOTAVAIL，下游指标正常。核对同一源地址与目标的连接状态、临时端口和复用设置。',
  domain: 'runtime',
  layer: '按源/目的元组核对临时端口与连接留存，复用可降低持续新建速率',
  part: 'engineer',
  chapterId: 'runtime',
  order: 4,
  typeTags: [
    'runtime',
    'network',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」订单服务的负责人，值班群里有用户反馈下单时物流查询加载失败。',
    architecture: '6个Node.js18订单Pod→物流服务固定VIP:9443；每Pod一个源IP，故障Pod的网络命名空间独立。',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '订单服务错误日志',
        text: 'connect EADDRNOTAVAIL（Cannot assign requested address），本Pod调用物流约3%~4%失败；尚需区分临时端口耗尽与显式localAddress错误，不能只凭报错认定端口。',
      },
      {
        type: 'text',
        title: '监控两侧对比',
        text: '物流查询服务：QPS 平稳、P99 正常、零报错——"我这边什么都没发生"。\n订单服务：仅调用物流接口的请求报错，报错率随流量上升。',
      },
      {
        type: 'log',
        title: '证书到期预警',
        text: '[WARN] admin-console certificate expires in 10 days；同节点日志有此条。',
      },
    ],
    timeline: '物流全局约3000QPS，其中故障Pod约485次建连尝试/秒；业务增长后出现，连接代码未变，未启用端口复用相关调优。',
    impactHint: '报错是"出不去"而不是"连不上"——方向在哪一边？',
  },
  hypotheses: [
    {
      id: 'h-tw',
      text: 'TIME_WAIT 堆积耗尽本地端口：短连接高频挥手，出站端口用光',
      excludeActionId: 'a-netstat',
    },
    {
      id: 'h-down',
      text: '物流服务过载拒绝连接：下游扛不住',
      excludeActionId: 'a-down',
    },
    {
      id: 'h-dns',
      text: 'DNS 解析变慢或失败：解析阶段就出错',
      excludeActionId: 'a-dns',
    },
    {
      id: 'h-pod',
      text: 'Pod 网络/安全组抖动：基础设施问题',
      excludeActionId: 'a-podcheck',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '圈定报错的范围与内容',
      desc: '哪些请求报错，报错原文是什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '报错画像',
        text: '仅一个Pod到固定物流VIP:9443的出站连接受影响，其他目的地址及入站正常；错误为EADDRNOTAVAIL。源localAddress确为本Pod存在地址，下一步检查同一源/目的元组的临时端口可用量。',
      },
    },
    {
      id: 'a-netstat',
      name: '看 TCP 状态分布',
      desc: 'netstat 全景：连接卡在哪个状态',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-tw',
      ],
      hypotheses: [
        {
          id: 'h-tw',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: 'netstat -an | 统计',
        text: '同一Pod网络命名空间、同一源IP→物流VIP:9443：TIME_WAIT28080、ESTABLISHED100。ip_local_port_range=32768~60999，共28232个候选端口；同元组占用已接近上限。\n本环境实测TIME_WAIT约60秒、无可用复用路径；connect失败前无SYN发出，localAddress存在。端口压力可解释本案，不能把跨目标聚合31284个连接塞进单目标28232范围。\n噪声收线：预警针对管理域名且尚未过期；物流失败发生在本机分配端口、发SYN之前，不可能由另一个域名的证书校验触发。',
      },
    },
    {
      id: 'a-code',
      name: '读物流客户端的实现',
      desc: '连接有没有被复用',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-tw',
      ],
      hypotheses: [
        {
          id: 'h-tw',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: 'logistics-client.js',
        text: '本案Node.js18显式配置：\nhttp.request({ host, port:9443, path, agent:false });\n抓包与客户端socket统计均显示一请求一新连接，客户端主动关闭。每次调用http.request本身不等于新TCP；Node有globalAgent且不同版本默认keepAlive不同，本案依据agent:false和抓包。',
      },
    },
    {
      id: 'a-down',
      name: '查物流服务的负载与日志',
      desc: '排除下游过载',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-down',
      ],
      hypotheses: [
        {
          id: 'h-down',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '下游监控',
        text: '同窗物流P99正常；失败trace在本机connect返回前未发出SYN，目标服务器无该次请求或拒绝记录。排除远端过载拒绝，而非仅凭远端零告警。',
      },
    },
    {
      id: 'a-dns',
      name: '查 DNS 解析耗时',
      desc: '排除解析阶段',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-dns',
      ],
      hypotheses: [
        {
          id: 'h-dns',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'DNS 监控',
        text: '对同一错误trace记录解析成功与目标VIP一致，失败发生在后续本机分配端口；解析P99<5ms，无失败。',
      },
    },
    {
      id: 'a-qps',
      name: '算一笔端口消耗账',
      desc: '连接速率 vs 端口容量的数学题',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-tw',
      ],
      hypotheses: [
        {
          id: 'h-tw',
          status: 'up',
        },
      ],
      result: {
        type: 'text',
        title: '消耗速率计算',
        text: '本Pod建连尝试约485/s，成功约468/s；实测留存60s，468×60=28080个TIME_WAIT，与快照吻合。失败约17/485≈3.5%，是同窗观测，不能把全局3000QPS直接乘60然后用3%解释18万需求。',
      },
    },
    {
      id: 'a-podcheck',
      name: '查 Pod 网络与安全组',
      desc: '排除基础设施层',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-pod',
      ],
      hypotheses: [
        {
          id: 'h-pod',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '基础设施核对',
        text: '同一Pod地址和路由存在，NetworkPolicy允许目标，抓包无丢弃/拒绝；仅在临时端口接近占满时connect本地失败。独立新网络命名空间相同路由/策略可连，排除路由/安全组抖动。',
      },
    },
    {
      id: 'a-fixpool',
      name: '开启 keep-alive 连接池',
      desc: '【状态变更】HTTP client 启用连接复用与上限',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '复用共享http.Agent({keepAlive:true,maxSockets:256})并限制请求队列；验证服务端连接复用与超时策略。稳定长连接可降低新建速率与TIME_WAIT，但连接回收仍会产生TIME_WAIT，不保证归零。',
      },
    },
    {
      id: 'a-rollback',
      name: '重启订单服务止血',
      desc: '【状态变更】单重启应用不清TIME_WAIT；换Pod需评估源地址和迁移容量',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '只重启Node进程不会清除同一网络命名空间中的TIME_WAIT。新建Pod若改变源IP/网络命名空间可能临时缓解，但需要容量与流量迁移预算；不能把滚动重启当成直接清空内核状态的证明。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-tw',
      text: '本Pod到固定物流目标显式agent:false，持续短连接主动关闭；约468次成功连接/秒×60秒使同元组临时端口接近28232上限，触发本地EADDRNOTAVAIL',
      correct: true,
    },
    {
      id: 'rc-down',
      text: '物流服务过载拒绝连接',
      correct: false,
    },
    {
      id: 'rc-dns',
      text: 'DNS 解析变慢或失败',
      correct: false,
    },
    {
      id: 'rc-pod',
      text: 'Pod 网络或安全组抖动',
      correct: false,
    },
  ],
  expertCost: 9,
  restartActionId: 'a-rollback',
  expertChain: [
    {
      thought: '先圈定源和固定目标。',
      update: '单Pod到物流失败，源地址存在。',
      actionId: 'a-impact',
      why: '1⚡错误码给方向，不能单独证明端口耗尽。',
      conclusion: '核对同元组状态。',
    },
    {
      thought: '同命名空间统计端口和状态。',
      update: '28080TIME_WAIT+100活动接近28232候选端口。',
      actionId: 'a-netstat',
      why: '2⚡状态数和可用范围必须同口径。',
      conclusion: '端口耗尽成立。',
    },
    {
      thought: '核对客户端配置和抓包。',
      update: 'agent:false，一请求一新连接、主动关闭。',
      actionId: 'a-code',
      why: '2⚡具体版本与观测证明无复用，不靠http.request名称猜测。',
      conclusion: '短连接来源明确。',
    },
    {
      thought: '用成功连接速率核算。',
      update: '468/s×60=28080，失败约3.5%。',
      actionId: 'a-qps',
      why: '1⚡成功数与尝试数分开，不能拿全局3000QPS套单Pod。',
      conclusion: '数量级闭合。',
    },
    {
      thought: '核对失败trace是否抵达对端。',
      update: '本地未发SYN，对端未拒绝。',
      actionId: 'a-down',
      why: '1⚡从连接阶段排除下游过载。',
      conclusion: '排除下游。',
    },
    {
      thought: '核对同trace解析。',
      update: '解析成功且VIP正确。',
      actionId: 'a-dns',
      why: '1⚡明确失败发生在解析之后。',
      conclusion: '排除DNS。',
    },
    {
      thought: '核对地址、策略和路由。',
      update: '源地址存在、无策略丢弃，独立命名空间可连。',
      actionId: 'a-podcheck',
      why: '1⚡单看其他Pod正常或零变更不能证明本Pod网络健康。',
      conclusion: '候选全部排除。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】固定元组端口压力、显式短连接及速率算术吻合，远端拒绝、DNS和路由/地址异常均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '本Pod到固定物流目标显式agent:false，持续短连接主动关闭；约468次成功连接/秒×60秒使同元组临时端口接近28232上限，触发本地EADDRNOTAVAIL',
    },
  ],
  lessons: [
    {
      text: 'EADDRNOTAVAIL可由本地端口耗尽或源地址无效等造成，必须结合地址、元组、connect阶段与端口状态判断。',
      principle: '把源IP、目标IP/端口、命名空间和临时范围放在同一口径；跨目标连接可复用端口，聚合TIME_WAIT总数不直接等于某目标耗尽。',
    },
    {
      text: '本案468成功建连/秒×60秒≈28080，低于28232范围但接近满；485尝试/秒中约3.5%失败是同窗观测。',
      principle: '区分全局QPS、单Pod尝试速率和成功新建连接。TIME_WAIT持续时间是环境实测，不把60秒当所有系统的固定协议常数。',
    },
    {
      text: 'Node有全局Agent，每次http.request不必然建立新TCP；本案显式agent:false并有抓包证据。',
      principle: '客户端默认连接复用行为随版本及SDK而变。使用共享连接池并设置有界队列，验证复用率与服务端关闭策略。',
    },
    {
      text: '重启应用进程不会直接清除内核TIME_WAIT，换Pod源IP的临时效果也不等于根因修复。',
      principle: '先减少新建连接速率，再评估端口、源地址及网络容量；不要用重启结果伪造清空内核状态的机制。',
    },
  ],
}
