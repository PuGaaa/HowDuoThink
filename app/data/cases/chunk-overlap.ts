import { DiagnosisCase } from '../../types/case'

/**
 * 第 3 章 · 构建与依赖 结业（非原子发布窗口 L2）
 * 教学点：验证思维——"发版窗口"是一场比赛：用户的请求与产物的覆盖在赛跑；
 * 原子切换（版本目录+软链）与旧资源保留期是静态资源的生命周期契约。
 * 专家路径：impact(1) + deploylog(2) + assetname(1) = 4⚡︎
 */
export const chunkOverlapCase: DiagnosisCase = {
  id: 'chunk-overlap',
  title: '每次发版的两分钟，总有人页面崩掉',
  intro: '发版那几分钟，线上用户页面随机崩：旧页面引用的 JS chunk 已被删——用户的请求和发布脚本在赛跑。',
  domain: 'build',
  layer: '发布窗口是一场比赛——旧资源的保留期要覆盖所有还活着的老页面',
  part: 'engineer',
  chapterId: 'build',
  order: 7,
  typeTags: ['build', 'deploy', 'race'],
  difficulty: 2,

  scene: {
    role: '你是「鲜到家」H5 商城的发布负责人，"发版必崩几个人"成了团队的都市传说。',
    architecture: 'CI 构建 → 部署脚本(先删旧目录再解压新包) → 源站(Nginx 静态) → 已打开页面的浏览器(懒加载 chunk)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '前端监控',
        text: 'ChunkLoadError：/assets/chunk-abc123.js 404\n崩溃 100% 集中在每次发版后约 2 分钟内；受影响用户全部是"发版前已打开页面"的人。',
      },
      {
        type: 'text',
        title: '发布脚本',
        text: '部署方式：rm -rf /var/www/app && unzip new.zip（先删后传，非原子）。\n崩溃用户的页面 HTML 是旧版本——它引用的 chunk 在"删掉"的那一刻就注定 404。',
      },
    ],
    timeline: '崩溃与发版逐次对应（近 30 次发版 28 次出现）｜ 懒加载路由的 chunk 在用户跳转时才请求 ｜ 每次发版约 90 秒完成',
    impactHint: '崩的是"旧页面"引用的"旧 chunk"——旧 chunk 是被谁删的？删的那一刻，还有谁的页面活着？',
  },

  hypotheses: [
    { id: 'h-window', text: '非原子发布：先删后传的 90 秒窗口内，旧 chunk 消失——已打开页面的懒加载请求落空', excludeActionId: 'a-deploylog' },
    { id: 'h-hash', text: 'chunk 无内容 hash 命名，新旧文件互相覆盖', excludeActionId: 'a-assetname' },
    { id: 'h-cdn', text: 'CDN 边缘与源站版本不一致，回源拿到 404', excludeActionId: 'a-edgecheck' },
    { id: 'h-manifest', text: '新版本自身的 chunk 引用错乱（构建 manifest 问题）', excludeActionId: 'a-buildmanifest' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '切分崩溃用户的共同点',
      desc: '影响面：他们持有哪版页面、请求发生在发版第几秒',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'code',
        title: '崩溃用户画像',
        text: '页面版本：全部是"发版前最后一次构建"的 HTML（旧页面）\n时间点：404 全部落在发版开始后 5~90 秒（= rm 执行后、解压完成前）\n请求内容：懒加载路由 chunk（用户此时才跳转触发）\n→ 崩溃 = 旧页面 × 发版窗口 × 懒加载时机——三者的交汇就是赛跑现场。',
      },
    },
    {
      id: 'a-deploylog',
      name: '逐秒对齐部署日志与 404 时间线',
      desc: '窗口内的"删"与"传"和崩溃的对应关系',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-window'],
      hypotheses: [{ id: 'h-window', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '逐秒时间线（某次发版）',
        text: 'T+0s   rm -rf /var/www/app        ← 旧 chunk 全部消失\nT+5s   首个 ChunkLoadError（用户此刻跳转懒加载）\nT+23s  unzip 进行中（部分文件就位）\nT+88s  解压完成 → 之后无 404\n404 时间戳 100% 落在 [T+0, T+88] 窗口内，窗口外零崩溃。\n实锤：先删后传的窗口 = 一个 90 秒的"合法故障期"。',
      },
    },
    {
      id: 'a-assetname',
      name: '核对 chunk 的命名策略',
      desc: '有 hash 吗、hash 能救它吗',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-hash'],
      hypotheses: [{ id: 'h-hash', status: 'down' }],
      result: {
        type: 'text',
        title: '命名核对',
        text: 'chunk 有内容 hash（chunk-abc123.js）——命名策略是对的。\n但删除是"整个目录 rm"：hash 再独特也随目录陪葬。\n→ 降权并入主因：hash 命名解决"互相覆盖"，解决不了"提前删除"——缺的是保留期，不是命名。',
      },
    },
    {
      id: 'a-edgecheck',
      name: '核对 CDN 回源行为',
      desc: '排除边缘层',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cdn'],
      hypotheses: [{ id: 'h-cdn', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'CDN 核对',
        text: '边缘 404 与源站 404 时间一致（回源透传）；直连源站同样 404。\n→ 排除 CDN：源头在源站的文件生命周期。',
      },
    },
    {
      id: 'a-buildmanifest',
      name: '核对新构建的 manifest 自洽性',
      desc: '排除新版本自身引用错乱',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-manifest'],
      hypotheses: [{ id: 'h-manifest', status: 'excluded' }],
      result: {
        type: 'text',
        title: 'manifest 核对',
        text: '新构建产物引用完整自洽；崩溃的是旧 HTML 对旧 chunk 的引用——旧版本没有错，错在"旧版本被物理抹除"。\n→ 排除构建问题。',
      },
    },
    {
      id: 'a-danger',
      name: '发版期间全量维护页',
      desc: '【状态变更】发版窗口内全站 503 维护页',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '维护页结果',
        text: '窗口竞争消失（没用户就没赛跑）。\n代价：每次发版全站停 2 分钟——用"全员陪葬"换"个别人不崩"，止血可以，常态化是灾难。',
      },
    },
    {
      id: 'a-fixatomic',
      name: '修复：原子发布 + 旧版本保留 24h',
      desc: '【状态变更】版本目录 + 符号链接原子切换；旧版本目录保留 24h',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '① 发布改为：传到 /app-<buildid>/ → ln -sfn 原子切换 current 链接（无窗口）\n② 旧版本目录保留 24 小时：已打开的旧页面引用的 chunk 全程可取\n③ 回归：连续 20 次发版，窗口期 404 = 0。',
      },
    },
    {
      id: 'a-fixprobe',
      name: '沉淀：发布窗口合成探测',
      desc: '【状态变更】发版期间合成用户持续访问懒加载路由，404 即告警',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '探测上线',
        text: '发版触发合成探测：模拟"打开旧页面→跳转懒加载"路径，404 即时告警。\n窗口竞争从"都市传说"变成"可观测的事件"——下次任何发布方式退化，第一分钟被抓。',
      },
    },
    {
      id: 'a-fixlifecycle',
      name: '沉淀：静态资源生命周期规范',
      desc: '【状态变更】删除旧资源前必答"谁还引用它"：已打开页面、缓存副本、分享链接',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '生命周期规范',
        text: '静态资源删除三问：已打开的页面还引用吗？缓存里还有副本吗？外部还挂着链接吗？\n保留期 = 三者中最长的存活时间——删除是比发布更危险的操作，因为它让"过去"失效。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-window', text: '非原子发布（rm -rf 旧目录后解压新包）制造 90 秒窗口：发版前已打开页面的懒加载 chunk 在窗口内 404——hash 命名正确但目录级删除让旧资源陪葬，无保留期机制', correct: true },
    { id: 'rc-hash', text: 'chunk 无内容 hash 命名，新旧文件互相覆盖', correct: false },
    { id: 'rc-cdn', text: 'CDN 边缘与源站版本不一致', correct: false },
    { id: 'rc-manifest', text: '新版本构建 manifest 引用错乱', correct: false },
  ],

  expertCost: 4,
  restartActionId: 'a-danger',

  expertChain: [
    {
      thought: '崩的是旧页面的懒加载——先切分崩溃用户：持有什么版本的页面、404 发生在发版第几秒。',
      update: '全部是旧页面持有者、404 全落发版窗口内——"窗口"成为主嫌疑，赛跑现场找到。',
      actionId: 'a-impact',
      why: '1⚡︎ 用户画像与时间轴的交叉，把"随机崩"收敛为"窗口内必崩"——窗口的存在本身就指向非原子操作。',
      conclusion: '嫌疑锁定：发布窗口（h-window 升权）。',
    },
    {
      thought: '部署日志与 404 时间线逐秒对齐——把窗口的每一秒和脚本的每一步对上。',
      update: '实锤：rm 与 unzip 完成之间 88 秒，404 全落此窗口——先删后传的窗口实锤。',
      actionId: 'a-deploylog',
      why: '2⚡︎ 逐秒对齐是竞态问题的显微镜：竞态的"随机性"其实是两个时间线的相对位置——对齐后每一次崩溃都有确定性的解释。',
      conclusion: '根因实锤：非原子发布窗口。',
    },
    {
      thought: 'hash 命名假设单独澄清——命名是对的但删法让 hash 失义，这层澄清决定修复方案。',
      update: 'hash 存在但被目录级删除陪葬——缺的是"保留期"，不是"命名"。',
      actionId: 'a-assetname',
      why: '1⚡︎ 澄清"对的机制为什么没起作用"：hash 命名与保留期是两个互补机制，混为一谈会让修复只做一半（换了命名照样崩）。',
      conclusion: '修复 = 原子切换 + 保留期，两者缺一不可。',
    },
    {
      thought: 'CDN 与 manifest 各 1⚡︎ 排除——分发层与构建层清场。',
      update: '边缘透传、manifest 自洽——问题收敛在源站文件生命周期。',
      actionId: 'a-edgecheck',
      why: '1⚡︎ 排除动作让修复不发散：窗口竞态的修复只涉及部署脚本与保留策略，CDN 与构建零改动。',
      conclusion: '嫌疑收敛单点。',
    },
    {
      thought: '止血（维护页）、修复（原子切换+保留期）、防线（合成探测+生命周期规范）。停止收集。',
      update: '停止。',
      actionId: '',
      why: '【停止规则】机制（非原子窗口）✓ 机制补全（hash 与保留期互补）✓ 防线（探测+三问）✓——三层闭合。',
      conclusion: '沉淀：发布窗口是一场比赛——原子切换让比赛不存在，保留期让迟到的选手也能到场。删除旧资源前，先数清还有谁活着。',
    },
  ],

  lessons: [
    {
      text: '发布窗口是一场比赛：用户的请求与产物的覆盖在赛跑——非原子的"先删后传"让这场比赛每天都有输家。',
      principle: '验证思维：发布必须原子化（版本目录 + 符号链接切换），窗口内不存在"半新半旧"的文件系统状态。竞态的随机性是时间线相对位置的确定性——逐秒对齐部署日志与错误时间线，比赛就现形了。',
    },
    {
      text: 'hash 命名与保留期是互补机制：hash 解决"互相覆盖"，保留期解决"提前删除"——缺一个，另一个白做。',
      principle: '程序设计：静态资源删除前三问——已打开页面还引用吗、缓存有副本吗、外链还挂着吗。保留期 = 最长存活时间；删除是比发布更危险的操作，它让"过去"失效。',
    },
    {
      text: '全量维护页是止血不是方案：用"全员陪葬"换"个别人不崩"，方向对但代价错——正确粒度是让竞争消失。',
      principle: '止血权衡：紧急措施要评估"代价覆盖面 vs 受益面"。维护页覆盖所有用户，受益者只是窗口内的懒加载用户——原子切换后维护页退役，保持发版不停服的初衷。',
    },
  ],
}
