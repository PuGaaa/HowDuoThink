import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const containerReviewCase: DiagnosisCase = {
  id: 'container-review',
  title: '容器治理评审——一刀切的限额与失明的扩容',
  intro: '17个服务拟统一requests/limits与CPU扩容目标。核对峰值画像、HPA分母和探针语义，再决定能否直接全量推行。',
  domain: 'runtime',
  layer: '统一治理前按目标负载验证资源参数，并区分request、limit和HPA指标口径',
  part: 'engineer',
  chapterId: 'runtime',
  order: 5,
  typeTags: [
    'runtime',
    'architecture',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」的架构评审委员。运维团队的"统一治理"方案有它的道理（管理成本真的高）——但 17 个服务里，有的需要 4C，有的 500M 就够。',
    architecture: '草案：17服务均CPU request=limit=2核、memory request=limit=4Gi；HPA CPU averageUtilization目标70%；readiness周期30s。',
    tag: '评审现场',
    symptoms: [
      {
        type: 'error',
        title: '方案文档 · 关键句',
        text: '① request/limit均2CPU和4Gi；② HPA按CPU usage/request目标70%；③ readiness每30秒检查。方案尚未发布，以下风险是评审推演。',
      },
      {
        type: 'text',
        title: '评审输入 · 资源画像抽样',
        text: '本题给定画像：单线程网关峰值1CPU；报表稳态3.2Gi、完整大报表峰值4.8Gi；商品服务目标吞吐需3.5CPU，内存1.8Gi；静态内容服务5个，各约200Mi。',
      },
      {
        type: 'log',
        title: '镜像扫描附件告警',
        text: '[WARN] image scan report upload retry；治理评审输入中夹有此条。',
      },
    ],
    timeline: '17 个服务资源画像从未系统采集 ｜ 上季度事件循环阻塞事故（event-loop lag 监控已上线）｜ HPA 上线至今从未触发过扩容',
    impactHint: '"统一 2C4G"对三个抽样服务各意味着什么？——每一个都是一场未来事故的名字。',
  },
  hypotheses: [
    {
      id: 'h-uniform',
      text: '统一参数忽略已测需求：商品需3.5CPU且报表峰值4.8Gi，2CPU/4Gi无法满足既定负载',
      excludeActionId: 'a-profile',
    },
    {
      id: 'h-hpa',
      text: 'HPA的CPU70%自动按容器limit或宿主4核平均计算，与requests无关',
      excludeActionId: 'a-hpa',
    },
    {
      id: 'h-probe',
      text: 'readiness失败会直接重启容器，所以30秒就绪探针必然误杀慢启动',
      excludeActionId: 'a-probe',
    },
    {
      id: 'h-oom',
      text: '现有4Gi统一配置已造成90天大面积OOM，可直接作为本次发布的历史事实',
      excludeActionId: 'a-oomhist',
    },
  ],
  actions: [
    {
      id: 'a-uniform',
      name: '确认治理范围和发布状态',
      desc: '影响面：资源参数、扩容指标和17服务的负载约束',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-uniform',
      ],
      hypotheses: [],
      result: {
        type: 'text',
        title: '评审追问记录',
        text: '草案同时统一资源request/limit和扩缩容目标；管理成本下降是动机，但需要逐服务验证目标负载。当前方案未发布，不能把评审预测写成已发生事故。\n噪声收线：扫描报告附件上传不改变已给出的request/limit、峰值画像或HPA配置；当前方案未发布，不能把附件重试当运行事故。',
      },
    },
    {
      id: 'a-profile',
      name: '采集 17 个服务的资源画像',
      desc: '用历史监控数据画资源分布',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-uniform',
      ],
      hypotheses: [
        {
          id: 'h-uniform',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'text',
        title: '资源画像（17 服务抽样 5 类）',
        text: '给定峰值：商品达到目标吞吐需3.5CPU，统一2CPU会限制可用CPU；报表完整任务峰值4.8Gi>4Gi，有超限风险。网关只有1CPU的主线程，2CPU并不因“单核敏感”就必然不够。\n稳态3.2Gi本身也不能证明4Gi必然OOM；决定性证据是已给出的完整任务峰值4.8Gi。',
      },
    },
    {
      id: 'a-hpa',
      name: '审查 HPA 的扩容指标',
      desc: 'CPU 均值 70% 对事件循环服务意味着什么',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-hpa',
      ],
      hypotheses: [
        {
          id: 'h-hpa',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'HPA 指标审查',
        text: 'HPA averageUtilization相对CPU request，不是limit或宿主均核。草案request=2CPU，网关使用1CPU时为50%，低于70%；若request=.5CPU则同样使用量为200%。\n所以不能说CPU指标永远看不见单线程或永不扩容。可以结合event-loop lag/队列指标，但横向扩容也不自动消除单请求同步阻塞。',
      },
    },
    {
      id: 'a-oomhist',
      name: '核对历史 OOMKill 记录',
      desc: '4Gi 限额下有没有 OOM 前科',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-oom',
      ],
      hypotheses: [
        {
          id: 'h-oom',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: 'OOMKill 历史',
        text: '现网未采用统一方案，90天OOM记录0；不能当作统一4Gi已引发事故的历史。未来风险来自报表峰值4.8Gi的给定约束，需在同构限额演练中确认，而非把预测写成历史。',
      },
    },
    {
      id: 'a-probe',
      name: '评估统一探针参数',
      desc: '30s 间隔对启动慢的服务意味着什么',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-probe',
      ],
      hypotheses: [
        {
          id: 'h-probe',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '探针评估',
        text: 'readiness失败只标记不就绪并移出就绪端点，不直接重启；liveness/startup达到失败阈值才可能触发重启。30秒检查周期影响流量摘除发现时延，需要按业务恢复目标评估，不能说启动<5秒就一定合适。',
      },
    },
    {
      id: 'a-waste',
      name: '算一笔资源浪费账',
      desc: '统一限额的隐性成本',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '浪费账',
        text: '仅核算5个静态服务：每个4Gi request−200Mi实际≈3.8047Gi，合计约19.02Gi名义request余量。limit不是立即预留内存；本草案request也为4Gi才有调度预留影响。\n没有其他12个完整数据，不能声称17服务共浪费40Gi，更不能直接等同云账单金额。',
      },
    },
    {
      id: 'a-minspec',
      name: '开出最小修正清单',
      desc: '按画像分级 + 指标修正',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '评审结论 · 修正清单',
        text: '按目标负载画像制定request/limit并验证峰值与突发余量；HPA注明指标及分母，评估队列/延迟等信号；分别设计readiness、liveness、startup的作用和窗口。\n治理框架可统一，参数是否分档由实测支持，不要求机械凑五类。',
      },
    },
    {
      id: 'a-golive',
      name: '按原方案全量推行统一限额',
      desc: '【状态变更】不等画像采集，全量 2C4G',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '推行结果',
        text: '按原稿直接全量推行违反已给出的商品与报表负载约束，具有节流/超限风险；方案未发布，没有依据声称已发生两次OOM和五次投诉。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-uniform',
      text: '统一2CPU/4Gi与给定商品3.5CPU、报表峰值4.8Gi需求冲突；治理参数缺少逐服务目标负载验证，当前不宜直接全量生效',
      correct: true,
    },
    {
      id: 'rc-hpa',
      text: 'HPA CPU利用率与requests无关，永远只按limit/宿主核数平均',
      correct: false,
    },
    {
      id: 'rc-probe',
      text: 'readiness失败直接重启容器并误杀慢启动',
      correct: false,
    },
    {
      id: 'rc-oom',
      text: '未发布的统一方案已造成90天大面积OOM',
      correct: false,
    },
  ],
  expertCost: 7,
  restartActionId: 'a-golive',
  expertChain: [
    {
      thought: '确认草案参数和发布范围。',
      update: 'request/limit同时统一，方案尚未发布。',
      actionId: 'a-uniform',
      why: '1⚡分开未发生的风险与历史事实。',
      conclusion: '核对负载约束。',
    },
    {
      thought: '按完整峰值而非稳态判断。',
      update: '3.5CPU>2，4.8Gi>4。',
      actionId: 'a-profile',
      why: '2⚡两项明确负载需求足以阻断直接统一推行。',
      conclusion: '确认参数与需求冲突。',
    },
    {
      thought: '复算HPA的CPU分母。',
      update: '1CPU/request2CPU=50%。',
      actionId: 'a-hpa',
      why: '2⚡必须使用requests，不能把宿主平均数直接套HPA。',
      conclusion: '排除错误扩容语义。',
    },
    {
      thought: '核对探针行为。',
      update: 'readiness不直接重启。',
      actionId: 'a-probe',
      why: '1⚡探针语义不同，30秒不能同时代表所有行为。',
      conclusion: '排除误杀命题。',
    },
    {
      thought: '核对历史与发布状态。',
      update: '统一方案未发布、既有OOM为0。',
      actionId: 'a-oomhist',
      why: '1⚡预测超限风险不能伪装成历史事故证据。',
      conclusion: '候选全部收敛。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】目标负载与统一参数冲突成立，HPA分母、readiness重启和未发布历史事故三个解释均排除。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '统一2CPU/4Gi与给定商品3.5CPU、报表峰值4.8Gi需求冲突；治理参数缺少逐服务目标负载验证，当前不宜直接全量生效',
    },
  ],
  lessons: [
    {
      text: '资源治理先把目标负载、峰值和余量写清楚；3.2Gi稳态不证明4Gi必然不够，4.8Gi完整任务峰值才构成风险证据。',
      principle: 'CPU limit可能节流，内存limit是上限，request用于调度预留。容量、保留资源和账单金额不是同一个指标。',
    },
    {
      text: 'HPA CPU利用率通常相对requests，单核使用1CPU在request2CPU时为50%，request0.5CPU时为200%。',
      principle: '准确记录指标类型与分母。自定义lag或队列指标可补信号，但扩容不自动修复单请求同步CPU阻塞。',
    },
    {
      text: 'readiness影响就绪和流量路由，liveness与startup才承担各自的重启判断。',
      principle: '按摘流时延、启动窗口和故障恢复目标设置周期/阈值，不能用一个30秒参数解释全部探针行为。',
    },
    {
      text: '预测风险、历史事实和资源余量要分开。5个静态服务的名义request余量约19.02Gi，不代表17服务账单浪费40Gi。',
      principle: '每个数字注明范围、单位及分母。评审以已给负载证据决定阻断，不用虚构上线后投诉支持结论。',
    },
  ],
}
