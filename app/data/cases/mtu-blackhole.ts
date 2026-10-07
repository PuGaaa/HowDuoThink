import { DiagnosisCase } from '../../types/case'

/**
 * 第 15 章 · 网络深处 第六批（大包分片黑洞 L3）
 * 教学点：全栈视野——DF 位 + 隧道 MTU 的分片黑洞：只有"大响应"场景超时，小包全部健康；
 * 与 tcp-retrans（重传指纹）区分：本关是"无重传的静默黑洞"，抓包看的是分片而非重传。
 * 专家路径：impact(1) + dfprobe(2) + pathmtu(1) = 4⚡︎
 */
export const mtuBlackholeCase: DiagnosisCase = {
  id: 'mtu-blackhole',
  title: '只有大客户超时：数据都在，就是到不了',
  intro: '供应商系统对接"响应超过 1400 字节必超时"，小响应全绿——不是丢包，是包在半路被静默吞了。',
  domain: 'network',
  layer: 'DF 位遇上小 MTU：不能分片的包比能分片的包死得更安静',
  part: 'master',
  chapterId: 'network',
  order: 10,
  typeTags: ['network', 'dependency', 'capacity'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」供应链平台的负责人，最大供应商的对接故障持续一周，对面的工程师咬定是你们的问题。',
    architecture: '供应链平台 → 专线网关(VXLAN 隧道, MTU 1450) → 供应商接入网(防火墙策略: 丢弃 ICMP) → 供应商 ERP',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '故障指纹',
        text: '响应 > 1400 字节的请求：100% 超时（60s 客户端超时）\n响应 ≤ 1400 字节：100% 正常（30ms）。\n无重传告警、无丢包率上升、防火墙日志无 DROP 记录——包像蒸发了一样。',
      },
      {
        type: 'text',
        title: '双方的僵局',
        text: '我方：ping 全通、小请求全通、"网络明明是好的"。对方：我们的防火墙没拦任何东西（日志为证）。\n一周来双方互相出示"正常"的证据。',
      },
    ],
    timeline: '供应商上周迁移了接入机房（新防火墙上线）｜ 故障自迁移后出现 ｜ 涉事接口为大响应（对账单 8KB~2MB）',
    impactHint: '"小包全绿、大包蒸发、无任何 DROP 日志"——什么样的网络行为，能做到静默吞包不留痕迹？',
  },

  hypotheses: [
    { id: 'h-dfblackhole', text: 'DF 位黑洞：我方包带 DF（不分片）+ 链路 MTU 1450，超 MTU 包被中途静默丢弃，ICMP 需分片通知又被防火墙策略吞掉——发送端永远不知道为什么', excludeActionId: 'a-dfprobe' },
    { id: 'h-limit', text: '对方防火墙对大响应有显式限制（WAF/IDS 规则），仅未记日志', excludeActionId: 'a-rulescan' },
    { id: 'h-mss', text: '对端 TCP MSS 协商错误，大响应被强制分段后丢弃', excludeActionId: 'a-msscheck' },
    { id: 'h-tls', text: '大响应触发对端 TLS 重组缓冲区上限，连接被对端关闭', excludeActionId: 'a-tlscheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '给"超时"画尺寸指纹',
      desc: '影响面：超时与响应体尺寸的精确关系',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '尺寸指纹',
        text: '响应 ≤ 1400B：30ms 全绿（100/100）\n响应 1401~1450B：部分超时（边界抖动）\n响应 > 1450B：100% 超时（87/87）\n1400 这个数字 = 典型的隧道 MTU（1450）减去协议头——\n"尺寸指纹"直指分片问题，而非内容问题（同样的大文件走公网通道正常）。',
      },
    },
    {
      id: 'a-dfprobe',
      name: 'DF 位逐点探测：包死在哪一跳',
      desc: '带 DF 不分片标记、按尺寸逐跳 ping——黑洞位置成像',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-dfblackhole'],
      hypotheses: [{ id: 'h-dfblackhole', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'DF 逐跳探测（-M do -s 逐档）',
        text: '我方 → 专线网关：-s 1400 -M do ✓ 通；-s 1500 -M do ✗ 静默丢\n专线 → 供应商接入防火墙：-s 1400 -M do ✗ 静默丢！\n全程无 ICMP "fragmentation needed" 返回（对方防火墙策略丢弃全部 ICMP）\n抓包对照：TCP 包带 DF 位（我方应用默认）+ 尺寸 > 1450 → 进入隧道后被静默吞掉。\n实锤：DF 位黑洞——发送端不知道 MTU、中间网关吞了告知包，超时的包死得无声无息。\n（供应商防火墙"没拦任何东西"也没撒谎：ICMP 丢弃不计入 DROP 业务日志。）',
      },
    },
    {
      id: 'a-pathmtu',
      name: 'PMTUD 链路审计',
      desc: '整条链路的 MTU 逐跳核对 + ICMP 策略核对',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'PMTUD 审计',
        text: '我方应用侧 MTU 1500 → 隧道封装实际可用 1450 → 供应商侧未知。\nICMP 策略：我方放行 frag-needed ✓；对方防火墙"丢弃全部 ICMP"（安全基线）✗——\nPMTUD 的耳朵在对方被捂住：黑洞形成需要两件事（小 MTU + 吞 ICMP），双方各贡献一件。',
      },
    },
    {
      id: 'a-rulescan',
      name: '请对方导出防火墙全量规则',
      desc: '排除显式规则限制',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-limit'],
      hypotheses: [{ id: 'h-limit', status: 'excluded' }],
      result: {
        type: 'text',
        title: '规则核对',
        text: '对方全量规则导出：无任何按包尺寸的丢弃规则（业务规则干净）。\n→ 排除显式限制：黑洞是基础设施行为（ICMP 策略），不是安全规则。',
      },
    },
    {
      id: 'a-msscheck',
      name: '核对 TCP MSS 协商值',
      desc: '排除 MSS 错配',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-mss'],
      hypotheses: [{ id: 'h-mss', status: 'down' }],
      result: {
        type: 'text',
        title: 'MSS 核对',
        text: '三次握手的 MSS 协商值 = 1360（双方已按隧道 MTU 修正）——TCP 分段尺寸本身没问题。\n但问题出在"TLS 记录 + TCP 头"叠加后仍超隧道 MTU 的边缘场景，\n以及握手后的非 TCP 大包（对账单的传输层多样性）。MSS 是缓解不是根治。',
      },
    },
    {
      id: 'a-tlscheck',
      name: '核对 TLS 层行为',
      desc: '排除 TLS 重组上限',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-tls'],
      hypotheses: [{ id: 'h-tls', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'TLS 核对',
        text: 'TLS 记录按 16KB 分块，无重组上限问题；故障尺寸指纹（1400B）远低于 TLS 层。\n→ 排除 TLS：尺寸指纹在 IP 层，不在 TLS 层。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急在双方防火墙上放行 oversized 包分片',
      desc: '【状态变更】对方防火墙允许 IP 分片通过',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '放行分片结果（陷阱动作）',
        text: '大响应通了（分片后逐片到达）。\n代价：IP 分片是经典攻击载体（teardrop/重叠分片）——对方安全团队当晚回滚，故障复发。\n→ 复盘点评：允许分片是在"可用性"与"安全基线"间做交换——正确解是让包"不需要分片"（MSS clamp/stapling），而不是打开分片大门。',
      },
    },
    {
      id: 'a-fixclamp',
      name: '修复：MSS clamp + PMTUD 双向放行 + MTU 对齐',
      desc: '【状态变更】两侧网关 MSS clamp 到 1360 + 双向放行 ICMP type3/code4 + 专线 MTU 全链路对齐登记',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 两侧网关 MSS clamp：TCP 握手协商 MSS=1360（永不产生超 MTU 的 TCP 包）\n② 双向放行 ICMP type3/code4：PMTUD 恢复听力（非 TCP 大包也有自愈通道）\n③ 专线 MTU 全链路登记（呼应 tcp-retrans 检查单，跨组织链路新增对方侧确认栏）\n回归：2MB 对账单 4.1s 完整到达；-s 1400 -M do 全程通。',
      },
    },
    {
      id: 'a-fixdiag',
      name: '沉淀：跨组织网络故障诊断包',
      desc: '【状态变更】对接联调包：DF 逐跳探测脚本 + 尺寸指纹模板 + "证据交换清单"——跨组织甩锅终结者',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '诊断包',
        text: '跨组织对接标配三件：\n① 尺寸指纹模板（≤1400/>1450 二分）\n② DF 逐跳探测脚本（-M do 逐档）\n③ 证据交换清单（双方各出什么：我方抓包/对方防火墙 ICMP 计数）。\n一周的僵局，诊断包 20 分钟终结——跨组织甩锅的解药是"可交换的证据格式"。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-dfblackhole', text: 'DF 位黑洞：我方 TCP 包带 DF 位 + 专线隧道 MTU 1450 + 对方防火墙丢弃全部 ICMP（含 frag-needed）——超 MTU 的大响应被静默吞且发送端无从自愈；"大包死小包活"的指纹与双方各执一词的僵局同源', correct: true },
    { id: 'rc-limit', text: '对方防火墙按包尺寸的显式丢弃规则', correct: false },
    { id: 'rc-mss', text: 'TCP MSS 协商错误导致大响应分段丢弃', correct: false },
    { id: 'rc-tls', text: 'TLS 重组缓冲上限触发对端断连', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '"小包全绿大包蒸发"——先给超时画尺寸指纹：故障与响应体大小的精确关系。',
      update: '1400B 临界 + 1450 隧道 MTU 减头——尺寸指纹直指 IP 层分片，而非内容或应用。',
      actionId: 'a-impact',
      why: '1⚡︎ 尺寸指纹是网络故障最锋利的剖刀：它把"偶发超时"变成"确定性的尺寸函数"——而尺寸是 MTU 世界的通用语言。',
      conclusion: '嫌疑锁定：分片黑洞（h-dfblackhole 升权）。',
    },
    {
      thought: 'DF 逐跳探测给黑洞成像：带 DF、逐档尺寸、逐跳 ping——包死在哪一跳一清二楚。',
      update: '实锤：1400 过我方、过隧道死在专线段；无 ICMP 通告——DF 黑洞三要素（DF 位/小 MTU/吞 ICMP）凑齐。',
      actionId: 'a-dfprobe',
      why: '2⚡︎ 教学核心：DF 位让包"宁死不分片"，吞 ICMP 让它"死不瞑目"——两个看似无关的策略（隧道封装 + 安全基线）相遇就成黑洞。逐跳探测是给"无声死亡"验尸的唯一手段。',
      conclusion: '根因实锤：双方各贡献一半的系统性黑洞。',
    },
    {
      thought: 'PMTUD 审计确认"双方各贡献一件"——我方隧道小 MTU，对方吞 ICMP。跨组织故障的定责因此有了依据。',
      update: '责任结构清晰：黑洞不归任何一方单独所有——修复也必须是双侧联合动作。',
      actionId: 'a-pathmtu',
      why: '1⚡︎ 跨组织故障的定责价值：黑洞的成因分属两家——这决定了修复方案必须是"联合行动"，单方面任何动作都无法根治。',
      conclusion: '联合修复的前提成立。',
    },
    {
      thought: '对方规则/对端 MSS/TLS 三个假设逐个排除——尤其"对方防火墙没拦"这句证词，技术上是真的。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（DF+小MTU+吞ICMP）✓ 指纹（尺寸临界）✓ 防线（clamp+放行+登记）✓——机制、指纹、防线三层闭合。',
      conclusion: '沉淀：DF 位遇上小 MTU——不能分片的包死得最安静；跨组织链路的 ICMP 策略是双方共同的义务。',
    },
  ],

  lessons: [
    {
      text: 'DF 位遇上小 MTU 是静默黑洞：包宁死不分片、ICMP 告知被吞——发送端只看到超时，全网无告警。',
      principle: '全栈视野：黑洞 = DF 位（应用默认开启）× 隧道小 MTU × 中途吞 ICMP，三要素分布在两三个组织手里。诊断武器是 DF 逐跳探测（-M do 逐档 ping）——它给"无声死亡"成像。',
    },
    {
      text: '"我们的防火墙没拦任何东西"可以是真话：ICMP 丢弃不计入业务 DROP 日志——双方出示的"正常"证据可以同时为真。',
      principle: '跨组织协作：证据要按"对方基础设施的记账方式"索取——业务日志干净 ≠ 无丢弃，要 ICMP 计数器。跨组织诊断包（尺寸指纹模板 + DF 探测脚本 + 证据交换清单）终结甩锅，靠的是可交换的证据格式。',
    },
    {
      text: '打开 IP 分片是可用性与安全的交换：分片通了当晚被安全团队回滚——正确解是让包不需要分片。',
      principle: '程序设计：MSS clamp（握手协商永不超 MTU 的分段）+ PMTUD 双向放行（非 TCP 包的自愈通道）+ MTU 全链路登记，三件套让大包"天生合规"。与 tcp-retrans 案例的三件套同族——MTU 治理是跨组织链路的共同义务。',
    },
  ],
}
