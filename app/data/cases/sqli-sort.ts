import { DiagnosisCase } from '../../types/case'

/**
 * 第 11 章 · 安全攻防 第二批（动态排序 SQL 注入 L2）
 * 教学点：安全思维——ORM 参数化只覆盖"值"，列名/关键字拼接是绕过它的暗门；
 * "默认已泄露"处置原则：注入可达即按泄露流程走，不赌"应该没拖库"。
 * 专家路径：impact(1) + sortaudit(2) + egress(1) = 4⚡︎
 */
export const sqliSortCase: DiagnosisCase = {
  id: 'sqli-sort',
  title: 'ORDER BY 里的一条缝，全表差点被拖走',
  intro: '安全审计通报：订单导出接口存在 SQL 注入。ORM 防住了 WHERE 的值，排序字段却直接拼进了 SQL。',
  domain: 'data',
  layer: '参数化覆盖的是值，不是结构——列名拼接是 ORM 的暗门',
  part: 'master',
  chapterId: 'security',
  order: 8,
  typeTags: ['security', 'data'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」的应用安全工程师，审计扫描刚刚报出一条高危：订单导出接口 SQL 注入。',
    architecture: '运营后台 → 订单导出接口(MyBatis: WHERE 参数化 / ORDER BY 字符串拼接) → MySQL(订单表: 手机号/地址/金额)',
    tag: '安全事件现场',
    symptoms: [
      {
        type: 'error',
        title: '审计扫描报告',
        text: 'URL: /order/export?sortField=(SELECT CASE WHEN (SUBSTRING(version(),1,1)=%{common}) THEN id ELSE name END)\n行为特征：布尔盲注探测成功——响应按注入条件分支变化，可逐字符拖库。',
      },
      {
        type: 'text',
        title: '代码现状',
        text: 'Mapper XML：WHERE 子句全部 #{param} 参数化 ✓\n排序子句：ORDER BY ${sortField} ${sortOrder} —— ${} 直接拼接 ✗',
      },
    ],
    timeline: '导出功能三周前上线 ｜ 审计今天通报 ｜ 订单表含手机号/收货地址/金额（数据分级：敏感）｜ 访问日志保留 30 天',
    impactHint: '注入通道找到了，接下来两个问题：它被利用过吗？除了通道还有几扇门？',
  },

  hypotheses: [
    { id: 'h-sortsqli', text: 'ORDER BY 动态字段拼接注入：${} 占位符绕过了 ORM 参数化，列名/关键字无白名单', excludeActionId: 'a-sortaudit' },
    { id: 'h-authz', text: '导出接口权限缺失：任意登录运营可导出全量敏感字段（独立的越权风险）', excludeActionId: 'a-authzcheck' },
    { id: 'h-leak', text: '数据已被实际拖走：存在批量外发或异常导出记录', excludeActionId: 'a-egress' },
    { id: 'h-waf', text: 'WAF 规则滞后是主因：拦截失效导致注入可达', excludeActionId: 'a-waflog' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '审计访问日志找利用痕迹',
      desc: '影响面：注入被探测/利用过吗、来自谁、拖了多少',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '访问日志审计（30 天）',
        text: '注入特征请求：47 次（布尔盲注载荷，version()/substring 探测）\n来源：内网 IP × 2（关联账号：一台测试机 + 一个离职员工账号已停用）\n批量导出记录：无（导出量分布正常）\n→ 有探测、无拖库迹象——但处置原则不赌"没拖成"：按已泄露走流程。',
      },
    },
    {
      id: 'a-sortaudit',
      name: '代码审计 + 注入复现',
      desc: '注入通道的机制确认：为什么 ORM 没防住',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-sortsqli'],
      hypotheses: [{ id: 'h-sortsqli', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '通道解剖',
        text: 'WHERE：#{param} → 预编译参数，值无法改变语句结构 ✓\nORDER BY：${sortField} ${sortOrder} → 文本拼接进语句 ✗\n（参数化在协议层面只绑定"值"；列名/关键字是语句结构，只能拼）\n复现：sortField=IF(1=1,id,name) 执行成功 → 结构可控确认。\n修复唯一正解：白名单映射（sortKey → 预定义列名），拒绝一切直拼。',
      },
    },
    {
      id: 'a-authzcheck',
      name: '审计导出接口的权限设计',
      desc: '通道之外的第二扇门：谁能导出什么',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-authz'],
      hypotheses: [{ id: 'h-authz', status: 'down' }],
      result: {
        type: 'text',
        title: '权限审计',
        text: '导出接口仅有登录态校验：全部 300 名运营可导出全量敏感字段（含手机号明文）。\n→ 独立缺陷确认（越权/过度授权），与注入通道并行存在——注入修了它还在，必须一起修：数据分级权限 + 脱敏。',
      },
    },
    {
      id: 'a-egress',
      name: '排查数据外发痕迹',
      desc: 'DLP/网关流量/导出记录三路并查',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-leak'],
      hypotheses: [{ id: 'h-leak', status: 'excluded' }],
      result: {
        type: 'text',
        title: '外发排查',
        text: 'DLP 无大体积敏感外发；网关出网流量正常；导出量分布无异常峰。\n探测来源关联的离职账号数据访问已随停用终止。\n→ "无实际泄露"仅是当前证据——处置仍按"默认已泄露"：通报、评估、留档。',
      },
    },
    {
      id: 'a-waflog',
      name: '核对 WAF 拦截记录',
      desc: '评估边界防御的表现',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-waf'],
      hypotheses: [{ id: 'h-waf', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'WAF 审计',
        text: '拦截了 12 条特征明显的经典载荷；布尔盲注变体全部穿透。\n→ 排除 WAF 作为主因：边界防御是纵深的一层，不是根因层——根治永远在代码（白名单），WAF 治标。',
      },
    },
    {
      id: 'a-danger',
      name: '紧急下线导出接口',
      desc: '【状态变更】注入通道物理关闭，业务停摆',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '下线结果',
        text: '接口下线，通道关闭。运营日报依赖此功能，业务侧需临时人工导出。\n→ 风险窗口关闭优先于业务连续性：注入通道每小时都开着，日报可以等一天。',
      },
    },
    {
      id: 'a-fixwhitelist',
      name: '修复：排序白名单映射',
      desc: '【状态变更】sortKey→列名枚举映射；修复后注入回归测试通过',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 前端传 sortKey（枚举），服务端映射到白名单列名；未知 sortKey 直接 400\n② sortOrder 限定 ASC/DESC 枚举\n③ 审计载荷回归：47 条历史探测全部 400，盲注条件不再影响结果集。',
      },
    },
    {
      id: 'a-fixauthz',
      name: '沉淀：敏感导出分级权限 + 脱敏',
      desc: '【状态变更】导出按数据分级授权；手机号/地址默认脱敏 + 导出审计日志',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '权限 v2',
        text: '① 导出权限按角色分级：普通运营仅脱敏字段，明文需专岗审批\n② 每次导出留审计日志（谁、何时、什么范围、多少行）\n→ 即使未来再出现注入或越权，敏感明文的暴露面已被缩到最小。',
      },
    },
    {
      id: 'a-fixscan',
      name: '沉淀：${} 拼接静态扫描',
      desc: '【状态变更】CI 检出 Mapper 中 ${} 即标记人工审查；SORT 类接口强制白名单清单',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '工具守门',
        text: '静态扫描上线：全仓查出 6 处 ${} 拼接（3 处 ORDER BY、2 处动态表名、1 处动态列），逐个白名单化。\n新代码含 ${} 拦截合并，直到评审确认无法白名单化。',
      },
    },
    {
      id: 'a-fixdefault',
      name: '沉淀："默认已泄露"处置原则',
      desc: '【状态变更】注入类漏洞处置 SOP：通报/评估/留档不依赖"是否实际拖库"的判断',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: 'SOP v2',
        text: '注入可达即按泄露流程走：① 2h 内通报 ② 影响面按"通道开放时长 × 数据分级"评估 ③ 全程留档。\n理由：拖库证据可以被抹掉，"没有证据"不等于"没有发生"——赌赢没收益，赌输是灾难。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-sortsqli', text: 'ORDER BY ${sortField} ${sortOrder} 字符串拼接：ORM 参数化只覆盖"值"，列名/关键字属语句结构必须拼接——白名单缺失使布尔盲注可达（探测 47 次，暂无拖库证据）', correct: true },
    { id: 'rc-authz', text: '导出接口无数据分级权限，敏感字段全量可导（并行缺陷）', correct: false },
    { id: 'rc-leak', text: '数据已被实际批量拖走', correct: false },
    { id: 'rc-waf', text: 'WAF 规则滞后未拦截盲注（边界层非根因层）', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '注入通道确认了，安全排查的下一问永远是"被利用过吗"——审计 30 天访问日志找利用痕迹。',
      update: '47 次盲注探测、2 个内网来源、无批量导出——有试探无得手迹象，处置按"默认已泄露"走。',
      actionId: 'a-impact',
      why: '1⚡︎ 漏洞的严重性 = 可达性 × 利用痕迹 × 数据分级——日志审计把第一问（被利用过吗）变成有据可答，处置级别随之确定。',
      conclusion: '利用面评估完成 → 解剖通道机制。',
    },
    {
      thought: '解剖注入通道：为什么"参数化"的接口还是可注入——机制搞不清，修复就会打偏。',
      update: '实锤：参数化只绑定值（#{}），ORDER BY 的 ${} 拼接列名属语句结构——白名单是唯一正解。',
      actionId: 'a-sortaudit',
      why: '2⚡︎ 安全修复的质量取决于机制理解：不知道参数化的边界（值 vs 结构），就会以为"用了 ORM 所以安全"——这个认知盲区正是这类漏洞的温床。',
      conclusion: '通道机制闭合 → 修复方向唯一：白名单映射。',
    },
    {
      thought: '通道之外看第二扇门：导出接口本身有没有过度授权——注入修了，门还在不在。',
      update: '确认并行缺陷：全量运营可导明文敏感字段——分级权限与脱敏列入同批整改。',
      actionId: 'a-authzcheck',
      why: '1⚡︎ 安全排查的横向视野：一个通报暴露的往往是一个攻击面，不是一个洞——"注入通道 × 越权门"组合的实际风险远大于单算。',
      conclusion: '整改范围扩大到权限层。',
    },
    {
      thought: '外发排查给"默认已泄露"原则落地：有没有拖库不重要，流程不赌运气。',
      update: '三路排查无外发证据——仍按泄露流程通报留档；WAF 定位为辅助层。',
      actionId: 'a-egress',
      why: '1⚡︎ 处置原则的价值在反面案例：赌"没拖成"赢了没有收益，输了是灾难——安全流程的设计要假设对手比你幸运。',
      conclusion: '处置与整改清单齐备。',
    },
    {
      thought: '止血（下线通道）、修复（白名单）、横向（权限分级）、纵深（${} 扫描 + SOP）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】通道（拼接注入）✓ 利用面（探测无拖库）✓ 并行缺陷（越权）✓ 纵深（扫描+SOP）✓——点到面、修到防两层闭合。',
      conclusion: '沉淀：参数化覆盖值不覆盖结构——动态列名/表名的唯一安全解是白名单。安全处置赌不得：默认已泄露。',
    },
  ],

  lessons: [
    {
      text: 'ORM 参数化只覆盖"值"，不覆盖语句结构：ORDER BY/表名/列名的动态拼接是绕过它的暗门，白名单映射是唯一正解。',
      principle: '安全思维：#{ } 绑定值、${ } 拼接文本——两者的安全语义完全不同。动态结构的白名单（sortKey→列名枚举）+ 静态扫描拦截 ${} 是这套防御的工具化落地；"用了 ORM"从来不是"免疫注入"的同义词。',
    },
    {
      text: '"默认已泄露"处置原则：注入通道开着的时候，赌"没人利用"没有收益——通报/评估/留档不依赖实际拖库的证据。',
      principle: '安全流程：拖库证据可以被抹掉，"没有证据"不等于"没有发生"。处置级别由"通道开放时长 × 数据分级"决定，而不是由"有没有抓到现行"决定——安全流程的设计假设是对手比你幸运。',
    },
    {
      text: '一个通报暴露的是一个攻击面，不是一个洞：注入通道 × 越权导出 × 明文字段——修复要横向扫一遍门。',
      principle: '纵深防御：通道（白名单）、门（数据分级权限）、保险（脱敏+审计日志）三层各自独立成立——任何一层失守，敏感数据的暴露面仍有下限。WAF 是边界辅助层，根治永远在代码。',
    },
  ],
}
