import { DiagnosisCase } from '../../types/case'

/**
 * B2-4 · security L2
 * 主训思维：安全思维（用户提供的 URL 是攻击向量：服务端发请求前必须校验目标）
 * 次训思维：全栈视野（云元数据接口/内网拓扑——SSRF 的经典目标）
 * 真实原型：图片预览功能无 URL 校验，被用于探测内网与读取云元数据凭证
 * 情绪兽设计：恐怖蛙（恐慌）——云凭证泄露是最高级别警报
 * 检查单：思维型 3 + 知识型 1
 */
export const ssrfCase: DiagnosisCase = {
  id: 'ssrf-internal',
  title: '图片预览功能，被用来打内网',
  intro: '安全应急通报：商品图片"URL 预览"功能被攻击者利用——输入一个内网地址，服务端替他去请求，云平台临时凭证已被读取。',
  domain: 'network',
  layer: '用户提供的 URL 是攻击向量：服务端替用户发请求之前，必须先回答"这个地址该去吗"',
  part: 'master',
  chapterId: 'security',
  order: 4,
  typeTags: ['security', 'network'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」内容服务的负责人。"图片 URL 预览"是你三个月前做的小功能——今天它上了安全应急通报的头条。',
    architecture: '攻击者 → 内容服务(预览功能, 有权访问内网) → 内网服务/云元数据接口',
    tag: '安全应急现场',
    symptoms: [
      {
        type: 'error',
        title: '安全应急通报',
        text: '出站请求日志发现：预览功能向 169.254.169.254（云元数据接口）与 10.0.3.21（内网订单库）发起过请求。\n元数据接口响应中含云平台临时凭证（AccessKey + Token）。',
      },
      {
        type: 'text',
        title: '预览功能实现',
        text: 'POST /api/preview { url: "..." }\n→ 服务端 fetch(url)，把响应的 content-type 判断是否图片，是则返回预览。\n→ 用户给什么 URL，服务端就去请求什么——包括内网。',
      },
    ],
    timeline: '预览功能上线 3 个月 ｜ 攻击行为确认发生在昨晚 22:00~23:40 ｜ 云凭证有效期：临时凭证 6 小时自动轮换',
    impactHint: '攻击者没碰你的服务器——是你的服务器替他伸进了内网。这个区别决定防护该加在哪。',
  },

  hypotheses: [
    { id: 'h-ssrf', text: '服务端直接请求用户提供的 URL 且无任何校验——SSRF 实锤', excludeActionId: 'a-code' },
    { id: 'h-auth', text: '云元数据接口缺少鉴权与网络隔离，被读取是必然', excludeActionId: 'a-meta' },
    { id: 'h-scanner', text: '扫描器误报：那些只是正常的图片 URL', excludeActionId: 'a-log' },
    { id: 'h-dns', text: 'DNS rebinding 高级攻击：域名解析被劫持绕过校验', excludeActionId: 'a-dns' },
  ],

  actions: [
    {
      id: 'a-log',
      name: '查预览功能的出站请求日志',
      desc: '它到底替用户请求过什么地址',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-ssrf'],
      hypotheses: [{ id: 'h-ssrf', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '出站请求日志',
        text: '预览功能 7 天出站请求 2.1 万次，其中：\n正常图片 URL 20997 次；\n169.254.169.254（云元数据）47 次；10.0.3.21:3306 探测 19 次；file:///etc/passwd 协议尝试 6 次。\n→ 攻击者系统性探测：从云凭证到内网端口，一路纵深推进。SSRF 实锤。',
      },
    },
    {
      id: 'a-code',
      name: '读预览功能的实现代码',
      desc: '请求之前有没有任何校验',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-ssrf'],
      hypotheses: [{ id: 'h-ssrf', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'preview.js 关键行',
        text: 'router.post("/api/preview", async (req, res) => {\n  const resp = await fetch(req.body.url)      ← 用户给什么，请求什么\n  const isImg = resp.headers["content-type"]?.startsWith("image/")\n  if (!isImg) return res.json({ err: "not image" })\n  ...\n})\n→ 唯一的"校验"是事后判断响应类型——请求早已发出。',
      },
    },
    {
      id: 'a-meta',
      name: '核对云元数据接口的防护',
      desc: '它为什么能被读到凭证',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-auth'],
      hypotheses: [{ id: 'h-auth', status: 'down' }],
      result: {
        type: 'text',
        title: '元数据接口核对',
        text: '云元数据接口（169.254.169.254）依赖网络隔离保护，无应用层鉴权；\n实例未开启"IMDSv2 强制 Token 模式"。\n→ 纵深防御缺口：SSRF 是攻击的"手"，元数据无防护是"没锁的门"——两边都要补。',
      },
    },
    {
      id: 'a-impact',
      name: '评估凭证泄露的影响面',
      desc: '临时凭证能做什么、还能用多久',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '影响面评估',
        text: '泄露凭证：实例绑定的 IAM 角色（可读对象存储特定桶、不可写）。\n有效期：临时凭证 6 小时轮换——攻击窗口有限但真实存在。\n凭证权限内对象存储：含用户上传图片 40 万张（非敏感类）。\n→ 高危但可控：立即轮换实例角色 + 审计桶访问日志。',
      },
    },
    {
      id: 'a-scanner',
      name: '排除扫描器误报',
      desc: '会不会是安全工具的正常行为',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-scanner'],
      hypotheses: [{ id: 'h-scanner', status: 'excluded' }],
      result: {
        type: 'text',
        title: '误报排除',
        text: '请求来源 IP 为公网用户（非安全工具 IP）；请求时间分布与人工操作一致。\n→ 真实攻击行为，非误报。',
      },
    },
    {
      id: 'a-dns',
      name: '分析 DNS rebinding 可能性',
      desc: '攻击是否用了高级绕过',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-dns'],
      hypotheses: [{ id: 'h-dns', status: 'down' }],
      result: {
        type: 'text',
        title: '攻击手法分析',
        text: '日志显示攻击者直接使用内网 IP 字面量（10.0.3.21）与元数据保留地址——\n未使用域名 rebinding 绕过（因为本来就没有校验可绕）。\n→ 初期攻击无需高级手法：这也说明"先加校验"比"防高级绕过"更紧迫。',
      },
    },
    {
      id: 'a-fixurl',
      name: '预览功能加 URL 校验防线',
      desc: '【状态变更】协议白名单 + 私网地址黑名单 + 禁跟随重定向',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '防线效果',
        text: '三道防线：① 仅允许 https 协议；② 解析后 IP 命中私网/保留地址段（10.x/169.254/127.x/内网域名）直接拒绝；③ fetch 禁止跟随重定向（防 302 跳内网）。\n回归测试：4 类攻击用例全部被拦，正常图片预览不受影响。',
      },
    },
    {
      id: 'a-keepfeature',
      name: '临时下线被拒——预览功能保持在线',
      desc: '【状态变更】业务方坚持预览是"刚需"，接受风险继续运行',
      cost: 2,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '这个决定的风险',
        text: '在 URL 校验修复上线前保持漏洞运行——攻击者每晚都能来读一次元数据。\n→ 修补 vs 下线之间还有第三条路：临时关闭 URL 预览入口（功能降级），而不是"带洞运行"。此选项作为反面教学。',
      },
    },
    {
      id: 'a-rotate',
      name: '轮换实例凭证并加固元数据',
      desc: '【状态变更】轮换 IAM 角色 + 开启 IMDSv2 强制 Token',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '加固结果',
        text: '实例 IAM 角色轮换（旧临时凭证立即失效）+ 审计桶访问日志（无敏感桶读取）；\n全量实例开启 IMDSv2 强制 Token 模式。\n→ 即使未来再出现 SSRF，元数据凭证也无法被读取——纵深防御补齐。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-ssrf', text: '预览功能直接请求用户提供的 URL，无协议/地址校验——服务端被当作跳板探测内网并读取云元数据凭证（SSRF）', correct: true },
    { id: 'rc-auth', text: '云元数据接口未启用 IMDSv2 强制 Token，依赖网络隔离单层防护', correct: false },
    { id: 'rc-scanner', text: '安全扫描器误报，实际是正常图片请求', correct: false },
    { id: 'rc-dns', text: 'DNS rebinding 高级绕过攻击', correct: false },
  ],

  expertCost: 7,
  restartActionId: 'a-rotate',

  expertChain: [
    {
      thought: '先看出站日志：预览功能到底替用户请求过什么——"有没有攻击行为"用事实回答。',
      update: '47 次云元数据请求 + 19 次内网探测 + file 协议尝试——系统性攻击实锤，SSRF 成立。',
      actionId: 'a-log',
      why: '1⚡ 出站日志是 SSRF 判断的事实源：攻击者探测的路径（元数据→内网端口→file 协议）暴露了他的完整意图。',
      conclusion: 'SSRF 实锤 → 读代码确认机制。',
    },
    {
      thought: '读预览实现：请求之前有没有校验——协议、地址、重定向，一道一道对。',
      update: '唯一"校验"是事后判断响应类型——请求早已发出。机制确认：零校验。',
      actionId: 'a-code',
      why: '2⚡ 直捣机制："事后判 content-type"挡不住任何攻击——请求已经发出、凭证已经泄露，校验必须在请求之前。',
      conclusion: '零校验实锤 → 三道防线（协议白名单/私网黑名单/禁重定向）设计确立。',
    },
    {
      thought: '攻击者拿到的凭证影响多大、窗口多久——决定应急级别。',
      update: '临时凭证 6 小时轮换 + 权限只读特定桶 → 高危但可控：轮换角色 + 审计桶日志。',
      actionId: 'a-impact',
      why: '2⚡ 影响面评估决定应急动作：凭证权限边界与有效期，就是这次事件的爆炸半径——评估它才能给出"轮换"这个正确动作。',
      conclusion: '应急动作确立：轮换实例凭证 + 元数据加固。',
    },
    {
      thought: '元数据无鉴权是纵深防御缺口——SSRF 是攻击的手，没锁的门是配合方。两边都修才算闭环。',
      update: '停止收集。应用层三道防线 + 云层 IMDSv2 强制——双层防御闭环。',
      actionId: '',
      why: '【停止规则】攻击行为实锤、应用机制实锤、云层缺口实锤、影响面可控——修复方案覆盖两层，无剩余假设。',
      conclusion: '应用三道防线 + 云元数据 IMDSv2 强制 + 凭证轮换——纵深防御完成。检查单：服务端发请求前必答"这个地址该去吗"。',
    },
  ],

  lessons: [
    {
      text: '用户提供的 URL 是攻击向量：服务端替用户发请求之前，必须回答"这个地址该去吗"。',
      principle: '安全思维：SSRF 的本质是"服务器被当作跳板"——凡是"输入 URL → 服务端请求"的功能（预览/导入/webhook/回调），都是 SSRF 的天然温床。',
    },
    {
      text: '云元数据接口（169.254.169.254）是 SSRF 的头号目标：它无鉴权、必可达、返回的是凭证。',
      principle: '全栈视野：应用层的 URL 校验（协议白名单+私网黑名单+禁重定向）与云层的 IMDSv2 强制 Token 必须同时做——单层防护的失效半径是一次完整入侵。',
    },
    {
      text: '"事后判响应类型"不是校验：请求已经发出、凭证已经泄露，响应里是不是图片无关紧要。',
      principle: '程序设计纪律：校验必须发生在副作用之前。fetch 之后才检查 content-type，等于先开了门再问身份。',
    },
    {
      text: '出站请求日志让 SSRF 现形：没有出站日志，这次攻击会无声进行下去。',
      principle: '可观测性：内网服务记录"被谁请求"与本服务记录"请求了谁"——双向出站日志是 SSRF 类攻击的检测线，也是影响面评估的证据源。',
    },
  ],
}
