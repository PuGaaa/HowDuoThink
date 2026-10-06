import { DiagnosisCase } from '../../types/case'

/**
 * 第 12 章 · 架构演进 第三批（API 下线长尾盲区 L2）
 * 教学点：产品思维——"大盘看不见的用户"不等于"不存在的用户"；下线决策依据必须全口径审计；
 * 通知不带确认回执 = 没通知；下线是分级过程不是开关。
 * 专家路径：impact(1) + reportaudit(2) + noticelog(1) = 4⚡︎
 */
export const apiSunsetCase: DiagnosisCase = {
  id: 'api-sunset',
  title: '下线了"没人用"的接口，两周后 3000 单投诉',
  intro: '"没人用"的 v2 接口下线两周后，客服爆了 3000 单投诉：监控大盘上看不见的长尾用户，成了沉默的多数。',
  domain: 'runtime',
  layer: '大盘看不见的用户不等于不存在的用户——下线决策必须全口径审计',
  part: 'master',
  chapterId: 'evolution',
  order: 6,
  typeTags: ['architecture', 'process', 'capacity'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」开放平台的负责人，v2 接口下线的"善后"正演变成一场客户信任危机。',
    architecture: '开放平台(300 注册应用) → 主网关(App/Web 流量, 报表覆盖) / 企业接入网关(B2B, 报表未覆盖) → API v2(已下线, 410) / v3(现行)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '客服工单统计',
        text: '下线两周：2,987 件投诉，集中在 3 个企业客户——车载终端固件（3 万台）、POS 机（1.2 万台）、仓储扫描枪（8 千台）。\n这些设备调用 v2 接口，收到的全是 410 Gone。',
      },
      {
        type: 'text',
        title: '当时的决策依据',
        text: '一个月前的下线评审："v2 流量占比 0.3%，自然衰减，可以下线。"\n依据：主网关流量报表。通知方式：邮件发注册联系人。',
      },
    ],
    timeline: '下线决策一个月前评审通过 ｜ 两周前执行下线（410 生效）｜ 固件升级周期：企业设备 3~6 个月 ｜ 邮件通知发出于下线前 30/14/7 天',
    impactHint: '决策说"没人用"，客诉说"很多人在用"——两边的"用户"是同一批吗？报表的口径完整吗？',
  },

  hypotheses: [
    { id: 'h-tail', text: '长尾流量盲区：报表只覆盖主网关，企业客户的流量走了独立网关——"0.3%"是统计假象', excludeActionId: 'a-reportaudit' },
    { id: 'h-notice', text: '通知失效：注册联系人离职/未读，客户根本不知道要迁移', excludeActionId: 'a-noticelog' },
    { id: 'h-error', text: '410 响应无迁移指引，客户端重试风暴放大故障', excludeActionId: 'a-errorbody' },
    { id: 'h-noalt', text: 'v3 与 v2 字段不兼容，客户想升也升不了', excludeActionId: 'a-compatdiff' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '把投诉还原成"谁在用"',
      desc: '影响面：受影响客户的设备类型、升级能力、日调用量',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '受影响面画像',
        text: '3 个企业客户：车机固件（升级周期 6 个月，需进厂）/ POS（3 个月）/ 扫描枪（OTA 可升）\n合计日调用量：8 万次——这就是报表里"消失的流量"\n共性：设备类客户端，非 App/Web——不在主网关的统计口径里。\n→ 投诉的不是"长尾散户"，是一整个没被看见的客户群。',
      },
    },
    {
      id: 'a-reportaudit',
      name: '审计下线决策的流量口径',
      desc: '0.3% 是全量吗——两个网关的账本对齐',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-tail'],
      hypotheses: [{ id: 'h-tail', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '口径对账',
        text: '主网关报表：v2 占比 0.3%（仅 App/Web 流量）✓ 报表没算错\n企业接入网关：v2 日均 8 万次调用——从未并入任何报表 ✗\n全口径真实占比：4.2%，且调用方 100% 是"无法快速升级"的固件设备。\n实锤：决策依据是半张账本——"没人用"是统计口径的产物，不是事实。',
      },
    },
    {
      id: 'a-noticelog',
      name: '核查通知的送达与确认',
      desc: '客户知道要迁移吗——通知有没有回执',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-notice'],
      hypotheses: [{ id: 'h-notice', status: 'down' }],
      result: {
        type: 'text',
        title: '通知审计',
        text: '3 轮邮件均发送成功；但注册联系人 2/3 已离职（邮箱无人收），无已读回执机制。\n受影响 3 家客户：2 家表示"从未收到任何通知"。\n→ 降权为"并行缺陷"：即使通知送达，客户也无法在 1 个月内升级固件——通知问题存在，但决策依据错误才是根因。',
      },
    },
    {
      id: 'a-compatdiff',
      name: '核对 v2/v3 兼容性',
      desc: '排除"想升升不了"',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-noalt'],
      hypotheses: [{ id: 'h-noalt', status: 'excluded' }],
      result: {
        type: 'text',
        title: '兼容核对',
        text: 'v3 提供了 v2 适配层，核心字段兼容——技术上客户可以迁移。\n→ 排除兼容性：障碍是"不知道 + 周期长"，不是"升不了"。',
      },
    },
    {
      id: 'a-errorbody',
      name: '核对 410 响应的内容',
      desc: '排除错误响应放大',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-error'],
      hypotheses: [{ id: 'h-error', status: 'excluded' }],
      result: {
        type: 'text',
        title: '响应核对',
        text: '410 响应体带迁移文档链接（规范）。但固件不解析错误体——对设备客户端，链接等于不存在。\n→ 排除响应放大：核心问题仍是"这些调用方本不该在盲区里"。',
      },
    },
    {
      id: 'a-danger',
      name: '立即恢复 v2 全量',
      desc: '【状态变更】v2 接口重新上线，一切照旧',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '恢复结果',
        text: '投诉停止，客户恢复正常。\n代价：下线流程的缺陷原样保留——口径盲区还在、通知无回执还在，下次下线别的接口还会踩同一颗雷。\n→ 复盘点评：恢复了接口，没恢复流程。',
      },
    },
    {
      id: 'a-fixrestore',
      name: '修复：v2 定向恢复 + 限期迁移计划',
      desc: '【状态变更】v2 仅对 3 家企业客户恢复（白名单），专属迁移支持 + 90 天限期',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① v2 白名单恢复：3 家企业客户 + 其余确认无依赖后保持下线\n② 每家配迁移专员：OTA 客户 30 天，进厂固件客户分批 90 天\n③ 迁移完成一个摘除一个白名单——下线从"开关"变成"过程"。\n投诉清零，v2 真实流量 6 周后归零（这次是有据可依的归零）。',
      },
    },
    {
      id: 'a-fixsunset',
      name: '沉淀：下线 SOP 五步',
      desc: '【状态变更】全口径审计(≥90 天) → 依赖方逐个确认(非匿名) → 带回执通知 → 长尾缓冲(410+兼容层) → 分级下线',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'SOP v2',
        text: '① 全口径流量审计 ≥ 90 天（所有网关/渠道合并口径）\n② 依赖方逐个确认——企业客户必须"人工确认收到"，不接受静默\n③ 通知带已读回执，未回执 = 未通知\n④ 缓冲期：410 响应 + 兼容层并行\n⑤ 分级下线：先限流告警，后停服。',
      },
    },
    {
      id: 'a-fixreport',
      name: '沉淀：流量口径统一治理',
      desc: '【状态变更】独立网关流量强制并入统一报表；"没人用"结论必须跨口径交叉验证',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '口径治理',
        text: '企业接入网关流量并入统一报表平台（同一天完成）；\n规则写进架构评审清单：任何"下线/缩容/清理"决策引用的流量数据，必须声明口径并交叉验证——半张账本不能再当决策依据。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-tail', text: '下线决策依据的流量报表只覆盖主网关（App/Web），企业客户走独立接入网关未并入——"0.3% 没人用"是口径假象，真实占比 4.2% 且全部是无法快速升级的固件设备', correct: true },
    { id: 'rc-notice', text: '邮件通知无回执且联系人过半离职，客户未获知迁移（并行缺陷）', correct: false },
    { id: 'rc-error', text: '410 响应无迁移指引引发重试风暴', correct: false },
    { id: 'rc-noalt', text: 'v3 与 v2 不兼容导致无法迁移', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '决策说没人用、客诉说很多人用——先把投诉还原成"谁在用"：他们的设备、升级能力、调用量。',
      update: '3 个企业客户、固件设备、日均 8 万次——"沉默的长尾"其实是一整个没被看见的客户群。',
      actionId: 'a-impact',
      why: '1⚡︎ 把投诉从情绪还原成画像：设备类型决定升级周期，调用量决定商业权重——画像出来后，"谁错了"已经不是重点，"盲区在哪"才是。',
      conclusion: '共性浮现：全部是设备类客户端——不在主网关口径里。',
    },
    {
      thought: '审计决策依据的口径：0.3% 是全量还是半张账本——两个网关的账本对齐。',
      update: '实锤：企业网关流量从未并入报表，全口径 4.2% 且 100% 是固件——"没人用"是统计假象。',
      actionId: 'a-reportaudit',
      why: '2⚡︎ 口径对账是本案例的核心一击：下线决策的错误不在执行（下线本身没 bug），在依据（半张账本）——数据口径的盲区比技术盲区更隐蔽，因为它看起来"有数可依"。',
      conclusion: '根因实锤：决策口径盲区。',
    },
    {
      thought: '通知问题单独核查并定权——"客户不知道"解释了为什么没有迁移申请，但要分清它与根因的层次。',
      update: '通知无回执 + 联系人离职是真实的并行缺陷；但即使送达，固件也无法 1 个月升级——降权，不改变根因定性。',
      actionId: 'a-noticelog',
      why: '1⚡︎ 多缺陷叙事要分层定权：通知缺陷是"第二道失守"，若只有它，root cause 修复（口径）后它仍会让下线翻车——所以它也要修，但修复清单要分清主次。',
      conclusion: '并行缺陷确认 → 修复覆盖两层。',
    },
    {
      thought: '兼容性与响应体各 1⚡︎ 排除——"想升升不了"和"没有指引"两个叙事都关掉。',
      update: 'v3 有适配层、410 带文档链接——两个假设有证据排除。',
      actionId: 'a-compatdiff',
      why: '1⚡︎ 排除动作保护修复方向不发散：把"技术障碍"和"信息缺失"从清单里划掉，修复资源全部投向"口径 + 流程"的真问题。',
      conclusion: '嫌疑收敛 → SOP 重构。',
    },
    {
      thought: '止血（白名单恢复）、修复（限期迁移）、制度（下线 SOP + 口径治理）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】根因（口径盲区）✓ 并行缺陷（无回执通知）✓ 制度（SOP 五步）✓——个案、客户、流程三层闭合。',
      conclusion: '沉淀：下线是分级过程不是开关；"没人用"必须全口径证明。大盘看不见的用户不等于不存在的用户——沉默长尾是真实的商业关系。',
    },
  ],

  lessons: [
    {
      text: '"没人用"必须全口径证明：只看主网关的报表漏掉了整个企业接入网关——半张账本也能"有数可依"。',
      principle: '产品思维：决策依据的口径审计先于决策本身。任何"没有流量/没有用户"的结论都要回答：这个统计覆盖了哪些渠道、漏了哪些？独立系统、独立网关、历史归档的数据最容易成为口径盲区——它们不进大盘，不代表不在生产。',
    },
    {
      text: '通知不带确认回执等于没通知：邮件"发送成功"与"客户知晓"之间隔着离职、垃圾箱与固件升级周期。',
      principle: '流程设计：关键变更的通知必须有回执闭环（未回执 = 未送达），且确认对象要人工触达企业客户。"发了通知"是发出方的事实，"收到通知"才是接收方的事实——下线流程只为前者负责时，后者独自承担全部风险。',
    },
    {
      text: '下线是分级过程不是开关：白名单恢复 → 限期迁移 → 逐个摘除，每个客户的节奏由它的升级能力决定。',
      principle: '架构演进：API 的生命周期管理与发布同样重要——下线 SOP 五步（全口径审计/逐个确认/回执通知/长尾缓冲/分级下线）让"退出"拥有与"上线"同级的严谨。设备类客户端（固件/嵌入式）的升级周期以月计，缓冲期必须按最慢的依赖方设计。',
    },
  ],
}
