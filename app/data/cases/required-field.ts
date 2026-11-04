import { DiagnosisCase } from '../../types/case'

/** 技术机制教学重建；情境、日志和数值为教学样本，非真实原始工单或生产实测。
 * 逐题编审与技术来源见 content/baselines/t04b-engineer-calibration.md。 */
export const requiredFieldCase: DiagnosisCase = {
  id: 'required-field',
  title: '加了个必填字段，老版 App 全体 400',
  intro: '服务端发布后，75%的旧版客户端下单400，新版正常。先对比失败边界和请求契约。',
  domain: 'build',
  layer: '新增请求必填字段会破坏既有调用；响应新增字段也需要验证消费者是否允许扩展',
  part: 'engineer',
  chapterId: 'contract',
  order: 1,
  typeTags: [
    'contract',
    'deploy',
  ],
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
      {
        type: 'log',
        title: '遥测上传告警',
        text: '[WARN] mobile telemetry upload 503；客服同时报告。',
      },
    ],
    timeline: '服务端昨天 20:00 上线 ｜ 21:00 起老版 App 用户下单失败潮 ｜ 老 App 版本轮：用户不主动升级则长期停留 ｜ 教学流量 中 75% 为老版本',
    impactHint: '新客户端全好、老客户端全坏——服务端"加"了什么，让"没变"的请求变得不合法？',
  },
  hypotheses: [
    {
      id: 'h-required',
      text: '请求 DTO 新增 @NotNull 必填字段：老 App 请求体无此字段，校验必然拒绝——契约破坏',
      excludeActionId: 'a-schemacheck',
    },
    {
      id: 'h-gateway',
      text: '网关对老版本走了不同的路由或转换逻辑，改坏了请求',
      excludeActionId: 'a-gatewayroute',
    },
    {
      id: 'h-encoding',
      text: '老 App 请求编码问题（charset 缺失），字段解析失败',
      excludeActionId: 'a-encodingcheck',
    },
    {
      id: 'h-cert',
      text: '老 App 的 TLS 证书校验过期，时间上与上线巧合',
      excludeActionId: 'a-certcheck',
    },
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
      tests: [
        'h-required',
      ],
      hypotheses: [
        {
          id: 'h-required',
          status: 'confirmed',
        },
      ],
      result: {
        type: 'code',
        title: '契约对照',
        text: 'v2.8请求携带channelSource→200；v2.6/v2.7合法旧请求无此字段。服务端新增@NotNull，缺字段时Bean Validation返回400。\n同构对照仅撤销新增必填约束，旧请求恢复200，其他字段不变。响应加字段仅在旧消费者允许未知属性时兼容，严格schema/签名校验也可能拒绝，不能说永远安全。',
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
      tests: [
        'h-gateway',
        'h-cert',
      ],
      hypotheses: [
        {
          id: 'h-gateway',
          status: 'excluded',
        },
        {
          id: 'h-cert',
          status: 'excluded',
        },
      ],
      result: {
        type: 'text',
        title: '网关核对',
        text: '同一旧请求在网关入口与服务端入口body校验和相同，路由一致；TLS握手完成，400由服务端校验器产生，排除网关转换和证书失败。\n噪声收线：遥测走独立域名且可重试；本次下单请求已到服务端并由字段校验器返回400，body和TLS证据不受遥测上传影响。',
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
      tests: [
        'h-encoding',
      ],
      hypotheses: [
        {
          id: 'h-encoding',
          status: 'excluded',
        },
      ],
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
      tests: [
        'h-cert',
      ],
      hypotheses: [
        {
          id: 'h-cert',
          status: 'excluded',
        },
      ],
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
      cost: 9,
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
      desc: '【状态变更】按请求、响应和消费者约束判断兼容性，不用永远安全的口诀',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '分级卡',
        text: '通常响应加字段和请求加可选字段可兼容，但要检查旧消费者的未知字段策略、签名及业务语义。新增请求必填、删字段、改类型/语义须验证旧调用方；确有破坏则版本化并保留迁移期。',
      },
    },
  ],
  rootCauses: [
    {
      id: 'rc-required',
      text: '服务端新增@NotNull channelSource，而75%旧客户端不发送该字段；既有合法请求被400拒绝，新增请求必填破坏了旧契约',
      correct: true,
    },
    {
      id: 'rc-gateway',
      text: '网关对老版本路由/转换差异',
      correct: false,
    },
    {
      id: 'rc-encoding',
      text: '老 App 请求编码问题',
      correct: false,
    },
    {
      id: 'rc-cert',
      text: '老 App TLS 证书校验过期',
      correct: false,
    },
  ],
  expertCost: 5,
  restartActionId: 'a-danger',
  expertChain: [
    {
      thought: '按版本划分成功和失败。',
      update: '旧版75%流量缺新字段时400，新版成功。',
      actionId: 'a-impact',
      why: '1⚡版本边界加错误信息缩小到请求契约。',
      conclusion: '核对新增校验。',
    },
    {
      thought: '比较契约并做单变量对照。',
      update: '新增@NotNull解释旧请求失败，撤销约束恢复。',
      actionId: 'a-schemacheck',
      why: '2⚡字段缺失与校验错误形成直接因果，不泛化响应新增永远安全。',
      conclusion: '确认必填变更。',
    },
    {
      thought: '对照端到端传输记录。',
      update: '请求体未变、路由一致、TLS已完成。',
      actionId: 'a-gatewayroute',
      why: '1⚡同一trace包含路由、body与握手证据，可排除两项。',
      conclusion: '网关与证书排除。',
    },
    {
      thought: '核对解析器和编码。',
      update: '旧请求其他字段成功解析，Content-Type正确。',
      actionId: 'a-encodingcheck',
      why: '1⚡编码证据独立于业务校验，补齐剩余候选。',
      conclusion: '全部候选收敛。',
    },
    {
      thought: '证据已覆盖候选解释，停止继续取证；修复和复验作为后续操作。',
      update: '定位完成，尚未执行修复。',
      actionId: '',
      why: '【停止规则】新增必填的单变量对照成立，路由、TLS和编码反证齐备。以上均来自已执行动作；修复建议不冒充已完成的证据。',
      conclusion: '服务端新增@NotNull channelSource，而75%旧客户端不发送该字段；既有合法请求被400拒绝，新增请求必填破坏了旧契约',
    },
  ],
  lessons: [
    {
      text: '新增请求必填字段会让既有合法请求失效；响应新增字段通常兼容，但严格拒绝未知字段的客户端仍可能失败。',
      principle: '兼容性由提供方和消费者共同决定。对仍在用的各版本做旧请求/旧消费者回归；新版本号本身不能修复旧端，必须保留迁移期。',
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
