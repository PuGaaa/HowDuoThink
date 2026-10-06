import { DiagnosisCase } from '../../types/case'

/**
 * 第 1 章 · 接口与契约 首批（请求契约破坏 L2）
 * 教学点：架构设计——接口变更分级铁律：响应可加字段、请求不可加必填；
 * 兼容矩阵在 CI 拦截破坏性变更；网关兜底是止血不是设计。
 * 专家路径：impact(1) + schemacheck(2) + gatewayroute(1) = 4⚡︎
 */
export const requiredFieldCase: DiagnosisCase = {
  id: 'required-field',
  title: '加了个必填字段，老版 App 全体 400',
  intro: '创建订单接口加了必填的 channelSource，渗透率 35% 的老版 App 下单开始 400——向后兼容是接口的婚约。',
  domain: 'build',
  layer: '接口变更分级铁律：响应可加字段，请求不可加必填',
  part: 'engineer',
  chapterId: 'contract',
  order: 1,
  typeTags: ['contract', 'deploy'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」订单服务的接口负责人，一次"很常规"的字段新增引爆了老版本用户。',
    architecture: 'App v2.6/v2.7/v2.8（渗透率 35%/40%/25%） → 网关 → 订单服务 v2.8(CreateOrderRequest: 新增 @NotNull channelSource)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '错误监控',
        text: '下单 400: "channelSource must not be null"——全部来自 v2.6/v2.7 客户端。\n新客户端 v2.8（会带 channelSource）零失败。',
      },
      {
        type: 'text',
        title: '变更记录',
        text: '本次需求：渠道归因分析需要 channelSource 字段（记录下单来源渠道）。\n开发在请求 DTO 上加了 @NotNull——"反正新功能要用，就必填吧"。服务端昨天上线。',
      },
    ],
    timeline: '服务端昨天 20:00 上线 ｜ 21:00 起老版 App 用户下单失败潮 ｜ 老 App 版本轮：用户不主动升级则长期停留 ｜ 3,500 万 DAU 中 75% 为老版本',
    impactHint: '新客户端全好、老客户端全坏——服务端"加"了什么，让"没变"的请求变得不合法？',
  },

  hypotheses: [
    { id: 'h-required', text: '请求 DTO 新增 @NotNull 必填字段：老 App 请求体无此字段，校验必然拒绝——契约破坏', excludeActionId: 'a-schemacheck' },
    { id: 'h-gateway', text: '网关对老版本走了不同的路由或转换逻辑，改坏了请求', excludeActionId: 'a-gatewayroute' },
    { id: 'h-encoding', text: '老 App 请求编码问题（charset 缺失），字段解析失败', excludeActionId: 'a-encodingcheck' },
    { id: 'h-cert', text: '老 App 的 TLS 证书校验过期，时间上与上线巧合', excludeActionId: 'a-certcheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '按客户端版本切分失败面',
      desc: '影响面：失败与成功的分界线、错误内容',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '版本切分',
        text: '失败群：v2.6/v2.7 客户端 100% 失败，错误统一"channelSource must not be null"\n成功群：v2.8 客户端 100% 成功（请求体带 channelSource）\n时间线：服务端上线后精确开始，与 App 侧无任何变更\n→ 分界线 = "客户端会不会带新字段"——服务端给"缺字段"的合法请求判了死刑。',
      },
    },
    {
      id: 'a-schemacheck',
      name: '对照两版契约与实际请求体',
      desc: '契约破坏的机制确认：@NotNull 的杀伤半径',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-required'],
      hypotheses: [{ id: 'h-required', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '契约对照',
        text: 'v2.8 请求体：{ …, "channelSource": "push_banner" } → 200 ✓\nv2.6 请求体：{ "skuId": 889, "num": 1, … } —— 结构完整，但没有 channelSource\n服务端校验：@NotNull channelSource → 缺字段 = 校验失败 → 400\n→ 兼容铁律：响应加字段永远安全（老客户端忽略新内容）；\n请求加必填字段永远破坏（老调用方无法预知）——这次踩了后半句。',
      },
    },
    {
      id: 'a-gatewayroute',
      name: '核对网关路由与转换',
      desc: '排除网关层差异',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-gateway'],
      hypotheses: [{ id: 'h-gateway', status: 'excluded' }],
      result: {
        type: 'text',
        title: '网关核对',
        text: '所有版本走同一路由同一转发规则；网关日志透传请求体原样。\n→ 排除网关：它忠实转发了"注定 400"的请求。',
      },
    },
    {
      id: 'a-encodingcheck',
      name: '核对请求编码',
      desc: '排除编码问题',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-encoding'],
      hypotheses: [{ id: 'h-encoding', status: 'excluded' }],
      result: {
        type: 'text',
        title: '编码核对',
        text: '老 App 请求 Content-Type/charset 正常，其余字段解析全部成功（只有新字段缺失报错）。\n→ 排除编码：解析器工作正常，是"业务校验"在拒绝。',
      },
    },
    {
      id: 'a-certcheck',
      name: '核对老 App 证书状态',
      desc: '排除 TLS 巧合',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cert'],
      hypotheses: [{ id: 'h-cert', status: 'excluded' }],
      result: {
        type: 'text',
        title: '证书核对',
        text: '老 App 与服务端 TLS 握手正常（都到了 400 的应用层——连接层早已成功）。\n→ 排除证书：能收到 400 说明 TLS 早已建立。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急让网关为老请求注入默认值',
      desc: '【状态变更】网关识别老版本请求，注入 channelSource="legacy"',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '网关注入结果',
        text: '老 App 下单恢复（400 消失）。\n代价：网关长出了业务逻辑（知道每个接口的必填字段该填什么）——\n每个新必填字段都要网关再补一条注入规则，网关变成"补丁服务器"。\n→ 复盘点评：兜底可以是临时的桥，不能成为架构的一部分。',
      },
    },
    {
      id: 'a-fixoptional',
      name: '修复：字段改可选 + 服务端补全',
      desc: '【状态变更】channelSource 去掉 @NotNull；服务端对缺失值补默认 "unknown"，归因分析兼容',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① @NotNull 移除：channelSource 缺失时服务端补 "unknown"\n② 归因分析侧：unknown 渠道单独分组（老版本流量的归因口径明确）\n③ 灰度回归：三版本客户端 × 创建接口全矩阵 200。\n老 App 的"没变"重新合法。',
      },
    },
    {
      id: 'a-fixmatrix',
      name: '沉淀：契约兼容矩阵进 CI',
      desc: '【状态变更】每次接口变更跑三象限：新客户端×新服务端 / 旧客户端×新服务端 / 文档对照',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'CI 矩阵',
        text: '契约测试三象限：\n新请求×新服务端 ✓ / 旧请求（上版本快照）×新服务端 ← 本次事故的拦截点 / 文档与实现对照。\n旧请求快照用"上一版本的真实流量样本"——破坏性变更在合并前被旧流量当场拒绝。',
      },
    },
    {
      id: 'a-fixgrade',
      name: '沉淀：接口变更分级规范',
      desc: '【状态变更】分级卡：响应加字段=兼容 / 请求加可选=兼容 / 请求加必填=破坏性（须新版本号+双跑期）',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '分级卡',
        text: '接口变更分级：\n🟢 兼容：响应加字段/请求加可选字段/加新接口\n🔴 破坏性：请求加必填/删字段/改类型/改语义——必须升版本号（/v3/）+ 双跑期 + 下线 SOP\n分级卡贴在 code review 模板——"必填"两个字从此有了门槛。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-required', text: '请求 DTO 新增 @NotNull channelSource：老版 App（渗透 75%）请求体无此字段被 Bean Validation 拒绝——违反"请求不可加必填"兼容铁律；响应加字段才安全', correct: true },
    { id: 'rc-gateway', text: '网关对老版本路由/转换差异', correct: false },
    { id: 'rc-encoding', text: '老 App 请求编码问题', correct: false },
    { id: 'rc-cert', text: '老 App TLS 证书校验过期', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '新客户端全好老客户端全坏——按版本切分失败面，分界线本身就是答案的轮廓。',
      update: '分界线 = "是否携带新字段"；错误信息直接点名 channelSource——服务端在拒绝"缺一个上周还不存在的字段"。',
      actionId: 'a-impact',
      why: '1⚡︎ 版本切分 + 错误信息对读，一步把"变更引入"实锤——剩下的只是"为什么这个字段会拒绝老请求"的机制确认。',
      conclusion: '嫌疑锁定：@NotNull 新字段（h-required 升权）。',
    },
    {
      thought: '契约对照：两版请求体与服务端校验——把"兼容铁律"的上下两半摆在一起看。',
      update: '实锤：请求加必填字段 = 破坏老调用方（无法预知）；响应加字段 = 安全（老端忽略）。',
      actionId: 'a-schemacheck',
      why: '2⚡︎ 契约对照是接口类排查的核心动作：把"请求侧/响应侧"的不对称性讲透——同一句"加字段"，在两侧的兼容性完全相反。',
      conclusion: '根因实锤：违反兼容铁律后半句。',
    },
    {
      thought: '网关/编码/证书三个常规嫌疑各 1⚡︎ 排除——尤其证书，"老客户端失败"最常见的误判方向。',
      update: '路由一致、编码正常、TLS 已建立（能收到 400 即证明）——三个假设有证据排除。',
      actionId: 'a-gatewayroute',
      why: '1⚡︎ "能收到 400 = TLS 已建立"是教科书级的排除推理：协议分层让低层故障根本到不了应用层——分层的知识直接变成排除的武器。',
      conclusion: '嫌疑收敛单点。',
    },
    {
      thought: '止血（网关注入有架构代价）、正解（字段改可选+服务端补全）、防线（兼容矩阵+分级卡）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（必填破坏契约）✓ 铁律（响应可加/请求必填不可加）✓ 防线（矩阵+分级卡）✓——个案、铁律、防线三层闭合。',
      conclusion: '沉淀：接口变更分级铁律——响应可加字段，请求不可加必填；破坏性变更必须升版本号 + 双跑期。',
    },
  ],

  lessons: [
    {
      text: '接口变更分级铁律：响应加字段永远安全（老端忽略），请求加必填永远破坏（老端无法预知）——"加字段"在两侧的兼容性完全相反。',
      principle: '架构设计：契约变更分级卡（🟢兼容：响应加/请求可选；🔴破坏：请求必填/删字段/改类型）贴进 review 模板。破坏性变更必须升版本号 + 双跑期 + 下线 SOP——"必填"两个字的门槛就是一套发布流程。',
    },
    {
      text: '兼容性要在 CI 里用"旧请求快照"验证：拿上一版本的真实流量样本打新服务端，破坏性变更当场现形。',
      principle: '验证思维：契约测试三象限（新×新/旧×新/文档对照）的核心是"旧请求×新服务端"——它模拟的正是本次事故的现场。兼容不是评审时的口头承诺，是流水线里旧流量样本的 200 断言。',
    },
    {
      text: '网关兜底是临时的桥不是架构的一部分：每个必填字段都让网关多长一块业务逻辑——补丁服务器是兼容债的复利。',
      principle: '架构权衡：止血注入（网关补默认值）可以买时间，但要登记退役条件（服务端改 optional 后拆除）。兜底逻辑进网关 = 把契约知识散落到第二处——与 rule-sprawl 同构：散落的规则必漏改。',
    },
  ],
}
