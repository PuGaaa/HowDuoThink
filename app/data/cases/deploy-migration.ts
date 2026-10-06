import { DiagnosisCase } from '../../types/case'

/**
 * 第 10 章 · 部署与发布 第二批（回滚不完整 L2）
 * 教学点：验证思维——回滚的边界必须画全：应用可回退，schema 走过的路退不回去；
 * migration 必须向后兼容（N-1），回滚预案必须包含数据层评估。
 * 专家路径：impact(1) + colcheck(2) + instver(1) = 4⚡︎
 */
export const deployMigrationCase: DiagnosisCase = {
  id: 'deploy-migration',
  title: '回滚之后，故障反而变成 100%',
  intro: '紧急回滚后接口大面积 500：代码回到了旧版本，数据库却回不去了——回滚脚本只覆盖了应用层。',
  domain: 'deploy',
  layer: '应用可以退回去，schema 走过的路退不回去——回滚边界必须画全',
  part: 'master',
  chapterId: 'deployment',
  order: 5,
  typeTags: ['deploy', 'data', 'rollback'],
  difficulty: 2,

  scene: {
    role: '你是「票到手」订单服务的发布负责人，昨晚经历了一次"教科书式回滚"——然后全面故障。',
    architecture: '订单服务(应用包可回滚) → MySQL 订单表(migration 已执行, 无 down 脚本)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '回滚后监控',
        text: '下单接口错误率：3%（回滚前，金额精度问题部分场景）→ 100%（回滚后）\n错误：SQLIntegrityConstraintViolationException: Field "currency" doesn\'t have a default value',
      },
      {
        type: 'text',
        title: '回滚记录',
        text: '回滚决策与执行无可挑剔：21:40 决策、21:50 应用层全部回退到 v2.9。\n执行完后错误率反而飙满——回滚"成功"了，服务挂了。',
      },
    ],
    timeline: '昨晚 21:00 v3.0 发布（应用+migration 同包执行：订单表新增 currency 列）｜ 21:40 发现金额精度缺陷决策回滚 ｜ 回滚脚本覆盖范围：应用包 + 配置（无数据库步骤）',
    impactHint: '回滚前只有 3% 场景出错，回滚后 100% 出错——"回到旧版本"和"回到旧状态"是两件事。',
  },

  hypotheses: [
    { id: 'h-notnull', text: 'migration 加了 NOT NULL 无默认值的新列：旧代码 INSERT 不带该列，回滚后写入全挂', excludeActionId: 'a-colcheck' },
    { id: 'h-instver', text: '回滚不完整：部分实例还在 v3.0，新旧混跑互相不兼容', excludeActionId: 'a-instver' },
    { id: 'h-cache', text: '缓存/配置残留新版本数据结构，旧代码反序列化失败', excludeActionId: 'a-cachecfg' },
    { id: 'h-data', text: 'v3.0 存续期间写入的"新格式"数据，旧代码读不了', excludeActionId: 'a-rowcheck' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定回滚后的故障面',
      desc: '影响面：读/写路径、错误类型、与回滚前对比',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '故障面分析',
        text: '读路径：正常（订单查询零错误）\n写路径：100% 失败，全部是 INSERT 约束报错（currency 列）\n回滚前：仅 3%（金额精度部分场景）\n→ 回滚"修好"了 3%，"炸掉"了 97%——故障从部分场景变成全部写入。错误指向数据库层。',
      },
    },
    {
      id: 'a-colcheck',
      name: '比对表结构与新旧版本 INSERT 语句',
      desc: 'schema 与代码的契约对质',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-notnull'],
      hypotheses: [{ id: 'h-notnull', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'schema vs 代码',
        text: '表结构：currency CHAR(3) NOT NULL（无 DEFAULT）← v3.0 migration 新增\nv3.0 代码：INSERT 15 列，含 currency ✓\nv2.9 代码：INSERT 14 列，不含 currency ✗\nmigration 目录：只有 up 脚本，无 down——列回不去了。\n实锤：schema 走在代码前面一步，回滚后旧代码的 INSERT 缺列必炸。',
      },
    },
    {
      id: 'a-instver',
      name: '核对全部实例的版本哈希',
      desc: '排除"回滚不完整"',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-instver'],
      hypotheses: [{ id: 'h-instver', status: 'excluded' }],
      result: {
        type: 'text',
        title: '实例版本核对',
        text: '12 个实例镜像哈希全部为 v2.9——应用层回滚是完整的。\n→ 排除混跑：恰恰因为"回滚得太完整"，旧代码撞上了回不去的 schema。',
      },
    },
    {
      id: 'a-cachecfg',
      name: '核对缓存与配置回滚一致性',
      desc: '排除缓存残留',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cache'],
      hypotheses: [{ id: 'h-cache', status: 'excluded' }],
      result: {
        type: 'text',
        title: '缓存/配置核对',
        text: '配置中心已回滚且版本一致；缓存对象序列化与列无关。\n→ 排除缓存问题。',
      },
    },
    {
      id: 'a-rowcheck',
      name: '抽查 v3.0 存续期写入的数据行',
      desc: '排除"新格式脏数据"假说',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-data'],
      hypotheses: [{ id: 'h-data', status: 'excluded' }],
      result: {
        type: 'text',
        title: '数据抽查',
        text: 'v3.0 存续 40 分钟写入 1,842 行（带 currency 值）；旧代码 SELECT 显式列名读取，多出的列不影响。\n→ 排除脏数据：读路径本就正常，问题只在写路径缺列。',
      },
    },
    {
      id: 'a-miglist',
      name: '审计 migration 与回滚预案的规范',
      desc: '为什么回滚脚本里没有数据库步骤',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '规范审计',
        text: '① migration 规范：从未要求"向后兼容"（N-1），NOT NULL 无默认值直上\n② 回滚预案模板：只有"应用回滚"章节，无"数据层评估"步骤\n③ 团队认知："migration 不可回滚"是常识，但没人把它写进预案。\n→ 制度缺口：回滚的边界靠记忆，不靠清单。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急 DDL：删除 currency 列',
      desc: '【状态变更】直接删列让 schema 回到 v2.9 形状',
      cost: 2,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '删列结果（陷阱动作）',
        text: '下单立即恢复。代价：1,842 行的 currency 值丢失（未提前备份，靠事后从日志拼回 1,719 行）。\n大表 DDL 锁表 90 秒，读路径也抖了一次。\n→ 复盘点评：为了"回到旧形状"丢真数据、锁全表——修复选错了代价最小路径。',
      },
    },
    {
      id: 'a-hotfix',
      name: '正解：旧代码热修 INSERT 补默认值',
      desc: '【状态变更】v2.9 热修：INSERT 补 currency = "CNY"，schema 不动',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '热修结果',
        text: 'v2.9 热修版本 15 分钟上线：INSERT 补列（默认 CNY），数据零丢失、零锁表。\n下单恢复，1,842 行新数据全部保留。\n→ schema 不动、代码兼容——数据层问题的最小代价修复。',
      },
    },
    {
      id: 'a-fixcompat',
      name: '落地 migration 兼容规范',
      desc: '【状态变更】扩列必须可空/带默认；删列改型拆两版；迁移与代码的先后顺序写进规范',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '规范 v2',
        text: '① 扩列：NULLABLE 或带 DEFAULT（旧代码零感知）\n② 删列/改型：拆两个版本——先停写旧列（双写过渡），下个版本再删\n③ 兼容矩阵：每个 migration 必须声明"与哪一代代码兼容"。',
      },
    },
    {
      id: 'a-fixrunbook',
      name: '回滚预案加入"数据层评估"步骤',
      desc: '【状态变更】回滚检查单：migration 是否可回滚/是否需兼容层/数据是否需迁移，逐项确认',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '预案 v2',
        text: '回滚预案模板新增数据层三问：\n□ 本次 migration 是否破坏 N-1 兼容？\n□ 回滚后旧代码能否读写当前 schema？\n□ 需要的兼容动作（热修/兼容层/数据回迁）是什么？\n三问不过，应用回滚不许执行。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-notnull', text: 'v3.0 migration 新增 NOT NULL 无默认值的 currency 列（migration 无 down 且不可自动回滚），应用回滚后 v2.9 的 INSERT 缺列——写入 100% 失败；回滚预案无数据层评估步骤', correct: true },
    { id: 'rc-instver', text: '回滚不完整，新旧实例混跑不兼容', correct: false },
    { id: 'rc-cache', text: '缓存/配置残留新版本数据结构导致反序列化失败', correct: false },
    { id: 'rc-data', text: 'v3.0 期间写入的新格式数据无法被旧代码读取', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '回滚前 3% 回滚后 100%——回滚改变了什么？先看故障面：读正常、写全炸，错误指向 INSERT。',
      update: '故障被回滚"精确改道"：金额精度问题消失，写入缺列问题出现——两个问题、两个版本、一层 schema。',
      actionId: 'a-impact',
      why: '1⚡︎ 对比回滚前后的故障面是最便宜的时间机器：它直接指认"变化发生在 schema 与代码的交界处"。',
      conclusion: '嫌疑锁定：schema 与旧代码的兼容性（h-notnull 升权）。',
    },
    {
      thought: 'schema 与两版代码的 INSERT 对质——契约谁变了、谁没跟上，一比便知。',
      update: '实锤：NOT NULL 无默认值 + v2.9 INSERT 缺列 + migration 无 down——结构实锤。',
      actionId: 'a-colcheck',
      why: '2⚡︎ 契约对质把"回滚后为什么炸"从谜语变成一行 SQL 报错——数据层回滚不可行是本案例的物理事实，必须先确认它再谈修复。',
      conclusion: '根因实锤：回滚边界漏了数据层。',
    },
    {
      thought: '"回滚不完整"假设要单独关掉——如果真有实例没回滚，修复方向完全不同。',
      update: '镜像哈希全对齐：应用层回滚完整。恰恰是这份完整，让旧代码全面撞上新 schema。',
      actionId: 'a-instver',
      why: '1⚡︎ 排除得干净才能修复得笃定：版本核对 1⚡︎ 买断"混跑"叙事，防止团队在错误方向上再折腾一小时。',
      conclusion: '嫌疑收敛：兼容性缺口，非执行缺口。',
    },
    {
      thought: '审计规范与预案：为什么这类回滚会发生——缺口在个人失误还是制度盲区。',
      update: 'migration 无兼容要求、回滚预案无数据层章节——制度性缺口，下一次发布还会踩。',
      actionId: 'a-miglist',
      why: '1⚡︎ 沉淀思维的分界：修"这一晚"靠热修，修"每一晚"靠规范与预案——制度缺口找到了，修复才算到根。',
      conclusion: '修复三件套：热修止血 + 兼容规范 + 回滚预案 v2。',
    },
    {
      thought: '止血（热修补默认值，而不是删列）、制度（兼容规范）、预案（数据层三问）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（缺列必炸）✓ 边界（数据层不可回滚）✓ 制度（预案缺章）✓——技术事实与流程缺口都闭合。',
      conclusion: '沉淀：回滚的边界 = 一切不可自动回退的状态（schema、数据、外部系统）。应用回滚脚本只是回滚的一半。',
    },
  ],

  lessons: [
    {
      text: '应用可以退回旧版本，数据库走过的路退不回去：回滚边界必须画到"一切不可自动回退的状态"。',
      principle: '发布设计：回滚 = 应用包 + 配置 + schema + 数据 + 外部系统的完整评估。migration 没有自动 down 是常态（生产数据经不起反向 DDL），所以回滚预案必须显式回答"数据层怎么办"，而不是默认它不存在。',
    },
    {
      text: 'migration 必须向后兼容（N-1）：扩列可空或带默认，删列改型拆两版——schema 与代码永远只差半步。',
      principle: '滚动更新与快速回滚的前提是"任何时刻旧代码能跑在新 schema 上"。兼容矩阵（每个 migration 声明兼容哪一代代码）是数据层与发布层之间的契约文件。',
    },
    {
      text: '修复要选代价最小的路径：删列丢了数据还锁了表，热修 INSERT 补默认值零丢失零锁表——殊途同归时选便宜的。',
      principle: '状态变更前的代价评估：多个修复路径都能"恢复服务"时，比较数据丢失、锁表时长、可逆性三个维度。"回到旧形状"是执念，"恢复服务且代价最小"才是目标。',
    },
  ],
}
