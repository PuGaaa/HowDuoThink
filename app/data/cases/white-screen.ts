import { DiagnosisCase } from '../../types/case'

/**
 * 第 3 章 · 构建与依赖（白屏教学关）
 * 教学点：白屏=运行时 JS 报错中断渲染；资源 404 与接口报错是两类指纹；本地正常线上挂 = 环境差异。
 * 专家路径：impact(1) + console(1) + resources(2) = 4⚡︎
 */
export const whiteScreenCase: DiagnosisCase = {
  id: 'white-screen',
  title: '上线后的白屏',
  intro: '今晚发版后，部分用户打开页面就是一片白。你本地却怎么也复现不了。',
  domain: 'build',
  layer: '构建产物：本地跑的是源码，用户跑的是打包产物——差异就藏在里面',
  part: 'apprentice',
  chapterId: 'build',
  order: 1,
  typeTags: ['config', 'dependency'],
  difficulty: 1,

  scene: {
    role: '你是前端开发，今晚的版本刚上线，客服群开始有人反馈"页面白屏"。',
    architecture: '用户浏览器 → CDN(静态资源) → SPA 应用',
    symptoms: [
      {
        type: 'error',
        title: '用户侧现象',
        text: '打开页面一片白，无任何报错弹窗。刷新偶尔能恢复，过一会儿又白。',
      },
      {
        type: 'text',
        title: '你的本地环境',
        text: 'npm run dev 一切正常，怎么点都不白——"我这里好好的"。',
      },
    ],
    timeline: '20:00 发版后开始出现 ｜ 发版内容：新增了一个依赖库并升级了打包配置',
    impactHint: '是所有用户白屏还是部分？老版本用户有没有受影响？',
  },

  hypotheses: [
    { id: 'h-js', text: '线上 JS 运行时报错，渲染中断', excludeActionId: 'a-console' },
    { id: 'h-res', text: '静态资源（js/css）404 或版本错配', excludeActionId: 'a-resources' },
    { id: 'h-api', text: '首屏接口挂了，页面没数据白屏', excludeActionId: 'a-network' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '圈定白屏范围',
      desc: '全量用户还是部分？老版本用户白不白？',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '影响范围',
        text: '约 30% 用户白屏，且都是今晚之后**首次打开**的用户；\n打开过旧版本的用户（有缓存）全部正常。',
      },
    },
    {
      id: 'a-console',
      name: '让用户开控制台看报错',
      desc: '白屏的现场在浏览器控制台',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-js'],
      hypotheses: [{ id: 'h-js', status: 'confirmed' }],
      result: {
        type: 'error',
        title: '用户控制台（远程协助截图）',
        text: 'Uncaught SyntaxError: Unexpected token \'<\'  at app.8f3c2a.js:1\n→ JS 文件的第一行是 \'<\'——这是 HTML 的开头，说明拿到的是 HTML 不是 JS。',
      },
    },
    {
      id: 'a-resources',
      name: '查线上资源加载情况',
      desc: 'Network 面板看 js/css 是不是 404',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-res'],
      hypotheses: [{ id: 'h-res', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '资源加载详情',
        text: 'index.html 200（新版本，引用 app.8f3c2a.js）\napp.8f3c2a.js → 404 Not Found（CDN 边缘节点还缓存着旧的资源清单）',
      },
    },
    {
      id: 'a-network',
      name: '查首屏接口',
      desc: '排除接口问题',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-api'],
      hypotheses: [{ id: 'h-api', status: 'excluded' }],
      result: {
        type: 'text',
        title: '首屏接口',
        text: '接口全部 200 正常返回——但 JS 都没执行，接口好坏无关紧要。',
      },
    },
    {
      id: 'a-cache',
      name: '让用户清缓存重试',
      desc: '排除浏览器本地缓存问题',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-res'],
      hypotheses: [{ id: 'h-res', status: 'up' }],
      result: {
        type: 'text',
        title: '清缓存结果',
        text: '清缓存后正常了！但过几个小时新用户还是白屏——清缓存能救一个用户，救不了所有人。方向对，动作错。',
      },
    },
    {
      id: 'a-rollback',
      name: '回滚到上一版本',
      desc: '【状态变更】回滚静态资源',
      cost: 6,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '回滚结果',
        text: '回滚后白屏消失（旧资源清单在 CDN 有缓存）。\n业务恢复了，但根因还没找到——下次发版还会炸。',
      },
    },
    {
      id: 'a-source',
      name: '直接打开报错的 JS URL',
      desc: '看那个 404 的 JS 到底返回了什么',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-res'],
      hypotheses: [{ id: 'h-res', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'JS URL 响应内容',
        text: 'curl app.8f3c2a.js 返回：\n<!DOCTYPE html><html>...404 页面...\n→ 实锤第二个证据：404 的响应体是 HTML，被浏览器当 JS 执行。',
      },
    },
    {
      id: 'a-localbuild',
      name: '本地跑一次生产构建',
      desc: '复现打包产物环境而不是源码环境',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '本地构建',
        text: 'npm run build 后本地预览，同样白屏——终于复现了！问题在构建产物，不在源码。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-cdn', text: '发版后 HTML 引用了新哈希的 JS，但 CDN 边缘节点缓存了旧资源清单，新用户请求的 JS 文件 404，返回的 HTML 被当作 JS 解析报错白屏', correct: true },
    { id: 'rc-js', text: '新依赖的代码在运行时抛错中断渲染', correct: false },
    { id: 'rc-api', text: '首屏接口异常导致页面无数据白屏', correct: false },
  ],

  expertCost: 4,
  restartActionId: '',

  expertChain: [
    {
      thought: '"我本地好好的"是最危险的结论——本地跑的是源码，用户跑的是打包产物，环境不同。先圈范围。',
      update: '白屏的是无缓存的新用户 → 问题在新版本的资源链路上。',
      actionId: 'a-impact',
      why: '1⚡︎ 圈范围：有缓存用户正常 = 新旧资源交替问题，这是构建部署类的经典指纹。',
      conclusion: '只有首次打开的新用户白屏 → 聚焦新版本静态资源加载。',
    },
    {
      thought: '白屏 = 渲染没执行 = 运行时 JS 挂了。让用户截图控制台，现场就在那里。',
      update: 'JS 运行时报错实锤：Unexpected token \'<\'。',
      actionId: 'a-console',
      why: '1⚡︎ 拿到最关键线索：JS 文件内容是 HTML——「拿到的东西不对」比「代码写错了」更值得怀疑。',
      conclusion: 'JS 文件内容是 HTML → 排除代码 bug，指向资源 404（404 页面返回了 HTML）。',
    },
    {
      thought: '顺着"内容不对"查：资源请求的响应码是什么。',
      update: 'h-res 升权为第一。',
      actionId: 'a-resources',
      why: '2⚡︎ 实锤：404 + CDN 缓存旧清单——完整因果链闭合。',
      conclusion: '实锤：CDN 缓存策略问题，新 HTML 引用的 JS 在部分节点 404。',
    },
    {
      thought: '接口正常（反正 JS 没执行）、本地构建复现成功——因果链闭合，停止收集。',
      update: '停止。修复：CDN 缓存策略改为 index.html 不缓存/短缓存，资源文件长缓存。',
      actionId: '',
      why: '根因（CDN 缓存配置）已实锤，修复方案明确；继续收集不改变行动。',
      conclusion: '刷新 CDN + 调整缓存策略，白屏消失。沉淀：HTML 不缓存、带哈希的资源长缓存。',
    },
  ],

  lessons: [
    {
      text: '"本地好好的"不是证据：本地是源码，用户是打包产物——环境差异藏在构建里。',
      principle: '前端故障排查第一分叉：源码环境 vs 构建产物环境。本地构建一次（npm run build）是复现线上问题的基本功。',
    },
    {
      text: 'JS 文件报 "Unexpected token \'<\'" = 拿到的是 HTML——资源 404 的指纹。',
      principle: '静态资源 404 时服务端常返回 HTML 格式的 404 页面，浏览器把它当 JS 解析立即报语法错。这个指纹直指资源加载，而非代码。',
    },
    {
      text: '发版白屏三板斧：HTML 短缓存、带哈希资源长缓存、发布后刷 CDN。',
      principle: 'SPA 资源加载的契约：index.html 是入口必须永远最新，带内容哈希的 js/css 才能永久缓存——缓存策略错配是发版事故的头号来源。',
    },
  ],
}
