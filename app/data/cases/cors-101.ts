import { DiagnosisCase } from '../../types/case'

/**
 * 第 2 章 · 接入层之夜（CORS 教学关）
 * 教学点：CORS 是浏览器的安全机制不是服务器错误；报错在浏览器控制台而非服务端日志；预检请求。
 * 专家路径：impact(1) + console(1) + serverlog(1) + options(2) = 5⚡︎
 * 双路径：console 与 serverlog 可互换
 */
export const corsCase: DiagnosisCase = {
  id: 'cors-101',
  title: '前端说接口挂了',
  intro: '新前端同学联调时"接口全挂"，但后端用 curl 测试一切正常。',
  domain: 'network',
  layer: '同源策略：浏览器的安全边界，跨域需要服务端明确授权',
  part: 'apprentice',
  chapterId: 'access',
  order: 3,
  typeTags: ['config', 'cert'],
  difficulty: 1,

  scene: {
    role: '你是后端开发，新来的前端同学在工位上大喊"你的接口全挂了"！',
    architecture: '浏览器(localhost:3000) → API(api.example.com)',
    symptoms: [
      {
        type: 'error',
        title: '浏览器控制台报错',
        text: 'Access to XMLHttpRequest at \'https://api.example.com/user\' from origin \'http://localhost:3000\' has been blocked by CORS policy: No \'Access-Control-Allow-Origin\' header is present on the requested resource.',
      },
      {
        type: 'text',
        title: '前端补充',
        text: '「Network 面板里接口状态是 200，响应也有数据，但 JS 就是拿不到，一直走 catch！」——curl 直接请求接口返回正常。',
      },
    ],
    timeline: '今天上午新前端环境第一次联调后端 ｜ 后端接口无变更（其他调用方都正常）',
    impactHint: '只有一个前端页面报错，还是所有调用方都受影响？',
  },

  hypotheses: [
    { id: 'h-cors', text: '服务端没返回 CORS 授权头（跨域配置缺失）', excludeActionId: 'a-options' },
    { id: 'h-server', text: '接口真的挂了（服务端 500）', excludeActionId: 'a-serverlog' },
    { id: 'h-auth', text: '登录态失效，接口返回 401', excludeActionId: 'a-status' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '确认影响范围',
      desc: '是一个页面挂了还是所有调用方',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [{ id: 'h-server', status: 'down' }],
      result: {
        type: 'text',
        title: '影响范围',
        text: '只有新前端的 localhost:3000 页面报错；\nApp 端、小程序端、老页面（同域部署）全部正常。',
      },
    },
    {
      id: 'a-console',
      name: '读浏览器控制台完整报错',
      desc: '前端问题的第一现场在浏览器',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cors'],
      hypotheses: [{ id: 'h-cors', status: 'up' }],
      result: {
        type: 'error',
        title: '控制台报错',
        text: 'CORS policy: No \'Access-Control-Allow-Origin\' header is present——\n浏览器明确说：响应里没有跨域授权头，我拒绝把数据交给 JS。',
      },
    },
    {
      id: 'a-serverlog',
      name: '查服务端日志',
      desc: '接口在服务端到底有没有报错',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-server'],
      hypotheses: [{ id: 'h-server', status: 'excluded' }],
      result: {
        type: 'log',
        title: '服务端日志',
        text: '/api/user 请求 200 OK，零报错——服务端视角一切正常。\n→ "接口挂了"只发生在浏览器侧。',
      },
    },
    {
      id: 'a-options',
      name: '查 OPTIONS 预检请求响应头',
      desc: '看浏览器预检拿到了什么响应头',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cors'],
      hypotheses: [{ id: 'h-cors', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'OPTIONS 响应头',
        text: 'HTTP/1.1 204 No Content\nAccess-Control-Allow-Methods: GET, POST\n（缺失：Access-Control-Allow-Origin）\n→ 服务端 CORS 配置里没写允许的来源域名',
      },
    },
    {
      id: 'a-net',
      name: '抓浏览器网络面板完整请求',
      desc: '看请求是否真的发出、带了哪些头',
      cost: 2,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-auth', 'h-server'],
      hypotheses: [{ id: 'h-auth', status: 'down' }],
      result: {
        type: 'text',
        title: '网络面板',
        text: '请求正常发出、Origin 头正确、响应体完整——网络层没有问题。2⚡︎ 排除了本来就不太可能的怀疑。',
      },
    },
    {
      id: 'a-cache',
      name: '清缓存无痕重试',
      desc: '排除浏览器缓存的旧响应',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cors'],
      hypotheses: [{ id: 'h-cors', status: 'up' }],
      result: {
        type: 'text',
        title: '无痕重试',
        text: '无痕窗口同样报 CORS——不是缓存，是配置本身缺失。',
      },
    },
    {
      id: 'a-docs',
      name: '查服务端 CORS 配置文档',
      desc: '看网关的跨域配置说明',
      cost: 2,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-cors'],
      hypotheses: [],
      result: {
        type: 'text',
        title: '配置文档',
        text: '文档写着：跨域来源需在网关白名单申请。→ 修复路径清晰：给新前端域名申请白名单。',
      },
    },
    {
      id: 'a-status',
      name: '看请求状态码与响应体',
      desc: '排除登录态/业务错误',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-auth'],
      hypotheses: [{ id: 'h-auth', status: 'excluded' }],
      result: {
        type: 'text',
        title: '请求详情',
        text: '状态码 200，响应体 JSON 完整——业务层完全正常，纯粹是浏览器拒绝交付。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-cors', text: '服务端 CORS 配置未包含新前端的来源域名，浏览器拦截了响应', correct: true },
    { id: 'rc-server', text: '接口服务端异常返回错误', correct: false },
    { id: 'rc-auth', text: '登录态失效导致接口拒绝', correct: false },
  ],

  expertCost: 5,
  restartActionId: '',

  expertChain: [
    {
      thought: '前端说"接口挂了"，但我先用 1⚡︎ 圈影响面：是一个页面还是所有调用方？',
      update: 'App/小程序/老页面都正常 → 只有新环境的浏览器有问题。',
      actionId: 'a-impact',
      why: '1⚡︎ 的形状判断直接分叉：所有调用方挂是服务端问题，单个客户端挂是客户端环境问题。',
      conclusion: '只有新浏览器页面挂 → 服务端故障假设大幅降权。',
    },
    {
      thought: '控制台报错写得很清楚：CORS policy。但先别急着下结论，看服务端视角。',
      update: 'CORS 假设升权，但需要服务端证据收线。',
      actionId: 'a-serverlog',
      why: '1⚡︎ 排除"接口真挂了"——前后端各看半边，交叉验证是联调纠纷的破局点。',
      conclusion: '服务端 200 零报错 → "接口挂"只存在于浏览器侧，CORS 假设基本坐实。',
    },
    {
      thought: 'CORS 的机制是：浏览器先发 OPTIONS 预检问"允许谁"。看预检的响应头就是实锤。',
      update: '准备实锤。',
      actionId: 'a-options',
      why: '2⚡︎ 直接看预检响应头：缺 Access-Control-Allow-Origin 就是铁证，还能顺手看到该配什么。',
      conclusion: '实锤：CORS 配置缺 Allow-Origin。修复：服务端把 localhost:3000 加入允许来源。',
    },
    {
      thought: '状态码 200 + 响应完整 + 服务端零报错——证据链闭合，停止收集。',
      update: '停止。',
      actionId: '',
      why: '三个动作已经形成完整因果链（机制→证据→修复方案），再查是浪费。',
      conclusion: '修复：CORS 配置补 Allow-Origin。沉淀：CORS 是浏览器行为，报错只在控制台。',
    },
  ],

  lessons: [
    {
      text: 'CORS 报错在浏览器控制台，服务端日志看不到——联调纠纷先交换两边的"现场"。',
      principle: '同源策略是浏览器的安全机制：请求实际到达了服务端并被正常处理，是浏览器拒绝把响应交给页面 JS。所以服务端永远"一切正常"。',
    },
    {
      text: '状态码 200 但 JS 拿不到数据 = 典型 CORS 指纹。',
      principle: 'CORS 拦截发生在响应交付阶段而非请求阶段：请求成功、响应被扣。这个指纹能让你在 10 秒内识别它。',
    },
    {
      text: '预检请求（OPTIONS）的响应头是跨域配置的镜子。',
      principle: '复杂跨域请求前浏览器先发 OPTIONS 探问授权。预检响应头缺什么，服务端 CORS 配置就缺什么——实锤与修复方案一次拿到。',
    },
  ],
}
