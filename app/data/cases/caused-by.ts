import { DiagnosisCase } from '../../types/case'

/**
 * 读懂报错：主训假设思维；次训验证思维；排查现场。
 * 原型：HikariCP 5.1.0 getConnection超时与保留cause的业务包装，教学重建。
 * 六维：2/2/2/2/1/2，L2；磁盘告警由sizecheck收线。
 * 标准：impact(1) → chaindeep(2) → poolmetrics(1) = 4；替代：impact → poolmetrics → chaindeep = 4。
 * 技术依据与独立编审见 content/baselines/t04a-calibration.md。
 */
export const causedByCase: DiagnosisCase = {
  id: 'caused-by',
  title: '导出失败的包装异常：借连接卡在哪里',
  intro: '表层只写报表生成失败。读完整异常链，再用资源指标确认是借连接超时，还是数据库失联。',
  domain: 'runtime',
  layer: '异常链保留失败线索，资源证据解释业务根因；链底异常不自动等于根因',
  part: 'apprentice',
  chapterId: 'error-reading',
  order: 2,
  typeTags: [
    'resource',
    'capacity',
  ],
  difficulty: 2,
  scene: {
    role: '你是「鲜到家」报表服务的新任负责人，前任留下一句"偶发失败，加了重试就行"的交接语。',
    architecture: '导出接口 → ExportService（保留cause包装SQLException）→ HikariCP(20连接) → MySQL8',
    tag: '教学重建',
    symptoms: [
      {
        type: 'error',
        title: '接口错误日志（当前只展示第一层）',
        text: 'com.xj.report.ExportException: Report generation failed\n  at com.xj.report.ExportService.export(ExportService.java:140)\n前任增加重试后，月结高峰仍有请求失败。',
      },
      {
        type: 'log',
        title: '同时出现的告警',
        text: '[WARN] export-temp disk_usage=72% threshold=70%\n这条磁盘容量告警是否与报表失败有关，还没有证据。',
      },
    ],
    timeline: '月结高峰持续到达导出请求 ｜ 上周查询改为大结果集读取 ｜ 已有重试没有稳定消除失败',
    impactHint: '先核对失败分布；保留cause的异常链可能告诉你失败发生在借连接还是执行SQL。',
  },
  hypotheses: [
    {
      id: 'h-pool',
      text: '慢查询长期占满池中连接，后续请求借连接超时',
      excludeActionId: 'a-poolmetrics',
    },
    {
      id: 'h-surface',
      text: '应用到数据库链路故障，连接不可用',
      excludeActionId: 'a-remoteuptime',
    },
    {
      id: 'h-remote',
      text: 'MySQL进程重启，现有连接失效',
      excludeActionId: 'a-remoteuptime',
    },
    {
      id: 'h-size',
      text: '导出临时目录空间不足，文件写入失败',
      excludeActionId: 'a-sizecheck',
    },
  ],
  actions: [
    {
      id: 'a-impact',
      name: '核对失败与重试的关系',
      desc: '影响面：失败集中哪些时段、等待多久',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '失败分布',
        text: '失败集中月结高峰；同样的导出参数在低峰成功。\n失败请求总耗时接近30秒，重试后部分成功、部分再次失败。\n这只能提高持续资源等待的优先级，还不能单凭重试效果排除网络或数据库故障。',
      },
    },
    {
      id: 'a-chainread',
      name: '核对表层异常的包装代码',
      desc: '看它是否保留原始cause',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '包装代码',
        text: 'catch (SQLException e) {\n  throw new ExportException("Report generation failed", e);\n}\n表层是业务包装，不是SocketException。继续读cause才能区分连接获取、SQL执行与结果处理失败。',
      },
    },
    {
      id: 'a-chaindeep',
      name: '展开完整cause链与失败位置',
      desc: '确定等待发生在哪个调用',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-pool',
        'h-size',
      ],
      hypotheses: [
        {
          id: 'h-pool',
          status: 'up',
        },
        {
          id: 'h-size',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '完整异常链',
        text: 'com.xj.report.ExportException: Report generation failed\nCaused by: java.sql.SQLTransientConnectionException: HikariPool-1 - Connection is not available, request timed out after 30000ms.\n  at com.zaxxer.hikari.pool.HikariPool.createTimeoutException(...)\n  at com.zaxxer.hikari.pool.HikariPool.getConnection(...)\n业务帧停在dataSource.getConnection()；失败请求尚未拿到连接，未发送它自己的SQL。\n这说明借连接等待超时，但池被慢查询占满或无法建立新连接，仍需指标区分。',
      },
    },
    {
      id: 'a-poolmetrics',
      name: '核对连接池监控',
      desc: '高峰时池的真实水位与等待队列',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [
        'h-pool',
        'h-surface',
        'h-remote',
      ],
      hypotheses: [
        {
          id: 'h-pool',
          status: 'confirmed',
        },
        {
          id: 'h-surface',
          status: 'excluded',
        },
        {
          id: 'h-remote',
          status: 'excluded',
        },
      ],
      result: {
        type: 'code',
        title: '池与同一MySQL实例对账',
        text: '同一故障窗口：total=20、active=20、idle=0，等待线程峰值34，借连接超时计数上升。\n这20个连接在同一MySQL实例上持续执行导出SQL，单次占用8~15秒；无建连/通信错误，MySQL uptime未重置。\n持续到达速度超过这些长查询释放连接的速度，等待累积到30秒。\n不是“连接数看着少”就扩池：先缩短占用并验证数据库容量。',
      },
    },
    {
      id: 'a-remoteuptime',
      name: '核对 MySQL 的重启与存活',
      desc: '排除对端真挂',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-surface',
        'h-remote',
      ],
      hypotheses: [
        {
          id: 'h-surface',
          status: 'excluded',
        },
        {
          id: 'h-remote',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '对端与链路核对',
        text: '同一MySQL实例uptime连续；现有20个导出会话仍在执行SQL，新建诊断连接成功。\n故障窗口无通信错误或连接重置，排除本案的进程重启与断链假设。',
      },
    },
    {
      id: 'a-sizecheck',
      name: '核对临时目录与写入错误',
      desc: '给磁盘告警收线',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [
        'h-size',
      ],
      hypotheses: [
        {
          id: 'h-size',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '磁盘告警收线',
        text: '目录仍有28%可用空间，失败请求尚在getConnection()，没有进入文件写入。\n无ENOSPC或I/O错误；72%仅超过预警阈值，不是本次失败原因。',
      },
    },
    {
      id: 'a-danger',
      name: '立即重启导出服务',
      desc: '【状态变更】丢弃等待队列，赌一次干净启动',
      cost: 8,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重启演练记录',
        text: '重启丢失在途导出现场。相同月结负载再次压来后，长查询仍占满连接，借连接超时重现。\n重启没有缩短查询或释放连接的占用周期；本题其他动作仍读取同一份事前快照。',
      },
    },
    {
      id: 'a-fixpool',
      name: '修复：缩短占用并限制导出并发',
      desc: '【状态变更】优化慢SQL、按页归还连接，再用同负载验证容量',
      cost: 2,
      gain: 'none',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复验证',
        text: '先优化慢SQL，每页查询后归还连接，生成文件阶段不持有数据库连接；并限制导出并发。\n保留池上限20，在相同负载下复测：单次连接占用降至约1秒，等待与超时下降。\n是否调整池大小要结合数据库容量实测；借连接超时、连接寿命与查询超时是不同参数。',
      },
    },
    {
      id: 'a-fixchain',
      name: '沉淀：异常链阅读规范',
      desc: '【状态变更】日志保留完整cause，归因时对照资源指标',
      cost: 1,
      gain: 'none',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '异常阅读规范',
        text: '读完整cause链并定位失败调用；再查为什么该调用失败。\n最深异常是证据，不保证就是业务根因；包装异常必须保留cause，不能只留下泛化报错。',
      },
    },
    {
      id: 'a-fixmon',
      name: '沉淀：池水位告警',
      desc: '【状态变更】同时观测active、idle、等待和借连接超时',
      cost: 1,
      gain: 'none',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '监控条目',
        text: '将连接占用时长、等待线程和借连接超时一起观察。\n提前量取决于采样与负载；不能承诺“等待阈值30秒，所以告警必定提前30秒”。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-pool',
      text: '大结果集慢查询长期占用20个连接，持续高峰使借连接等待累积至30秒，业务层保留cause包装了超时',
      correct: true,
    },
    {
      id: 'rc-surface',
      text: '数据库网络断链导致连接不可用',
      correct: false,
    },
    {
      id: 'rc-remote',
      text: 'MySQL进程重启使连接失效',
      correct: false,
    },
    {
      id: 'rc-size',
      text: '临时目录写满导致文件生成失败',
      correct: false,
    },
  ],
  expertCost: 4,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '失败集中高峰且耗时接近固定30秒。',
      update: '资源等待优先，网络与数据库故障尚未排除。',
      actionId: 'a-impact',
      why: '1⚡先找分布和耗时形状，比直接提高重试次数更能指引下一步。',
      conclusion: '需要定位等待发生在哪个调用。',
    },
    {
      thought: '完整cause指向HikariCP.getConnection()，失败请求尚未取得连接。',
      update: '确定是借连接超时，不是该请求的SQL读超时。',
      actionId: 'a-chaindeep',
      why: '2⚡展开被包装的原始异常，才能区分获取连接与执行查询，避免修错阶段。',
      conclusion: '慢占用和建连失败仍需区分。',
    },
    {
      thought: '池20个连接全部在同一数据库上执行8~15秒的导出SQL，没有断链或重启。',
      update: '长占用与持续到达导致排队，等待超时机制闭合。',
      actionId: 'a-poolmetrics',
      why: '1⚡将借连接异常与实际资源占用对账，解释池为何没有空闲，而不把链底异常当终点。',
      conclusion: '优先缩短占用和控制导出并发。',
    },
    {
      thought: '失败调用、占用来源和时间窗口相互印证。',
      update: '停止；磁盘预警可另行核实，不改变当前定位。',
      actionId: '',
      why: '完整异常链与池/数据库指标已经区分主要假设，继续搜同样报错不会改变处置。',
      conclusion: '保留cause，治理长占用并按相同负载复测；不从并发数直接推导池应扩到40。',
    },
  ],
  lessons: [
    {
      text: 'cause链帮助定位失败调用；业务根因仍要靠资源与时间线证明。',
      principle: '借连接超时只说明在规定时间内没有可用连接。慢查询、泄漏和建连失败都可能导致它，不能把最深异常自动当成最终根因。',
    },
    {
      text: '重试效果只能调整假设优先级，不能单独排除网络或确认容量问题。',
      principle: '瞬时与持续故障都可能出现重试成败。结合影响分布、失败调用和同窗口资源证据，才能决定重试是否有益。',
    },
    {
      text: '先缩短连接占用并验证并发，再决定池大小；不要把连接等待与连接寿命混成一个参数。',
      principle: '增加连接可能把瓶颈推到数据库。池大小要按实际数据库容量测试；connectionTimeout限制借连接等待，并不回收正在执行查询的连接。',
    },
  ],
}
