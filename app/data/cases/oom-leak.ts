import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const oomLeakCase: DiagnosisCase = {
  id: 'oom-leak',
  title: '服务每 36 小时准时死一次',
  intro: '订单查询服务每隔一天半左右就被重启一次，K8s 记录 OOMKilled。重启后一切正常，然后开始新一轮倒计时。',
  domain: 'runtime',
  layer: '内存与连接是有生命周期的资源——无界容器就是慢性泄漏',
  part: 'engineer',
  chapterId: 'runtime',
  order: 1,
  typeTags: [
    'resource',
    'capacity',
    'code',
  ],
  difficulty: 2,
  scene: {
    role: '你是订单查询服务的负责人。运维第三次在群里 @你：你们服务又 OOM 重启了，集市查询超时了 40 秒。',
    architecture: 'K8s Pod(内存限额 2Gi) → 订单查询服务(Node.js 18) → 订单库 MySQL',
    symptoms: [
      {
        type: 'error',
        title: 'K8s Pod 事件',
        text: 'Last State: Terminated\n  Reason:   OOMKilled\n  Exit Code: 137\n  Restart Count: 6（近 9 天）',
      },
      {
        type: 'text',
        title: '用户与监控',
        text: '每次重启前 1~2 分钟，查询接口批量超时；重启后立即恢复。\n服务 CPU 全程平稳（<30%），重启不挑时间——深夜也会被杀。',
      },
      {
        type: 'log',
        title: '图片对象告警',
        text: '[WARN] order proof image 404；重启前日志中混有此条。',
      },
    ],
    timeline: '近9天第6次重启，间隔34~38小时；一个月前提速优化引入缓存，当前镜像随后未变；限额2Gi未改。',
    impactHint: '"重启后恢复"说明进程状态里有东西在长大——它是什么，从哪来的？',
  },
  hypotheses: [
    {
      id: 'h-cache',
      text: '进程内缓存无上限，条目只进不出，慢慢撑爆限额',
      excludeActionId: 'a-heapsnap',
    },
    {
      id: 'h-listener',
      text: '事件监听器/闭包被重复注册，对象无法回收',
      excludeActionId: 'a-listenercheck',
    },
    {
      id: 'h-traffic',
      text: '流量自然增长，内存水位随之上涨',
      excludeActionId: 'a-qps',
    },
    {
      id: 'h-limit',
      text: '容器内存限额配置过低，正常业务本就不够用',
      excludeActionId: 'a-limitcfg',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '圈定重启规律与影响面',
      desc: '是所有服务还是这一个；重启间隔有没有规律',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [
        {
          id: 'h-traffic',
          status: 'down',
        },
      ],
      result: {
        type: 'text',
        title: '重启规律',
        text: '同节点同规格的其他服务全部安好，只有订单查询服务在死。\n间隔稳定在 34~38 小时，与流量高峰（午晚高峰）无关——深夜低峰也照杀不误。\n→ 不是全局问题，是这一个进程"自己长大"。',
      },
    },
    {
      id: 'a-k8sevent',
      name: '查退出码与容器事件',
      desc: '区分"进程自己崩"还是"被内核杀"',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: 'kubectl describe pod',
        text: '终止Reason=OOMKilled、ExitCode137，cgroup memory.events中oom_kill递增，内存触及2Gi；三者共同确认本次内存限额杀进程。137只代表SIGKILL，单独不能排除人工kill等原因。\n重启起始约400Mi，但这个起点本身不能证明峰值容量一定足够。',
      },
    },
    {
      id: 'a-rsscurve',
      name: '看 72 小时内存曲线形态',
      desc: '爬升形态：是峰谷起伏还是只涨不跌',
      cost: 1,
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
        type: 'text',
        title: '内存曲线（Prometheus container_memory_rss）',
        text: 'RSS从400Mi以约45Mi/小时增长，(2048-400)/45≈36.6小时接近重启周期。低峰仍增长，且相同QPS下完整GC后的heapUsed基线也持续增加；三周QPS无持续增长。\n持续保留对象是线索，RSS单调并非单独证明泄漏，分配器高水位和合法缓存也需区分。',
      },
    },
    {
      id: 'a-heapsnap',
      name: '间隔 1 小时采两份堆快照对比',
      desc: '看哪类对象在增长、被谁持有',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-cache',
        'h-listener',
      ],
      hypotheses: [
        {
          id: 'h-cache',
          status: 'confirmed',
        },
        {
          id: 'h-listener',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '堆快照 Diff（t1 → t1+1h）',
        text: '相隔1小时的同负载快照：orderCache条目800000→880000；Map结构约+6Mi，持有订单字符串约+39Mi，总约45Mi，与曲线同量级。\nRetainer为模块顶层Map；Timers/Listeners计数及保留体积稳定，排除监听器持续注册。\n噪声收线：404计数没有随堆增长，图片请求对象未在增长retainer中；增长由orderCache持有的订单数据解释，图像对象不是该引用链。',
      },
    },
    {
      id: 'a-listenercheck',
      name: '查事件监听器注册情况',
      desc: '排除监听器重复注册导致闭包堆积',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-listener',
      ],
      hypotheses: [
        {
          id: 'h-listener',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '监听器数量',
        text: 'emitter.listenerCount() 各事件名稳定，启动以来无新增；快照里 Timers/Listeners 也没有增长。\n→ 不是监听器泄漏。',
      },
    },
    {
      id: 'a-qps',
      name: '查三周流量曲线',
      desc: '对比流量增长与内存增长的斜率',
      cost: 1,
      gain: 'mid',
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
        type: 'text',
        title: '流量 vs 内存',
        text: '三周 QPS 波动 ±10%，基本平坦；内存却从 400Mi 线性爬到 2Gi。\n流量没涨，内存涨了 5 倍——两者不相关。',
      },
    },
    {
      id: 'a-limitcfg',
      name: '查限额配置变更历史',
      desc: '确认 2Gi 限额是不是最近调低的',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-limit',
      ],
      hypotheses: [
        {
          id: 'h-limit',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '限额历史',
        text: '限额2Gi未变只是背景，不能靠兄弟服务稳定证明本服务够用。相同本服务负载在有界缓存对照中稳定600~800Mi，才是排除固定正常容量不足的依据。',
      },
    },
    {
      id: 'a-coderead',
      name: '读 orderCache 实现代码',
      desc: '看缓存的写入、容量控制与淘汰逻辑',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-cache',
        'h-limit',
      ],
      hypotheses: [
        {
          id: 'h-cache',
          status: 'confirmed',
        },
        {
          id: 'h-limit',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: 'cache.js（一个月前"查询提速"优化引入）',
        text: 'const orderCache = new Map();\nexport async function getOrder(id) {\n if (orderCache.has(id)) return orderCache.get(id);\n const order = await db.query(...);\n orderCache.set(id, order); return order;\n}\n无条目上限/淘汰；持续出现不同id时保留量增长。教学同构对照在相同输入、相同2Gi限额下将缓存限定为预算内，完整业务负载内存稳定600~800Mi，排除“正常业务固定就需超过2Gi”。',
      },
    },
    {
      id: 'a-restartnow',
      name: '手动重启服务止血',
      desc: '【状态变更】立即 kubectl rollout restart 释放内存',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '止血结果',
        text: '受控重启后内存回到约400Mi而不是归零；若输入与实现不变，预计仍会累积。该动作恢复服务但会丢现场，不能单独证明Map就是根因。',
      },
    },
    {
      id: 'a-fixcache',
      name: '给缓存加上限与 TTL 并发版',
      desc: '【状态变更】LRU 容量 10 万条 + TTL 30 分钟，灰度发布',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: 'lru-cache 替换裸 Map：max 100000、ttl 30min，命中场景不变。\n灰度 72h：内存呈健康锯齿（白天缓涨、夜间回落），稳定在 600~800Mi。\n连续 7 天零重启。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-cache',
      text: '一个月前"提速"优化引入的进程内订单缓存（裸 Map）无上限、无 TTL，条目只进不出，约 36 小时撑爆 2Gi 限额被内核 OOMKilled',
      correct: true,
    },
    {
      id: 'rc-listener',
      text: '事件监听器重复注册，闭包堆积导致对象无法回收',
      correct: false,
    },
    {
      id: 'rc-traffic',
      text: '业务流量增长，内存水位自然上涨',
      correct: false,
    },
    {
      id: 'rc-limit',
      text: '容器内存限额配置过低，正常业务本就不够用',
      correct: false,
    },
  ],
  expertCost: 7,
  restartActionId: 'a-fixcache',
  expertChain: [
    {
      thought: '确定单服务重启的周期。',
      update: '34~38小时，和峰值时间无固定对应。',
      actionId: 'a-impact',
      why: '1⚡周期提示累积状态，但不直接排除全部平台故障。',
      conclusion: '核实终止原因。',
    },
    {
      thought: '联合终止原因和cgroup记录。',
      update: '本次是内存限额OOM，非仅凭137。',
      actionId: 'a-k8sevent',
      why: '1⚡同一退出码可能多因，必须看Reason和内存事件。',
      conclusion: '核对内存基线。',
    },
    {
      thought: '比较RSS、GC后heap与QPS。',
      update: '约45Mi/小时保留增长，约36.6小时耗尽。',
      actionId: 'a-rsscurve',
      why: '1⚡统一Mi单位，且用GC后基线区分仅RSS高水位。',
      conclusion: '排除持续流量增长。',
    },
    {
      thought: '比较retainer和监听器计数。',
      update: 'Map与字符串增长45Mi，监听器稳定。',
      actionId: 'a-heapsnap',
      why: '2⚡增长量与周期可对账，引用链指出持有者。',
      conclusion: '确认缓存并排除监听器。',
    },
    {
      thought: '核对无界实现和同负载有界对照。',
      update: '无淘汰；同2Gi限定缓存时业务稳定。',
      actionId: 'a-coderead',
      why: '2⚡代码说明机制，同负载对照反证正常业务必须超限。',
      conclusion: '全部候选收敛。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】OOM事件、保留量增长和无界Map因果吻合，流量、监听器与固定正常容量不足均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '一个月前"提速"优化引入的进程内订单缓存（裸 Map）无上限、无 TTL，条目只进不出，约 36 小时撑爆 2Gi 限额被内核 OOMKilled',
    },
  ],
  lessons: [
    {
      text: '137是SIGKILL的常见退出码，结合OOMKilled、cgroup事件及内存曲线才能确认本次内存限额杀进程。',
      principle: '先区分容器OOM、节点压力驱逐及其他kill来源；不要仅凭退出码推导唯一死因。',
    },
    {
      text: 'RSS持续增加是线索，完整GC后堆基线与retainer增长才支持不可回收对象的定位。',
      principle: '合法缓存、分配器高水位及堆外占用也会增加RSS。快照要关联持续持有者和输入基数，不能只看曲线形状判病。',
    },
    {
      text: '本案不同订单id持续写无界Map，未淘汰的保留量约45Mi/小时；容量边界是修复重点。',
      principle: '不必给所有缓存无条件同时加TTL和LRU；按空间预算、数据时效选择容量上限和失效机制。有限键集也不一定无限增长，结论须依赖本案输入。',
    },
    {
      text: '重启可临时恢复，但不足以证明缓存就是根因；还需引用链和同负载对照。',
      principle: '止血与修复分开记录。堆快照采集本身有暂停与额外内存开销，选择副本和窗口，避免在极限水位盲采。',
    },
  ],
}
