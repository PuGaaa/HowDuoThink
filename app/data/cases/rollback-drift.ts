import { DiagnosisCase } from '../../types/case'

/**
 * 第 14 章 · 部署与发布 第六批（回滚目标漂移 L3）
 * 教学点：假设思维——三个服务循环依赖，各自回滚各自版本，故障在服务间"跳"；
 * 分布式回滚必须先定"锚点版本组合"，回滚是组合动作不是三个独立动作。
 * 专家路径：impact(1) + tripletcheck(2) + anchorroll(1) = 4⚡︎
 */
export const rollbackDriftCase: DiagnosisCase = {
  id: 'rollback-drift',
  title: '回滚了三次，故障在三个服务间跳',
  intro: '下单链路故障，运营回滚 A 成功、故障跳到 B；回滚 B 又跳到 C——三个服务像在踢皮球。',
  domain: 'deploy',
  layer: '分布式回滚是组合动作——没有锚点版本组合，回滚只是把故障搬家',
  part: 'master',
  chapterId: 'deployment',
  order: 5,
  typeTags: ['deploy', 'dependency', 'race'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」订单链路的值班负责人，一场教科书式失败的回滚正在直播。',
    architecture: '下单链路：网关 → 订单服务(A) → 优惠券服务(B) → 库存服务(C) ｜ 三服务独立部署、独立回滚 ｜ 昨晚 A/B/C 三服务先后发布',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '回滚直播记录',
        text: '20:10 下单失败率 35%（B 调 C 报 500）→ 20:15 回滚 C 至昨日版 → 20:20 失败率 40%（A 调 B 报超时）\n20:25 回滚 B 至昨日版 → 20:30 失败率 28%（A 内部 NPE）→ 20:35 回滚 A 至昨日版 → 20:40 失败率 45%（回到最初）',
      },
      {
        type: 'text',
        title: '值班群实录',
        text: '三个服务 owner 各自确认"我的服务回滚后本身是好的"——单独压测每个旧版本全绿。\n但组合起来下单链路就是坏的。',
      },
    ],
    timeline: '昨晚 19:00~21:00 A/B/C 三服务先后发布（促销引擎改造，共享新协议字段）｜ 20:10 起故障 ｜ 三次回滚均为各服务"自己的上一版"',
    impactHint: '每个旧版本单独看都是好的——那"坏"藏在哪？藏在它们的"组合"里。回滚的对象到底是什么？',
  },

  hypotheses: [
    { id: 'h-combo', text: '版本组合漂移：三服务共享新协议字段，逐个回滚制造了三个从未测试过的版本组合——故障随组合漂移', excludeActionId: 'a-tripletcheck' },
    { id: 'h-cache', text: '网关/客户端缓存了新协议响应，旧版本服务返回被缓存污染', excludeActionId: 'a-cachecheck' },
    { id: 'h-data', text: '新版本写入的数据格式，旧版本读不了（数据层不兼容）', excludeActionId: 'a-datacheck' },
    { id: 'h-config', text: '三服务的共享配置被最后一次发布改写，回滚代码没回滚配置', excludeActionId: 'a-configcheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '给三次回滚建"组合矩阵"',
      desc: '影响面：每次回滚后，三个服务各是什么版本',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '版本组合矩阵（A/B/C）',
        text: '20:10  v3.0 / v3.0 / v3.0   失败 35%（B→C 500）\n20:15  v3.0 / v3.0 / v2.9   失败 40%（A→B 超时）← 故障换了位置\n20:25  v3.0 / v2.9 / v2.9   失败 28%（A 内部 NPE）← 又换\n20:35  v2.9 / v2.9 / v2.9   失败 45%（回到最初的 B→C 500）\n→ 每一行都是一个"从未测试过的组合"：回滚不是复原，是在生成新组合。',
      },
    },
    {
      id: 'a-tripletcheck',
      name: '对照三服务发布 diff 的协议耦合',
      desc: '昨晚三个发布共享了什么——协议字段的耦合图',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-combo'],
      hypotheses: [{ id: 'h-combo', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '协议耦合图',
        text: '促销引擎改造：三服务同时引入 promoBatch 字段（B 传给 C，A 透传校验）。\nB v3.0：promoBatch 必传（新协议）\nC v2.9：promoBatch 未定义（收到新字段走默认分支，但缺 batchContext 触发 500）\nA v3.0：校验 promoBatch 非空；A v2.9：不校验 → C v2.9 的 500 直接裸露为 NPE\n→ 任意"新旧混合组合"都各有一个断点——三次回滚只是把断点搬到了不同的边上。',
      },
    },
    {
      id: 'a-anchorroll',
      name: '锚点回滚：整链回到发布前组合',
      desc: '【状态变更】按昨晚 19:00 的锚点组合（v2.9×3）一次性回滚三服务',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '锚点回滚结果',
        text: '以 19:00 发布前快照为锚点：A/B/C 三服务组合回滚至 v2.9×3。\n下单链路恢复——这是 4 小时来第一个"被测试过的组合"。\n故障率 45% → 0.2%（基线）。',
      },
    },
    {
      id: 'a-cachecheck',
      name: '核对网关与客户端缓存',
      desc: '排除缓存污染',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'excluded' }],
      result: {
        type: 'text',
        title: '缓存核对',
        text: '网关对下单 POST 不缓存；客户端无协议响应缓存。\n→ 排除缓存：每次失败都是"实时的新组合"产生的。',
      },
    },
    {
      id: 'a-datacheck',
      name: '核对新版本写入的数据格式',
      desc: '排除数据层不兼容',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-data'],
      hypotheses: [{ id: 'h-data', status: 'excluded' }],
      result: {
        type: 'text',
        title: '数据核对',
        text: 'promoBatch 相关数据仅存在于请求体（不落库）——无跨版本数据残留。\n→ 排除数据层：断点全在"协议边"上。',
      },
    },
    {
      id: 'a-configcheck',
      name: '核对共享配置变更',
      desc: '排除配置侧',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-config'],
      hypotheses: [{ id: 'h-config', status: 'excluded' }],
      result: {
        type: 'text',
        title: '配置核对',
        text: '配置中心变更审计：三服务相关键零变更（代码即协议，本次全部在代码里）。\n→ 排除配置。',
      },
    },
    {
      id: 'a-danger',
      name: '第四次尝试：只回滚 A 到更旧版本',
      desc: '【状态变更】A 回滚到 v2.8（更旧），期望"绕开"断点',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '第四次回滚结果（陷阱动作）',
        text: 'A v2.8 + B/C v2.9——又一个新组合：v2.8 不支持 B v2.9 已有的 channelSource 校验 →\n失败率 52%（新高）。\n→ 复盘点评：在组合漂移的世界里，"更旧"不等于"更安全"——没有锚点，每次回滚都是掷骰子。',
      },
    },
    {
      id: 'a-fixanchor',
      name: '沉淀：锚点版本组合制度',
      desc: '【状态变更】发布平台增加"链路锚点"：同链路服务发布登记组合快照，回滚必须锚点级',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '锚点制度',
        text: '① 发布前自动登记"链路版本组合快照"（A/B/C + 共享协议版本）\n② 回滚操作只提供两种：单服务热修 / 锚点级整链回滚（禁用"各回各的"）\n③ 同链路多服务发布默认捆绑为一个发布单元（组合进预发全链路回归）。',
      },
    },
    {
      id: 'a-fixcontract',
      name: '沉淀：跨服务协议变更纪律',
      desc: '【状态变更】共享协议字段变更必须"双向兼容"（呼应 mixversion）：加字段先可选后必传，消费端宽容未知字段',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '协议纪律',
        text: 'promoBatch 事件的根因是"三服务同一晚各自改协议"：\n规范：跨服务字段变更走契约评审 + 兼容窗口（生产端可空 → 消费端宽容 → 再收紧）。\n兼容窗口存在时，任何"新旧混合组合"都能跑——回滚就不再需要完美对齐。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-combo', text: '促销引擎改造让 A/B/C 三服务同晚各自改协议（promoBatch 耦合）：三次"各回各的"回滚制造了三个未测试的组合，断点随组合在协议边上漂移——回滚对象应是"锚点版本组合"而非三个独立版本', correct: true },
    { id: 'rc-cache', text: '网关/客户端缓存污染新旧响应', correct: false },
    { id: 'rc-data', text: '新版本写入的数据格式旧版本不可读', correct: false },
    { id: 'rc-config', text: '共享配置被改写且未随回滚还原', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '"每个旧版本单独都是好的"——这句证词就是方向：单独好 = 组合坏。先建组合矩阵。',
      update: '四行组合、四次失败、四次不同症状——回滚在生成未测试组合，故障随组合漂移。',
      actionId: 'a-impact',
      why: '1⚡︎ 组合矩阵把"玄学般的故障跳跃"变成可读的表格：每一行是一个实验条件——故障随条件变化的规律立刻可见。',
      conclusion: '嫌疑锁定：版本组合漂移（h-combo 升权）。',
    },
    {
      thought: '读三份发布 diff 的耦合点——昨晚它们"共享"了什么。',
      update: '实锤：promoBatch 字段三服务耦合，任意新旧混合组合各有一个协议断点。',
      actionId: 'a-tripletcheck',
      why: '2⚡︎ 协议耦合图是本案的机制核心：故障不在某个服务里，在"边"上——三次回滚搬动的是边两端的版本，断点必然随之漂移。',
      conclusion: '根因实锤：组合漂移。',
    },
    {
      thought: '锚点回滚立即可行性验证：回到 19:00 的组合，它是唯一"被测试过"的。',
      update: '锚点组合恢复基线——机制的反向验证：被测组合好、未测组合坏，铁证。',
      actionId: 'a-anchorroll',
      why: '1⚡︎ 锚点回滚同时是修复与验证：它证明"组合"理论（被测过的组合才安全），也是止血动作本身——一箭双雕。',
      conclusion: '双向确认 → 排除旁支。',
    },
    {
      thought: '缓存/数据/配置三个"另类解释"各 1⚡︎ 排除——第四次回滚陷阱点评后收束到制度。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（组合漂移）✓ 反验（锚点恢复）✓ 防线（锚点制度+协议纪律）✓——个案、机制、防线三层闭合。',
      conclusion: '沉淀：分布式回滚是组合动作——先锚点、后回滚；没有锚点组合，每次回滚都是一次新的发布。',
    },
  ],

  lessons: [
    {
      text: '分布式回滚是组合动作：三个服务"各回各的"，制造的是三个从未测试过的版本组合——故障不消失，只搬家。',
      principle: '假设思维：跨服务链路的版本是一张"组合表"不是三个数字。回滚前先建组合矩阵，回滚只提供两种合法操作：单服务热修 / 锚点级整链回滚。被测试过的组合才是安全区。',
    },
    {
      text: '"我的服务回滚后是好的"是真相的一半：故障可以不在任何服务里，而在服务之间的协议边上。',
      principle: '全栈视野：排查跨服务故障时，把"边"（协议耦合）当作一等公民审计——共享字段的变更让每条边都成为潜在断点。单独压测每个服务全绿 ≠ 组合可用。',
    },
    {
      text: '在组合漂移的世界里，"更旧"不等于"更安全"：第四次回滚滚到 v2.8，失败率创了新高。',
      principle: '程序设计：回滚的安全性来自"被测试过"，不来自"版本号更旧"。跨服务协议变更必须双向兼容（加字段先可选后必传、消费端宽容未知字段）——兼容窗口是让"任意组合都能跑"的根本手段，它存在时回滚才不需要完美对齐。',
    },
  ],
}
