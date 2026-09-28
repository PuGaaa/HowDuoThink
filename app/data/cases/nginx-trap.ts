import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 接入层之夜（Nginx 配置陷阱 L2）
 * 教学点："偶发"常常是没找到分桶维度；请求没到应用，应用日志永远无辜；
 * 网关默认值是隐形合同；配置漂移 = 测试好的生产不行。
 * 专家路径：impact(1) + sizecorr(2) + nginxconf(2) + confdiff(1) = 6⚡︎
 */
export const nginxTrapCase: DiagnosisCase = {
  id: 'nginx-trap',
  title: '上传失败率 8%，时好时坏',
  intro: '图片上传接口上线一周，失败率稳定在 8% 左右。运营说是"用户网络不好"，研发怀疑是"服务抖动"——但谁也拿不出证据。',
  domain: 'network',
  layer: '网关配置是隐形的合同：请求没到应用，应用日志永远无辜',
  part: 'apprentice',
  chapterId: 'access',
  order: 4,
  typeTags: ['config', 'dependency'],
  difficulty: 2,

  scene: {
    role: '你是内容平台的后端，图片上传接口是你发布的。周会上，8% 的失败率被点名了。',
    architecture: 'App → CDN → WAF → Nginx 网关 → 上传服务(../upload) → 对象存储',
    symptoms: [
      {
        type: 'error',
        title: '网关访问日志（失败样本）',
        text: '[12:03:41] "POST /api/upload HTTP/1.1" 413  WAF-ok  12ms\n[12:04:02] "POST /api/upload HTTP/1.1" 413  WAF-ok  9ms\n[12:05:17] "POST /api/upload HTTP/1.1" 200  WAF-ok  820ms',
      },
      {
        type: 'text',
        title: '业务监控',
        text: '失败率 8.2%，全天分布均匀、无高峰低谷；\n失败用户遍布各运营商、各地域——"弱网解释"站不住。',
      },
    ],
    timeline: '上线一周持续 8%，不好转也不恶化 ｜ 测试环境全量回归通过 ｜ 无发布、无配置变更（据平台组说）',
    impactHint: '"时好时坏"是真的随机，还是你没找对分桶的维度？',
  },

  hypotheses: [
    { id: 'h-size', text: '请求体大小超过网关层限制，超限的请求被直接拒绝', excludeActionId: 'a-sizecorr' },
    { id: 'h-net', text: '弱网用户上传超时，失败是网络问题', excludeActionId: 'a-netseg' },
    { id: 'h-svc', text: '上传服务处理失败（内存/磁盘/异常抖动）', excludeActionId: 'a-svclog' },
    { id: 'h-cdn', text: '前置 CDN/WAF 拦截了大请求', excludeActionId: 'a-layertrace' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '按请求大小给失败分桶',
      desc: '把失败率按上传文件大小分桶统计',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [{ id: 'h-net', status: 'down' }],
      result: {
        type: 'text',
        title: '分桶统计（按文件大小）',
        text: '< 512KB   成功率 100%\n512KB~1MB 成功率 99.4%\n> 1MB     成功率 0%（全部失败）\n→ 哪里是"时好时坏"？失败与文件大小强相关：超过 1MB 必失败。',
      },
    },
    {
      id: 'a-sizecorr',
      name: '看失败请求的响应详情',
      desc: '响应码、响应头、响应体是谁生成的',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-size'],
      hypotheses: [{ id: 'h-size', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '失败响应样本',
        text: 'HTTP/1.1 413 Request Entity Too Large\nServer: nginx/1.24.0\n<html><head><title>413 Request Entity Too Large</title>…\n→ 413 是 Nginx 默认错误页，没有应用 trace-id：\n请求在网关就被拒了，根本没到上传服务。',
      },
    },
    {
      id: 'a-netseg',
      name: '按网络环境分桶对比',
      desc: '运营商 / 地域 / WiFi-vs-蜂窝的失败率差异',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-net'],
      hypotheses: [{ id: 'h-net', status: 'excluded' }],
      result: {
        type: 'text',
        title: '网络分桶',
        text: '三大运营商、Top5 省份、WiFi/蜂窝的失败率差异 < 0.5 个百分点，且都只随文件大小变化。\n→ 与网络质量无关。',
      },
    },
    {
      id: 'a-svclog',
      name: '查上传服务日志与水位',
      desc: '失败时段服务有没有收到请求、有没有异常',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-svc'],
      hypotheses: [{ id: 'h-svc', status: 'excluded' }],
      result: {
        type: 'text',
        title: '上传服务日志',
        text: '413 时段服务日志干干净净：无异常、无慢请求，CPU/内存平稳。\n→ 应用是"无辜"的——它压根没收到那些请求。',
      },
    },
    {
      id: 'a-layertrace',
      name: '逐层核对链路放行记录',
      desc: 'CDN → WAF → Nginx，每一层的拦截记录',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-cdn'],
      hypotheses: [{ id: 'h-cdn', status: 'excluded' }],
      result: {
        type: 'text',
        title: '链路核对',
        text: 'CDN 回源记录：已放行；WAF 拦截日志：无 upload 相关拦截。\n→ 前两层都放行了，拦截发生在最后一层：Nginx。',
      },
    },
    {
      id: 'a-nginxconf',
      name: '导出生产 Nginx 生效配置',
      desc: 'nginx -T 看实际生效的 client_max_body_size',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-size'],
      hypotheses: [{ id: 'h-size', status: 'up' }],
      result: {
        type: 'code',
        title: 'nginx -T | grep client_max_body_size',
        text: '# 生产：无任何输出\n→ 生产配置里根本没有这条指令，\nNginx 默认值 client_max_body_size 1m 在生效——恰好等于分桶的失败线。',
      },
    },
    {
      id: 'a-confdiff',
      name: 'Diff 测试与生产的配置',
      desc: '同一个接口，两套环境差了什么',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-size'],
      hypotheses: [{ id: 'h-size', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '配置 Diff',
        text: '+ 测试环境 http 块: client_max_body_size 50m\n- 生产（sites-api.conf）: 该指令不存在\n→ 上线时模板里写过这条，重构配置目录时被挪进了"仅测试"的 conf 片段——配置漂移。',
      },
    },
    {
      id: 'a-changegit',
      name: '查网关配置的变更历史',
      desc: 'client_max_body_size 是何时、被谁弄丢的',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '配置仓库历史',
        text: '三个月前"配置目录重构"提交：把通用指令拆成 base.conf + sites/*.conf，\nclient_max_body_size 被归入 base-dev.conf（注释：联调期放宽用）。\n生产 include 的清单里没有它——默认值 1m 悄悄生效至今。',
      },
    },
    {
      id: 'a-scaleup',
      name: '把上传服务扩容一倍',
      desc: '试试加机器能不能压下失败率',
      cost: 2,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '扩容结果',
        text: '413 失败率纹丝不动（8.2% → 8.3%）。\n→ 预料之中：请求根本没到服务，扩容治不了"没到我这儿"的故障。',
      },
    },
    {
      id: 'a-fixconf',
      name: '补齐网关限制并固化基线',
      desc: '【状态变更】生产补 client_max_body_size 20m，nginx -t 校验后 reload，并纳入配置基线模板',
      cost: 4,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: 'nginx.conf 补 client_max_body_size 20m → nginx -t 通过 → 平滑 reload。\n>1MB 上传成功率 100%，接口总失败率回落到 0.1%。\n同时把该指令加入生产配置基线，CI 增加两环境配置 diff 门禁。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-size', text: '生产 Nginx 缺失 client_max_body_size 配置，默认 1m 生效——超过 1MB 的上传请求被网关直接 413 拒绝（测试环境配了 50m 所以测不出来）', correct: true },
    { id: 'rc-net', text: '弱网用户上传超时导致失败', correct: false },
    { id: 'rc-svc', text: '上传服务处理异常抖动导致失败', correct: false },
    { id: 'rc-cdn', text: '前置 CDN/WAF 拦截了大请求', correct: false },
  ],

  expertCost: 6,
  restartActionId: 'a-fixconf',

  expertChain: [
    {
      thought: '"时好时坏"先别信——换个维度分桶，看看失败到底随什么变化。',
      update: '按文件大小分桶：>1MB 必失败、<1MB 几乎全成 → 不是随机网络问题，是确定性的阈值。',
      actionId: 'a-impact',
      why: '1⚡︎ 分桶是把"偶发"变"必现"的唯一手段：找对分桶维度，8% 的噪声立刻显形成 100% 的规则。',
      conclusion: '失败与大小强相关，阈值在 1MB 附近 → 看失败响应是谁发的。',
    },
    {
      thought: '看失败响应的细节：响应码、Server 头、有没有应用 trace-id，判断是谁拒绝的。',
      update: '413 + Nginx 默认错误页 + 无 trace-id → 请求死在网关，应用无辜。',
      actionId: 'a-sizecorr',
      why: '2⚡︎ 响应详情一步定位"凶手层级"：默认错误页和缺失的 trace-id 是"没到应用"的铁证，省掉在应用里大海捞针。',
      conclusion: 'Nginx 网关层拦截 → 查它生效的限制值。',
    },
    {
      thought: '别看配置文件，看生效配置：nginx -T 导出运行时合并后的真实值。',
      update: '生产没有任何 client_max_body_size 指令——默认 1m 生效，恰好等于失败阈值。',
      actionId: 'a-nginxconf',
      why: '2⚡︎ "文件里写了"和"运行时生效了"是两回事：include、继承、就近覆盖都会让静态阅读被骗。nginx -T 才是真相。',
      conclusion: '默认值陷阱实锤 → 对比测试环境，找漂移的来源。',
    },
    {
      thought: '测试为什么能过？Diff 两套配置，找出这条指令的去向。',
      update: '测试环境 50m 在 http 块生效；生产的这条在重构时被挪进了仅测试的片段——配置漂移全程复盘。',
      actionId: 'a-confdiff',
      why: '1⚡︎ 找到漂移机制才能修得彻底：只补一行配置，下次重构还会丢；找到"怎么丢的"才能加防漂移门禁。',
      conclusion: '机制闭环：重构丢指令 → 默认 1m 生效 → >1MB 全拒。停止收集。',
    },
    {
      thought: '证据闭合：分桶规则 + 网关拦截实锤 + 默认值生效 + 漂移来源明确。停止收集。',
      update: '停止。修复：补配置 + reload + 配置基线门禁防复发；扩容这类动作对这个故障毫无意义。',
      actionId: '',
      why: '根因、修复、防复发三件事都已明确；网络/应用/CDN 假设已排除，继续收集不改变行动。',
      conclusion: '补 20m 并 reload 后失败率 0.1%。检查单：网关类配置要有环境 diff 门禁；"偶发"故障先找分桶维度。',
    },
  ],

  lessons: [
    {
      text: '"偶发"常常是没找到分桶维度：按文件大小一分桶，8% 的噪声立刻显形成 100% 的规则。',
      principle: '失败率从不均匀分布——找不到规律是因为分桶维度不对。大小/时段/地域/端版本/参数值，换维度重新切分，"随机问题"大多会现出原形。',
    },
    {
      text: '请求没到应用，应用日志永远无辜：Nginx 默认错误页 + 无 trace-id 是"网关拦截"的铁证。',
      principle: '先问"请求死在了哪一层"再问"为什么死"：响应头里的 Server 标识、默认错误页、缺失的 trace-id，都是判断凶手层级的免费证据。',
    },
    {
      text: 'Nginx 的默认值是隐形合同：没写的指令也在生效，client_max_body_size 默认只有 1m。',
      principle: '网关类组件的默认值往往极度保守（1m body、60s 超时、1024 连接）。上线涉及大请求/长连接前，必须核对生效配置而不是相信"没配就是没限制"。',
    },
    {
      text: '配置漂移 = "测试好的生产不行"：文件里写了不等于运行时生效了，nginx -T 才是真相。',
      principle: '多环境差异要靠门禁而不是记忆：CI 里加两环境配置 diff 检查；排查时用运行时导出（nginx -T / effective config）替代静态阅读。',
    },
  ],
}
