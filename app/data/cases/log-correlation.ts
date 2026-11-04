import { DiagnosisCase } from '../../types/case'

/**
 * 读懂报错：主训全栈视野；次训验证思维；排查现场。
 * 原型：请求上下文、实例资源关联与JVM暂停，教学重建。
 * 六维：2/2/2/2/2/2，L2；配置WARN由retrycount按请求ID收线。
 * 标准：impact(1) → tzcheck(1) → correlate(2) = 4；替代：impact → correlate → tzcheck = 4。
 * 技术依据与独立编审见 content/baselines/t04a-calibration.md。
 */
export const logCorrelationCase: DiagnosisCase = {
  id: 'log-correlation',
  title: '日志各说各话：同一次下单去了哪台实例',
  intro: '三段日志时间相近，却未必属于同一请求。先用关联键找到目标实例，再核对那台实例发生了什么。',
  domain: 'runtime',
  layer: '关联 ID 是分布式日志的毛细血管——透传到哪，因果就通到哪',
  part: 'apprentice',
  chapterId: 'error-reading',
  order: 3,
  typeTags: [
    'observability',
    'process',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」的新任值班工程师，需要把一次失败下单的跨服务证据对齐。',
    architecture: '网关生成requestId → A订单 → B优惠券 → C库存实例池；A/B输出关联ID，C业务日志未输出',
    tag: '教学重建',
    symptoms: [
      {
        type: 'error',
        title: '失败截图中的两段日志',
        text: 'A 10:00:06.280 B调用失败：HTTP 504\nB 10:00:06.250 C调用read timeout\nC业务日志搜索“下单失败”零命中。时间接近还不足以证明它们属于同一次请求。',
      },
      {
        type: 'log',
        title: '混在附近的WARN',
        text: 'A 10:00:06.260 promo-config refresh delayed requestId=req-other-18\n它与下单失败是否有关，需要按请求身份核对。',
      },
    ],
    timeline: '晚高峰部分下单失败 ｜ A/B有requestId ｜ C业务日志有时间和实例名，但未接入requestId模板',
    impactHint: '先找关联键和目标实例。相同时间、同一台机器上的告警，也可能属于别的请求。',
  },
  hypotheses: [
    {
      id: 'h-chain',
      text: 'C业务日志缺关联ID，目标实例暂停造成超时，但排查因断链难以拼接',
      excludeActionId: 'a-correlate',
    },
    {
      id: 'h-tz',
      text: '三服务时钟明显错位，时间线比较不成立',
      excludeActionId: 'a-tzcheck',
    },
    {
      id: 'h-level',
      text: 'C把业务日志级别误设为ERROR，导致关联信息全被过滤',
      excludeActionId: 'a-loglevel',
    },
    {
      id: 'h-retry',
      text: 'A重试产生多份同参数调用，人肉搜索串到别的请求',
      excludeActionId: 'a-retrycount',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '盘点三段日志的"关联键"存量',
      desc: '影响面：哪些服务打了 requestId、哪些没打',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [
        {
          id: 'h-level',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '关联信息盘点',
        text: '网关生成req-7712a；A/B业务日志包含该ID。\nB的出口日志另记录目标实例c-7；C的INFO业务日志存在，包含实例名但未输出requestId。\n失败样本均到c-7，相同版本的c-8对照请求正常。需要核对时间与c-7实例事件。',
      },
    },
    {
      id: 'a-correlate',
      name: '关联请求、目标实例与暂停窗口',
      desc: '按ID找到出口，再对照具体实例的GC',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-chain',
        'h-retry',
      ],
      hypotheses: [
        {
          id: 'h-chain',
          status: 'confirmed',
        },
        {
          id: 'h-retry',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: 'req-7712a与c-7对账',
        text: 'A 10:00:01.200发起B，读取超时8秒。\nB 10:00:01.250向c-7发起一次调用，客户端明确配置读取超时5秒，无重试。\nC入口访问记录：req-7712a于01.255进入c-7，09.090处理完成，调用方已超时；入口记录独立于缺ID的业务日志。\nc-7同进程GC日志汇总：10:00:01.270开始Stop-The-World，10:00:09.070结束，暂停7.8秒。\nB 10:00:06.250到达5秒期限，返回HTTP 504；A在06.280收到504，尚未到自己的8秒期限。\n目标实例、暂停覆盖的等待窗口和超时配置一致；c-8同类对照请求正常。不是用邻近机器的GC曲线猜因果。',
      },
    },
    {
      id: 'a-tzcheck',
      name: '核对时区与时钟偏差',
      desc: '统一时间表示，并检查实际对时误差',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-tz',
      ],
      hypotheses: [
        {
          id: 'h-tz',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '时间可信度',
        text: 'A/B/C日志都输出UTC+8，故障时NTP偏差均小于20毫秒；GC时间来自同一c-7进程。\n时区一致不等于时钟一致，这里两项都已核对；毫秒级误差无法解释秒级等待与暂停。',
      },
    },
    {
      id: 'a-loglevel',
      name: '核对 C 服务的日志级别策略',
      desc: '评估"成功无日志"的影响',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-level',
      ],
      hypotheses: [
        {
          id: 'h-level',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '日志模板核对',
        text: 'C业务日志级别为INFO，正常业务记录存在；模板只有时间、实例和消息，没有%X{requestId}，拦截器也未填MDC。\n缺的是关联字段，不是被ERROR阈值过滤。',
      },
    },
    {
      id: 'a-retrycount',
      name: '核对 A 的重试配置',
      desc: '排除重试串线',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-retry',
      ],
      hypotheses: [
        {
          id: 'h-retry',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '请求分组与噪声收线',
        text: 'A→B、B→C均只调用一次，同一requestId没有重试分支。\npromo-config的WARN属于req-other-18，不是req-7712a，排除该红鲱鱼。',
      },
    },
    {
      id: 'a-danger',
      name: '重启三服务并清空本地日志',
      desc: '【状态变更】先清现场，赌重启解决关联困难',
      cost: 8,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重启演练记录',
        text: '重启不会自动给C日志补上requestId；清除本地日志还会破坏GC与调用窗口的现场。\n本题仍按原始快照排查，重启不构成关联证据。',
      },
    },
    {
      id: 'a-fixmdc',
      name: '修复：C 服务补 requestId（MDC 透传）',
      desc: '【状态变更】入口填MDC、日志输出，出口继续透传，结束时清理',
      cost: 1,
      gain: 'none',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '关联修复',
        text: 'C入口接收X-Request-Id并写入MDC，日志模板输出该字段；调用下游时继续透传，请求结束清理上下文。\n线程池或异步边界需要显式传播上下文，不能假设MDC自动跟随。',
      },
    },
    {
      id: 'a-fixspread',
      name: '沉淀：关联键规范',
      desc: '【状态变更】规范：网关生成 → 头透传 → MDC 落日志；新服务接入 checklist 必查项',
      cost: 1,
      gain: 'none',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '关联契约',
        text: '网关生成ID，每一跳透传；业务日志同时携带请求身份与实例身份。\n检查跨线程上下文传递及请求结束清理，避免下一个请求串用旧ID。',
      },
    },
    {
      id: 'a-fixgc',
      name: '处置：关联修复与GC治理分工',
      desc: '【状态变更】校验容量后止血，再分析c-7暂停原因',
      cost: 1,
      gain: 'none',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '处置边界',
        text: '补齐关联ID提升排查能力，不会消除GC暂停。\n另由值班负责人校验剩余容量后处理异常实例，并分析堆、分配和GC证据。不能因为日志现在能串联，就宣布下单业务已恢复。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-chain',
      text: 'C业务日志缺关联ID造成排查断链；B出口锁定c-7，7.8秒STW覆盖5秒读取期限，B返回504给A',
      correct: true,
    },
    {
      id: 'rc-tz',
      text: '明显时钟错位造成假时间线',
      correct: false,
    },
    {
      id: 'rc-level',
      text: 'C日志级别误设ERROR，正常业务日志被过滤',
      correct: false,
    },
    {
      id: 'rc-retry',
      text: '重试生成重复调用导致搜索串线',
      correct: false,
    },
  ],
  expertCost: 4,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '先找请求身份和目标实例。',
      update: 'A/B有ID，B出口指向c-7，C业务日志缺ID。',
      actionId: 'a-impact',
      why: '1⚡先找到连接请求与实例的键，避免把相邻日志强行拼成一个故事。',
      conclusion: '需要对时并核对c-7事件。',
    },
    {
      thought: '时区一致且对时误差小于20毫秒。',
      update: '秒级暂停与等待窗口可以比较。',
      actionId: 'a-tzcheck',
      why: '1⚡先检验时间地基，统一时区还不够，实际时钟偏差也要有证据。',
      conclusion: '排除明显时钟错位。',
    },
    {
      thought: '同一ID的B出口指向c-7，7.8秒暂停覆盖5秒等待，A收到的是B的504。',
      update: '请求、实例、暂停与期限闭合；不是A自己的8秒读取超时。',
      actionId: 'a-correlate',
      why: '2⚡联合出口路由、具体实例日志和明确超时配置，才把时间相关升级为机制解释。',
      conclusion: '定位C暂停与业务日志断链两个问题。',
    },
    {
      thought: '已经知道请求去哪、在那里发生什么、为何到期。',
      update: '停止收集，分别处理业务暂停与关联缺口。',
      actionId: '',
      why: '继续混搜其他请求不会改变当前处置；身份、实例和时间窗口已经闭合。',
      conclusion: '补关联不能替代GC治理；按证据分工处理，不宣称日志修好就等于业务恢复。',
    },
  ],
  lessons: [
    {
      text: '关联请求靠身份，关联主机指标还要有目标实例；相近时间只能提供候选。',
      principle: '请求ID连接分布式调用，实例或容器身份连接资源事件。缺少其中一层时，别把别台机器的GC曲线当成当前请求的原因。',
    },
    {
      text: '对时要同时检查时间表示和实际偏差；超时要说明是哪一跳的期限。',
      principle: '同为UTC+8不保证时钟一致。下游5秒超时产生504，与上游8秒自行超时是不同事件，必须用起止时间对账。',
    },
    {
      text: 'MDC是线程上下文，不会自动跨异步边界；日志关联修复也不会消除业务暂停。',
      principle: '每跳和每个线程边界都需要正确传播、输出并清理上下文。可观测性缺陷与业务故障要分开处置，不能用补日志代替恢复服务。',
    },
  ],
}
