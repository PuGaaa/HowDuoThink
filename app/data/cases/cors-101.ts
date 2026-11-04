import { DiagnosisCase } from '../../types/case'

/**
 * 学徒篇校准：简单跨源GET的响应授权而非虚构预检。
 * 原型：新开发origin未获CORS授权；教学重建，不冒充原始事故日志。
 * 六维：1/1/1/1/2/1，中位数半档向下取整，L1。
 * 标准路径：a-impact → a-console → a-options；替代顺序：a-impact → a-options → a-console。
 * 技术依据与编审见 content/baselines/t04b-apprentice-calibration.md。
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
    architecture: '浏览器http://localhost:3000 → HTTPS API https://api.example.com/api/user（普通无凭证GET）',
    symptoms: [
      { type: 'error', title: '浏览器控制台报错', text: '普通fetch GET，无自定义头且credentials:omit。控制台：No \'Access-Control-Allow-Origin\' header is present；这次请求不需要OPTIONS预检。' },
      { type: 'text', title: '前端补充', text: 'Network可看到该GET返回200及JSON；页面JS的fetch仍拒绝。curl不执行浏览器同源访问策略。' },
    ],
    timeline: '今天上午新前端环境第一次联调后端 ｜ 后端接口无变更（其他调用方都正常）',
    impactHint: '只有一个前端页面报错，还是所有调用方都受影响？',
    tag: '教学重建',
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
      hypotheses: [
        { id: 'h-server', status: 'down' },
      ],
      result: { type: 'text', title: '影响范围', text: '只有新前端的 localhost:3000 页面报错；\nApp 端、小程序端、老页面（同域部署）全部正常。' },
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
      hypotheses: [
        { id: 'h-cors', status: 'up' },
      ],
      result: { type: 'code', title: '完整报错与请求形态', text: '完整调用是fetch("https://api.example.com/api/user",{credentials:"omit"})，GET且无自定义头。该请求满足无需预检的条件；GET已经发出，浏览器因实际响应缺ACAO而不向JS交付。' },
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
      hypotheses: [
        { id: 'h-server', status: 'excluded' },
      ],
      result: { type: 'text', title: '服务端日志', text: '同一request-id的/api/user GET已处理并返回200；没有对应OPTIONS记录，因为这次GET无需预检。服务端200本身不保证浏览器有权读取。' },
    },
    {
      id: 'a-options',
      name: '核对实际GET响应与网关来源表',
      desc: '本次没有预检；核对实际响应而非凭空查OPTIONS',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cors', 'h-server', 'h-auth'],
      hypotheses: [
        { id: 'h-cors', status: 'confirmed' },
        { id: 'h-server', status: 'excluded' },
        { id: 'h-auth', status: 'excluded' },
      ],
      result: { type: 'code', title: '实际响应与单变量配置对照', text: '同一个GET请求：200，Content-Type:application/json，JSON为用户列表而非登录错误；无Access-Control-Allow-Origin。\n网关允许来源只有https://app.example.com，没有http://localhost:3000；受控仅加入该精确origin后同GET可由JS读取。\n本题无凭证，不涉及ACAC；修复实际响应授权即可。' },
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
      hypotheses: [
        { id: 'h-auth', status: 'down' },
      ],
      result: { type: 'text', title: '网络面板', text: '同一GET已发出，Origin为http://localhost:3000；响应200但缺ACAO。Network可查看响应不代表页面脚本可读取。' },
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
      hypotheses: [
        { id: 'h-cors', status: 'up' },
      ],
      result: { type: 'text', title: '无痕重试', text: '无痕窗口同样报 CORS——不是缓存，是配置本身缺失。' },
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
      result: { type: 'text', title: '配置文档', text: '网关按精确origin（协议、主机、端口）登记开发来源。复杂或带非简单头的请求还需预检授权，本题普通GET没有预检。' },
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
      hypotheses: [
        { id: 'h-auth', status: 'excluded' },
      ],
      result: { type: 'text', title: '请求详情', text: '同一请求返回200和预期JSON，不是401；仍需独立检查CORS授权，HTTP成功不等于脚本可读取。' },
    },
  ],
  rootCauses: [
    { id: 'rc-cors', text: '服务端 CORS 配置未包含新前端的来源域名，浏览器拦截了响应', correct: true },
    { id: 'rc-server', text: '接口服务端异常返回错误', correct: false },
    { id: 'rc-auth', text: '登录态失效导致接口拒绝', correct: false },
  ],
  expertCost: 4,
  restartActionId: '',
  expertChain: [
    { actionId: 'a-impact', thought: '先确认具体调用方。', update: '只有localhost页面失败。', why: '1⚡用不同调用方的结果定位浏览器授权边界，先控制范围。', conclusion: '不据此排除所有服务端配置。' },
    { actionId: 'a-console', thought: '先确定实际方法与请求头。', update: '普通无凭证GET已发出，无需预检。', why: '1⚡区分实际响应与预检失败。', conclusion: '检查这次实际GET的授权。' },
    { actionId: 'a-options', thought: '核对同一请求响应和来源表。', update: '200正确JSON但缺ACAO；精确加入origin后恢复。', why: '2⚡关联状态、来源配置和对照结果。', conclusion: 'CORS成立，500和401均排除。' },
    { actionId: '', thought: '停止；按开发来源精确授权并复验实际GET。其他使用非简单头/方法的接口另验OPTIONS，不能把本题结论扩成所有跨源请求均先预检。', update: '停止收集，转入有针对性的处置。', why: '必要证据已能区分主要假设；继续收集同类材料不会改变当前处置，修复后再按相同条件复验。', conclusion: '停止；按开发来源精确授权并复验实际GET。其他使用非简单头/方法的接口另验OPTIONS，不能把本题结论扩成所有跨源请求均先预检。' },
  ],
  lessons: [
    { text: '浏览器同源策略、HTTP成功与页面脚本可读取是三个不同判断。', principle: '普通跨源GET可先到服务端再被阻止读取；预检失败时实际业务请求通常不会发送，不能混为同一条日志。' },
    { text: '不是每个跨源请求都有OPTIONS。', principle: '根据方法、请求头等条件决定是否预检。本题普通无凭证GET应核对实际响应ACAO，复杂请求还要检查预检。' },
    { text: 'curl正常不能独立证明浏览器授权正确。', principle: '命令行客户端不代替浏览器实施页面同源策略；联调时同时保留控制台、实际请求响应与网关来源配置。' },
  ],
}
