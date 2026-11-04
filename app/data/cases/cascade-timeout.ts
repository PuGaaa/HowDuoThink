import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const cascadeCase: DiagnosisCase = {
  id: 'cascade-timeout',
  title: '只占5%的慢调用，为什么拖住整个池',
  intro: '评论查询变慢后，共享线程池饱和，其他业务也超时。源头修好后仍有短暂排队，核对共享资源和恢复曲线。',
  domain: 'runtime',
  layer: '级联雪崩：一个依赖的超时传递为全链路故障——没有熔断、没有背压、超时值形同虚设',
  part: 'engineer',
  chapterId: 'runtime',
  order: 6,
  typeTags: [
    'runtime',
    'architecture',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」的平台工程师。凌晨 2:00 全站不可用，你 5 分钟内定位到了评论服务的慢查询——但修完之后全站仍然不可用。',
    architecture: '网关→商品→订单（共享200工作线程）；其中5%订单调用评论；评论→DB。各层HTTP总等待上限30s，未传播取消，无评论独立并发配额。',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '监控快照',
        text: '订单1000QPS，其中50QPS调用评论；评论DB查询由50ms增至5s。50×5=250个所需并发已超200共享线程，其他订单也排队。各层端到端P99接近30s（含队列），不是四层各顺序等待30s。',
      },
      {
        type: 'text',
        title: '超时配置审计',
        text: '每一层等待上限30s；同一请求的等待时间大多重叠。网关自t0起30s会返回，因此不能把四个30s直接相加成用户120s。缺少隔离与取消让慢调用占满共享池。',
      },
    ],
    timeline: '22:00评论SQL变慢；22:05共享池饱和；22:20 SQL修复并限制重试，新查询回30ms；既有队列在随后6秒逐步消退。',
    impactHint: '评论服务修好了——为什么全站仍然不可用？修好了"根因"不等于恢复了"系统"。',
  },
  hypotheses: [
    {
      id: 'h-cascade',
      text: '慢评论调用无独立并发隔离，持有共享线程并积累排队，故障传播到其他请求',
      excludeActionId: 'a-timeout',
    },
    {
      id: 'h-pool',
      text: '200线程对正常业务本就不够，必须扩到500才可能恢复',
      excludeActionId: 'a-threadpool',
    },
    {
      id: 'h-nomeltdown',
      text: '订单和评论分别发生互不相关的独立故障',
      excludeActionId: 'a-independent',
    },
    {
      id: 'h-gw',
      text: '网关自身资源故障是最初原因，与后端线程池无关',
      excludeActionId: 'a-gw',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '画调用链的故障传播图',
      desc: '评论→订单→商品→网关，每层的响应时间和线程池状态',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '故障传播图',
        text: '评论调用仅占订单1000QPS的5%=50QPS；每次持线程5s，稳定需求约250>共享200，慢调用逐步挤占处理能力，普通请求也排队。\n相同请求trace中网关与内部HTTP的30秒等待重叠，P99不可当成每层可相加的阶段耗时。',
      },
    },
    {
      id: 'a-timeout',
      name: '审计全链路超时配置',
      desc: '每层的超时值、是否合理、是否形同虚设',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-cascade',
      ],
      hypotheses: [
        {
          id: 'h-cascade',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'text',
        title: '超时配置审计',
        text: '调用代码没有评论独立并发额度、队列上限或取消传播；30s等待上限长于体验预算。线程trace显示shared-worker主要等待评论HTTP，其余请求排队。\n同构保持50QPS慢评论输入，给评论独立20并发额度并快速拒绝/按业务允许降级后，普通订单仍可处理。证明共享资源传播；30秒不是0秒，5秒响应也不会被强行等满30秒。',
      },
    },
    {
      id: 'a-threadpool',
      name: '检查订单服务的线程池恢复状态',
      desc: '评论修好了，订单服务的线程池恢复了吗',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-pool',
      ],
      hypotheses: [
        {
          id: 'h-pool',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '线程池状态',
        text: '同样200线程、正常评论30ms时目标负载稳定；无需扩到500。22:20修复并抑制重试后，活动线程200→2秒后40→6秒后8，伴随已在途响应完成和排队清理。\n恢复可由响应、取消或超时释放，不必固定等30秒；若一直不回落需另查残余工作，不能一律称自然衰减。',
      },
    },
    {
      id: 'a-traffic',
      name: '对比故障前后的流量模式',
      desc: '排除流量激增导致',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '流量对比',
        text: '故障前后流量几乎一致（凌晨 2 点，QPS 无异常波动）。\n→ 排除流量激增；故障由评论服务慢查询引发。',
      },
    },
    {
      id: 'a-independent',
      name: '排查评论和订单是否有独立问题',
      desc: '排除"两个同时出事"的可能',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-nomeltdown',
      ],
      hypotheses: [
        {
          id: 'h-nomeltdown',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '独立问题排查',
        text: '订单线程调用栈均关联评论HTTP等待，无独立业务异常；相同版本只隔离/限额评论调用后普通请求恢复，评论变慢之前订单正常。以同trace与受控隔离反证独立故障。',
      },
    },
    {
      id: 'a-gw',
      name: '排查网关自身',
      desc: '排除网关层问题',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-gw',
      ],
      hypotheses: [
        {
          id: 'h-gw',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '网关排查',
        text: '网关独立健康路由与CPU/连接状态正常，失败trace关联后端等待；绕过网关直调订单同样排队，排除网关作为起始故障。',
      },
    },
    {
      id: 'a-emergency',
      name: '紧急扩容订单服务线程池',
      desc: '【状态变更】线程池 200→500 应急扩容，不等超时释放',
      cost: 9,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '应急扩容结果',
        text: '盲扩到500可能让更多慢调用同时占线程并把负载推向下游，不保证恢复。先为非核心评论分配有界并发和队列，按业务允许降级，并停止无预算重试；扩池需同负载验证。',
      },
    },
    {
      id: 'a-fixtimeout',
      name: '全链路超时重配 + 加熔断器',
      desc: '【状态变更】每层超时改为上游 P99×2 + 熔断器（5 次失败自动断路 30s）',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '从体验目标拆剩余预算，分别限制排队、连接与读取；为评论调用设置独立并发配额及快速失败/允许的降级。熔断可减少对持续故障的尝试，但不是唯一方法；阈值与窗口需负载验证。\n同构复放慢评论，检查普通订单吞吐、错误率及评论恢复后的半开/回流，不能承诺连续5次就必然自动保全站。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-cascade',
      text: '50QPS评论调用各持线程5s，需求约250超200共享池；缺少独立配额与有界排队，慢路径挤占普通订单并引发级联，恢复还需清理在途与队列',
      correct: true,
    },
    {
      id: 'rc-pool',
      text: '正常业务200线程本就不够，必须扩到500',
      correct: false,
    },
    {
      id: 'rc-nomeltdown',
      text: '订单与评论发生互不相关的独立故障',
      correct: false,
    },
    {
      id: 'rc-gw',
      text: '网关资源故障是最初原因，与后端无关',
      correct: false,
    },
  ],
  expertCost: 6,
  restartActionId: 'a-fixtimeout',
  expertChain: [
    {
      thought: '核算慢路径对共享池需求。',
      update: '50QPS×5s=250，大于200。',
      actionId: 'a-impact',
      why: '1⚡流量占比不等于资源占比，先算持有时间。',
      conclusion: '核对传播机制。',
    },
    {
      thought: '关联等待栈并隔离慢路径回放。',
      update: '评论无独立配额；隔离后普通订单恢复。',
      actionId: 'a-timeout',
      why: '2⚡受控隔离证明共享资源级联，不靠错误的30×4公式。',
      conclusion: '确认级联。',
    },
    {
      thought: '核对正常容量和恢复曲线。',
      update: '200正常可用，修复后6秒回落。',
      actionId: 'a-threadpool',
      why: '1⚡恢复由完成/取消/超时决定，不必固定30秒。',
      conclusion: '排除必须扩池。',
    },
    {
      thought: '核对订单是否独立异常。',
      update: '相同版本隔离评论即恢复。',
      actionId: 'a-independent',
      why: '1⚡关联trace与干预反证两个独立故障。',
      conclusion: '排除独立故障。',
    },
    {
      thought: '绕开网关复验。',
      update: '订单仍排队，网关独立健康。',
      actionId: 'a-gw',
      why: '1⚡实际绕行反证起始网关故障。',
      conclusion: '候选全部收敛。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】共享线程持有量及隔离对照成立，正常池不足、独立故障和网关起因均排除；恢复曲线说明残留排队而非固定等待。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '50QPS评论调用各持线程5s，需求约250超200共享池；缺少独立配额与有界排队，慢路径挤占普通订单并引发级联，恢复还需清理在途与队列',
    },
  ],
  lessons: [
    {
      text: '嵌套调用的超时通常在同一时间线上重叠，不能把四层30秒相加成120秒；P99也不是可相加的阶段耗时。',
      principle: '传播剩余预算并留回传余量，限制排队和重试。统一30秒不是无限等待，但可能不符合体验目标或共享池预算。',
    },
    {
      text: '源头修复后，已在途工作和队列可能需要消退；释放依赖完成、取消或超时，不必然固定30秒。',
      principle: '观察当前活动、排队、完成率和错误率。若未恢复不能仅凭“等超时”解释，应确认是否还有残余慢调用和持续重试。',
    },
    {
      text: '少数慢调用可通过共享资源影响多数业务；并发配额、队列上限、背压、取消和熔断均有各自作用。',
      principle: '熔断不是唯一解药，也不自动保证降级业务正确。先明确评论可否缺省及独立预算，再在相同慢调用负载下验证其他业务。',
    },
  ],
}
