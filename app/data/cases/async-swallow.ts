import { DiagnosisCase } from '../../types/case'

/**
 * 读懂报错：主训程序设计；次训验证思维；排查现场。
 * 原型：JDK17 submit/FutureTask异常保存与业务终态，教学重建。
 * 六维：2/2/2/2/1/2，L2；OSS慢告警由osslog按taskId收线。
 * 标准：impact(1) → taskaudit(2) → osslog(1) = 4；替代：impact → osslog → taskaudit = 4。
 * 技术依据与独立编审见 content/baselines/t04a-calibration.md。
 */
export const asyncSwallowCase: DiagnosisCase = {
  id: 'async-swallow',
  contentRevision: 2,
  sourceType: 'official',
  sourceCommit: '6523490',
  sourceHash: '86f6b3819081aef491d0d27dda3778eaf39c044872bea44abf0f9756ac321f01',
  title: '报表永远生成中：Future里保存了什么',
  intro: '部分异步报表没有终态。任务异常可能被Future保存，线程仍健康；先查谁负责观察结果和写入失败状态。',
  domain: 'runtime',
  layer: 'submit把任务异常保存到Future；必须明确异常观察和业务失败终态的责任',
  part: 'apprentice',
  chapterId: 'error-reading',
  order: 4,
  typeTags: [
    'resource',
    'data',
    'observability',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」报表平台的值班工程师，需要定位永久生成中的任务。',
    architecture: '请求建任务GENERATING → JDK17 ExecutorService.submit(render→upload→markDone)；实现缺markFailed路径',
    tag: '教学重建',
    symptoms: [
      {
        type: 'error',
        title: '永久生成中的任务',
        text: '5%的任务没有完成或失败终态；搜索“导出失败”没有业务错误日志。\n任务提交记录可查，但render()之后才写第一条业务日志。',
      },
      {
        type: 'log',
        title: '附近的一条OSS告警',
        text: '[WARN] upload slow taskId=SUCCESS-9 duration=2100ms\n还不能确认这条告警属于永久生成中的任务。',
      },
    ],
    timeline: '导出改为submit异步两周 ｜ 成功任务95%有后续业务日志 ｜ 失败样本输入包含未初始化的模板配置',
    impactHint: '没有失败日志不代表没有执行。先核对任务生命周期，再找异步结果由谁观察。',
  },
  hypotheses: [
    {
      id: 'h-swallow',
      text: 'render异常被Future保存，但无人读取，任务又没有写失败终态',
      excludeActionId: 'a-taskaudit',
    },
    {
      id: 'h-oss',
      text: '报表已生成并上传成功，只是完成通知或状态更新丢失',
      excludeActionId: 'a-osslog',
    },
    {
      id: 'h-oom',
      text: '进程被内核OOM killer杀死，在途任务丢失',
      excludeActionId: 'a-threadstate',
    },
    {
      id: 'h-queue',
      text: '任务仍在排队，还没有执行',
      excludeActionId: 'a-queuestate',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '给"消失"画坐标',
      desc: '影响面：消失发生在生命周期的哪一段',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '生命周期盘点',
        text: '受影响taskId均已提交；GENERATING由请求线程写入，后续没有终态。\n第一条业务日志在render()返回之后，失败样本连这条都没有。\n因此生成阶段提前退出值得优先检查，但“没日志”本身不能证明没执行。',
      },
    },
    {
      id: 'a-taskaudit',
      name: '审计submit与同输入诊断重放',
      desc: '保留Future，观察get()的异常与工作线程',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-swallow',
        'h-queue',
        'h-oom',
      ],
      hypotheses: [
        {
          id: 'h-swallow',
          status: 'confirmed',
        },
        {
          id: 'h-queue',
          status: 'excluded',
        },
        {
          id: 'h-oom',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '代码与诊断重放',
        text: '代码：executor.submit(() -> { render(); uploadOss(); markDone(); }); 返回Future被丢弃，无任务失败记录分支。\n同版本同失败输入重放并保留Future：get()抛ExecutionException，cause为render()内的NullPointerException，发生在uploadOss之前。\nFuture已完成为异常；工作线程继续执行下一任务。即使安装UncaughtExceptionHandler，本次计数仍为0。\nsubmit使用FutureTask保存异常，异常没有逃出工作线程；handler不能代替观察Future。',
      },
    },
    {
      id: 'a-osslog',
      name: '核对 OSS 上传记录',
      desc: '排除"上传了但回调丢"',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-oss',
      ],
      hypotheses: [
        {
          id: 'h-oss',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '上传阶段与噪声核对',
        text: '失败样本render异常堆栈在uploadOss调用之前，诊断重放上传调用计数为0；对象清单无对应输出。\n附近的upload slow属于已成功的SUCCESS-9，不是失败taskId。\n排除“上传已成功但通知丢失”；不能只凭OSS侧无日志就断言任务未执行。',
      },
    },
    {
      id: 'a-threadstate',
      name: '核对进程身份与OOM记录',
      desc: '区分进程被杀和任务内异常',
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
        title: '进程与线程核对',
        text: '故障前后进程启动时间、容器实例身份相同，内核无对应OOM kill记录；其他任务持续完成。\n结合Future中明确的render NPE，排除本案进程被杀；内核OOM killer不是只杀一个Java任务线程。',
      },
    },
    {
      id: 'a-queuestate',
      name: '核对队列水位与任务执行记录',
      desc: '排除"还没轮到"',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [
        'h-queue',
      ],
      hypotheses: [
        {
          id: 'h-queue',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '出队与结果核对',
        text: '调度审计中失败taskId已有出队记录，不在当前队列；同输入诊断重放的Future已异常完成。\n排除“还没轮到”。低队列水位本身不能证明某个任务已执行，关键是任务身份与完成状态。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急清空任务池并重启',
      desc: '【状态变更】排空队列 + 重启任务池，赌一次干净初始化',
      cost: 8,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重启演练记录',
        text: '重启会丢弃仍排队的6个其他任务；同一失败输入重新提交后，render NPE仍被无人观察的Future保存。\n它不修复失败终态责任，还会破坏在途现场。本题其他动作仍读取同一份快照。',
      },
    },
    {
      id: 'a-fixhandler',
      name: '修复：明确任务边界的失败处理',
      desc: '【状态变更】记录异常、markFailed；Future由指定后台观察者读取',
      cost: 2,
      gain: 'none',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '失败责任修复',
        text: '任务边界捕获业务Exception，写错误日志和markFailed；结果观察由后台收集者get()或afterExecute检查Future承担。\n不在提交请求里同步等待get()，也不依赖UncaughtExceptionHandler捕获submit内部异常。\n普通异常重放得到FAILED和错误记录；进程崩溃等未落终态情况另由超时巡检发现。',
      },
    },
    {
      id: 'a-fixsweep',
      name: '沉淀：状态机巡检哨兵',
      desc: '【状态变更】"生成中"超 10 分钟自动标 STUCK + 告警——三无任务的最后哨兵',
      cost: 1,
      gain: 'none',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '巡检哨兵',
        text: '根据实际任务耗时设定阈值，发现超时仍GENERATING的任务并标记STUCK、告警。\n巡检用于发现进程崩溃、状态写入失败等遗留任务；不能单靠一次catch保证永不失联。',
      },
    },
    {
      id: 'a-fixlint',
      name: '沉淀：异步提交规范',
      desc: '【状态变更】submit明确结果观察责任，任务必须有失败终态',
      cost: 1,
      gain: 'none',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '异步代码审查',
        text: 'submit必须说明谁观察成功与异常结果；任务边界必须落实失败日志与状态。\nFuture可以由后台收集者或afterExecute检查，不要求请求线程阻塞get()。\nUncaughtExceptionHandler处理真正逃出线程的异常，不是submit结果观察器。',
      },
    },
    {
      id: 'a-fixmon',
      name: '沉淀：任务失败与超时指标',
      desc: '【状态变更】由失败处理或Future观察器计数，避免双记',
      cost: 1,
      gain: 'none',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '指标来源',
        text: '任务边界或Future观察器记录task_failed_total，同一taskId只结算一次；巡检另记task_stuck_total。\n不把UncaughtExceptionHandler的零计数当成“submit任务没有异常”。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-swallow',
      text: 'render异常被submit的Future保存，调用方未观察结果，任务也无失败终态路径；线程仍健康但任务永久GENERATING',
      correct: true,
    },
    {
      id: 'rc-oss',
      text: '报表上传成功，完成通知或状态更新丢失',
      correct: false,
    },
    {
      id: 'rc-oom',
      text: '进程被内核OOM killer杀死',
      correct: false,
    },
    {
      id: 'rc-queue',
      text: '任务仍在队列等待执行',
      correct: false,
    },
  ],
  expertCost: 4,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: 'GENERATING在提交时写入，第一条业务日志却在render后。',
      update: '缺日志可能是render提前失败，尚不能断言任务没执行。',
      actionId: 'a-impact',
      why: '1⚡先确认生命周期和观测点位置，比继续搜一个从未写出的错误关键字更有效。',
      conclusion: '优先审计异步结果与失败路径。',
    },
    {
      thought: '同输入重放的Future保存render NPE，线程继续工作，handler没有触发。',
      update: '异常被Future观察契约保存，无人读取且没有失败状态，是永久生成中的机制。',
      actionId: 'a-taskaudit',
      why: '2⚡代码审计结合受控重放，直接区分排队、线程退出与异常完成，不能靠线程池健康猜任务成功。',
      conclusion: '找到异常保存位置及终态责任缺口。',
    },
    {
      thought: '异常发生在上传前；OSS告警属于另一个成功任务。',
      update: '排除上传后通知丢失，并给噪声收线。',
      actionId: 'a-osslog',
      why: '1⚡将阶段顺序与同taskId证据对齐，避免把邻近的供应商告警错当成本任务原因。',
      conclusion: '失败阶段与机制闭合。',
    },
    {
      thought: '异常位置、Future语义和业务状态缺口已互相验证。',
      update: '停止，补任务失败处理与结果观察责任。',
      actionId: '',
      why: 'Future重放已证明任务执行后异常完成，上传前证据排除另一主要路径；无需靠重启猜测。',
      conclusion: 'submit异常要观察Future或任务边界；handler不能接住已被FutureTask保存的异常。',
    },
  ],
  lessons: [
    {
      text: 'submit任务异常保存在Future中；工作线程仍可继续，UncaughtExceptionHandler未触发不代表任务成功。',
      principle: 'FutureTask捕获计算异常并在get()时以ExecutionException呈现。真正逃出线程的异常与保存在异步结果中的异常是两种交付路径，不能混用处理器。',
    },
    {
      text: '异步任务要明确结果观察与失败终态责任；不要为了观察异常把提交请求改成同步等待。',
      principle: '任务边界可以记录业务失败，后台结果收集者或afterExecute也可检查Future。无论谁承担，必须保证失败可见，并设计状态写入失败与进程崩溃后的巡检。',
    },
    {
      text: '没有日志只说明观测缺失；阶段、任务身份和结果状态才区分没执行、执行失败与通知丢失。',
      principle: '把日志放在render之后就看不到render提前抛出的异常。先检查观测点，再用同一taskId的出队、异常与上传证据重建生命周期，避免由缺失证据武断排除执行。',
    },
  ],
}
