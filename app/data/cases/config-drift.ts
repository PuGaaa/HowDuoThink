import { DiagnosisCase } from '../../types/case'

/**
 * 第 14 章 · 部署与发布 第三批（配置推送漂移 L2）
 * 教学点：验证思维——推送"服务端成功"≠"客户端生效"：配置下发要有 ACK 回执与指纹对账；
 * 监听器是长连接，会静默死亡；配置漂移要靠巡检发现，不靠故障发现。
 * 专家路径：impact(1) + listenerlog(2) + driftcheck(1) = 4⚡︎
 */
export const configDriftCase: DiagnosisCase = {
  id: 'config-drift',
  title: '改了一个配置，三个实例没听见',
  intro: '配置中心改值后 9 个实例 30 秒生效，3 个实例还在跑旧值——服务端推送记录却显示"全部成功"。',
  domain: 'deploy',
  layer: '推送成功不等于生效——下发要有回执，漂移要靠对账发现',
  part: 'master',
  chapterId: 'deployment',
  order: 7,
  typeTags: ['deploy', 'config', 'verification'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」平台的中间件负责人，一次常规的限流阈值调整暴露了配置体系的暗面。',
    architecture: '配置中心 → 长轮询推送(12 实例) → 应用内存配置 ｜ 限流阈值：1000 → 5000（本次变更）',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '生效状态对比',
        text: '9 个实例：30 秒内限流阈值变为 5000 ✓\n3 个实例：仍在按 1000 拒绝请求——运营的调阈值为"改了个寂寞"。',
      },
      {
        type: 'text',
        title: '配置中心侧',
        text: '推送记录：12/12 推送成功（服务端视角全绿）。\n配置中心不知道有 3 个实例根本没收到——它只记录了"发出去了"。',
      },
    ],
    timeline: '本次变更为常规调整 ｜ 3 个失联实例的共同点：最近一次重启都在 30 天前 ｜ 配置客户端版本 8 个月未升级',
    impactHint: '服务端说"都发出去了"，3 个实例说"没收到"——中间的信使还活着吗？',
  },

  hypotheses: [
    { id: 'h-listener', text: '3 个实例的配置监听长连接已断且重连失败（退避到顶）：收不到任何推送事件', excludeActionId: 'a-listenerlog' },
    { id: 'h-cache', text: '实例本地配置快照未失效，即使收到事件也读旧值', excludeActionId: 'a-cachecheck' },
    { id: 'h-gray', text: '配置中心灰度发布只推了部分分组，3 个实例不在推送范围', excludeActionId: 'a-graylog' },
    { id: 'h-restart', text: '近期重启的实例没拉到全量配置（启动快照残缺）', excludeActionId: 'a-restartlog' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '按实例切分生效状态',
      desc: '影响面：生效与未生效实例的差异特征',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '实例状态切分',
        text: '生效组（9）：内存配置 5000，日志有"配置更新事件"记录\n失联组（3）：内存配置仍 1000，日志无任何更新事件——不是"读了旧值"，是"根本没听见"\n失联组共同点：30 天以上未重启；配置中心推送记录对它们显示"成功"\n→ 未生效的方式是"静默失联"：信使可能早就不在了。',
      },
    },
    {
      id: 'a-listenerlog',
      name: '解剖失联实例的配置客户端',
      desc: '长连接还活着吗、重连退避到哪了',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-listener'],
      hypotheses: [{ id: 'h-listener', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '客户端日志解剖',
        text: '失联实例的配置客户端日志：\nD-3 10:22  long-polling connection reset（网络抖动）\nD-3 10:22  reconnect attempt #1…#12（指数退避）\nD-3 10:37  give up, retry in 1h（退避到顶，此后每 1h 试一次且继续失败——地址解析问题）\n→ 监听器已死 3 天：期间所有推送（包括本次）对它等于不存在。\n而服务端视角：长轮询"发起即成功"——它不知道对面已经没人接电话。',
      },
    },
    {
      id: 'a-driftcheck',
      name: '全集群配置指纹对账',
      desc: '漂移是个例还是普遍——12 实例 × 全部配置项扫描',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '指纹对账',
        text: '12 实例 × 156 个配置项的指纹比对：\n失联 3 实例：落后 3 个版本（本次限流 + 此前的超时调整 + 开关翻转）——前两次变更它们也没收到！\n其余 9 实例：指纹一致 ✓\n→ 漂移不是孤例：监听器死了 3 天，3 个版本的黑洞一直在——只是这次有人"看结果"才被发现。',
      },
    },
    {
      id: 'a-cachecheck',
      name: '核对本地快照机制',
      desc: '排除快照缓存问题',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'excluded' }],
      result: {
        type: 'text',
        title: '快照核对',
        text: '本地快照在收到更新事件时刷新——失联实例连事件都没有，快照机制无从谈起。\n→ 排除缓存：问题在"事件到达"之前。',
      },
    },
    {
      id: 'a-graylog',
      name: '核对推送范围与灰度记录',
      desc: '排除灰度遗漏',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-gray'],
      hypotheses: [{ id: 'h-gray', status: 'excluded' }],
      result: {
        type: 'text',
        title: '灰度核对',
        text: '本次为全量推送（无灰度分组）；失联 3 实例在推送名单内。\n→ 排除灰度：名单里有它们，只是"敲门没人应"。',
      },
    },
    {
      id: 'a-restartlog',
      name: '核对实例重启与启动拉取',
      desc: '排除启动快照残缺',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-restart'],
      hypotheses: [{ id: 'h-restart', status: 'excluded' }],
      result: {
        type: 'text',
        title: '重启核对',
        text: '失联 3 实例 30 天未重启（恰恰因为不重启，长连接断了没人发现）；\n近期重启过的实例启动时全量拉取，配置全部正确。\n→ 排除启动问题；反而揭示：重启是"事实上的自愈"——长活实例才是漂移高发区。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急重启 3 个失联实例',
      desc: '【状态变更】重启触发全量配置拉取',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '重启结果',
        text: '3 实例配置同步（5000 生效）。\n代价：无优雅停机的实例被硬重启，在途请求被斩（发布期毛刺重演）；\n且"重启治愈"掩盖了监听器死亡的根因——它还会再死。',
      },
    },
    {
      id: 'a-fixfingerprint',
      name: '修复：配置指纹周期对账',
      desc: '【状态变更】实例定期上报配置指纹，与配置中心比对，漂移即主动拉取+告警',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '对账上线',
        text: '① 客户端每 60s 上报指纹（配置项 hash）\n② 配置中心比对：不一致 → 主动推全量 + 记录"补推成功"\n③ 连续 3 次对不上 → 告警并标记实例"配置不可信"\n回归：人为掐断长连接模拟失联 → 60 秒内被发现并补齐。',
      },
    },
    {
      id: 'a-fixack',
      name: '沉淀：推送 ACK 回执机制',
      desc: '【状态变更】配置变更推送带 ACK：未回执实例进入"未同步名单"，看板可见',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回执机制',
        text: '推送语义升级：发出 = 无效，回执 = 成功。\n变更发布后的看板：12/12 ACK 才算"变更完成"；未回执实例单独列示。\n"服务端成功"的幻觉被制度性消灭。',
      },
    },
    {
      id: 'a-fixdrill',
      name: '沉淀：配置变更生效验证',
      desc: '【状态变更】每次配置变更后抽样实例断言"运行值 == 期望值"，断言进变更 SOP',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'SOP v2',
        text: '配置变更 SOP 新增终态验证：随机抽 3 实例读取运行时配置值断言生效。\n和发布要边缘验证同理——配置也要"用户视角"的终态断言。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-listener', text: '3 个长活实例的配置监听长连接 3 天前断开且重连退避到顶（每 1h 盲试）——推送事件全部丢失；配置中心只有"发出"记录无"回执"机制，黑洞持续 3 个版本无人知晓', correct: true },
    { id: 'rc-cache', text: '本地配置快照未失效导致读到旧值', correct: false },
    { id: 'rc-gray', text: '灰度发布只推部分分组，3 实例被遗漏', correct: false },
    { id: 'rc-restart', text: '近期重启实例启动拉取残缺', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '未生效的方式是关键线索：先切分实例——是"读了旧值"还是"根本没听见"。',
      update: '失联组日志里连更新事件都没有——静默失联，嫌疑从"读侧"转到"通知侧"。',
      actionId: 'a-impact',
      why: '1⚡︎ "没生效"有两种截然不同的失败模式：值错（读侧）与没听见（通知侧）——切分它们，排查方向完全不同。',
      conclusion: '嫌疑锁定：推送链路（h-listener 升权）。',
    },
    {
      thought: '解剖失联实例的客户端：长连接活着吗、断了之后重连在干什么。',
      update: '实锤：连接 3 天前断、重连退避到 1h 盲试——监听器已死，服务端"推送成功"是幻觉。',
      actionId: 'a-listenerlog',
      why: '2⚡︎ 客户端日志解剖揭示两侧的语义鸿沟：服务端记录"发出"，客户端连"在线"都不是——推送系统没有回执语义时，成功记录是自我安慰。',
      conclusion: '根因实锤：监听器死亡 × 无回执机制。',
    },
    {
      thought: '漂移面普查：3 天的黑洞吞了多少个版本、多少个配置项——个例还是面。',
      update: '3 实例落后 3 个版本：前两次变更也没生效——黑洞早已存在，只是这次有人看结果。',
      actionId: 'a-driftcheck',
      why: '1⚡︎ 指纹对账把"本次事故"放大成"漂移面"：黑洞存在 3 天意味着此前每次变更都在制造隐性不一致——修复范围由证据重新定义。',
      conclusion: '漂移面确认 → 指纹对账机制是根治方向。',
    },
    {
      thought: '缓存/灰度/重启三个常规嫌疑各 1⚡︎ 排除——重启线索反而揭示"长活实例是高发区"。',
      update: '三个假设有证据排除；重启=事实自愈的旁证，指向监听器健康度巡检的缺失。',
      actionId: 'a-cachecheck',
      why: '1⚡︎ 排除动作的副产品是洞察：重启自愈的旁证说明"长活"与"失联"相关——巡检设计要特别盯长活实例。',
      conclusion: '嫌疑收敛 → 修复三层（对账/回执/断言）。',
    },
    {
      thought: '止血（重启）、修复（指纹对账）、制度（ACK 回执+变更断言）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（监听器死亡）✓ 面（3 个版本黑洞）✓ 防线（指纹+回执+断言）✓——个案、历史、防线三层闭合。',
      conclusion: '沉淀：推送成功不等于生效——配置下发要像发布一样有回执、有终态断言、有漂移对账。',
    },
  ],

  lessons: [
    {
      text: '推送"服务端成功"不等于"客户端生效"：长轮询/长连接会静默死亡，没有回执语义的推送记录是自我安慰。',
      principle: '验证思维：配置下发的完整语义 = 发出 + ACK + 生效断言。客户端 ACK 回执让"未同步名单"可见；服务端只记录"发出"时，黑洞可以存在 3 天而系统全绿。',
    },
    {
      text: '配置漂移要靠指纹对账发现，不靠故障发现：实例定期上报配置指纹与中心比对，漂移即主动补推 + 告警。',
      principle: '防御式配置：指纹对账（客户端 hash vs 中心 hash）是配置体系的"对账单"，60 秒级发现失联。长活实例是失联高发区（重启反而自愈）——巡检要盯的恰恰是"很久没出事"的实例。',
    },
    {
      text: '配置变更和发布一样需要终态断言：变更后抽样实例断言"运行值 == 期望值"——改了不算数，生效才算数。',
      principle: '流程设计：变更 SOP 的最后一步永远是终态验证——发布验证边缘节点，配置验证实例运行值。语义与发布同构：都是"把意图变成全集群的事实"，都需要用户视角的验收。',
    },
  ],
}
