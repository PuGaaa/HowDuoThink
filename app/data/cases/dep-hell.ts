import { DiagnosisCase } from '../../types/case'

/**
 * 第 3 章 · 构建与依赖（依赖版本冲突教学关）
 * 教学点："我这里好好的"= 依赖树差异；锁文件是依赖版本的真相；报错指纹（xxx is not a function）。
 * 专家路径：impact(1) + diff(1) + lockfile(2) = 4⚡︎
 */
export const depHellCase: DiagnosisCase = {
  id: 'dep-hell',
  title: '同事拉完代码就白屏',
  intro: '新功能开发完在同事机器上联调，同事的页面一打开就报错白屏，你和自己机器都正常。',
  domain: 'build',
  layer: '依赖解析：package.json 声明范围，锁文件锁定真相',
  part: 'apprentice',
  chapterId: 'build',
  order: 2,
  typeTags: ['dependency', 'config'],
  difficulty: 1,

  scene: {
    role: '你是前端开发，和同事结对开发新功能，同事拉完你的分支后页面报错。',
    architecture: 'package.json（版本范围）→ lockfile（锁定版本）→ node_modules（实际安装）',
    symptoms: [
      {
        type: 'error',
        title: '同事的浏览器控制台',
        text: "TypeError: dayjs.default is not a function\n at formatDate (utils/date.ts:12)\n→ 页面白屏，报错指向日期工具函数",
      },
      {
        type: 'text',
        title: '两台机器对比',
        text: '你的机器：一切正常\n同事机器：npm install 后一运行就白屏\n同一个分支、同一份代码。',
      },
    ],
    timeline: '上周你给项目新增了 dayjs 依赖（package.json 写的是 ^1.10.0）｜ 昨天同事拉分支',
    impactHint: '同分支同代码不同结果——差异只能在代码之外。',
  },

  hypotheses: [
    { id: 'h-lock', text: '两台机器的依赖版本不同（锁文件不一致/未提交）', excludeActionId: 'a-diff' },
    { id: 'h-env', text: '同事的 Node/npm 环境版本不同', excludeActionId: 'a-env' },
    { id: 'h-code', text: '代码里日期工具函数写错了', excludeActionId: 'a-coderead' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '确认复现范围',
      desc: '谁的白屏：新拉代码的都白还是只有同事',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '复现范围',
        text: '删掉 node_modules 重装后：同事依旧白屏；\n第三位同事新拉代码也白屏；只有你（写代码的机器）正常。',
      },
    },
    {
      id: 'a-coderead',
      name: '读报错行的日期工具代码',
      desc: 'dayjs.default is not a function 的含义',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-code'],
      hypotheses: [{ id: 'h-code', status: 'excluded' }],
      result: {
        type: 'code',
        title: '报错行代码',
        text: "import dayjs from 'dayjs'\ndayjs.default.format(...)  ← 错误行\n→ dayjs.default 存在于旧版 dayjs（1.x 的 CJS 兼容层），新版 1.12 移除了 .default——\n代码是为旧版 API 写的。",
      },
    },
    {
      id: 'a-diff',
      name: '对比两台机器的依赖版本',
      desc: 'npm ls dayjs 看实际安装的版本',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-lock'],
      hypotheses: [{ id: 'h-lock', status: 'confirmed' }],
      result: {
        type: 'code',
        title: 'npm ls 对比',
        text: '你的机器:   dayjs@1.10.0\n同事机器:   dayjs@1.12.0\n→ 同一个 package.json（^1.10.0），实际装的版本不同！',
      },
    },
    {
      id: 'a-lockfile',
      name: '查 lockfile 的 git 状态',
      desc: '锁文件有没有被提交、有没有被改',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-lock'],
      hypotheses: [{ id: 'h-lock', status: 'up' }],
      result: {
        type: 'code',
        title: 'git 状态',
        text: '.gitignore 里赫然写着：package-lock.json\n→ 锁文件根本没进版本库！每台机器 install 时各自解析最新版本。',
      },
    },
    {
      id: 'a-reinstall',
      name: '让同事删 node_modules 重装',
      desc: '按 lockfile 之外的方式验证版本漂移',
      cost: 2,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-lock'],
      hypotheses: [{ id: 'h-lock', status: 'up' }],
      result: {
        type: 'text',
        title: '重装结果',
        text: '重装后 dayjs 还是 1.12——因为锁文件缺失，每次安装都解析到最新。重装修复不了"没有锁"的问题。',
      },
    },
    {
      id: 'a-pin',
      name: '临时固定版本验证',
      desc: '把 dayjs 钉在 1.10.0 让同事重装',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-lock'],
      hypotheses: [{ id: 'h-lock', status: 'confirmed' }],
      result: {
        type: 'code',
        title: '固定版本结果',
        text: '"dayjs": "1.10.0"（去掉 ^）→ 同事重装后 1.10.0，白屏消失！\n→ 实锤闭环：版本就是根因。',
      },
    },
    {
      id: 'a-timeline',
      name: '问时间线：上周拉的代码正常吗',
      desc: '确定版本漂移发生的时间窗',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '时间线',
        text: '同事上周拉的代码正常，昨天重新 install 后白屏——时间窗与你加 dayjs 的时间吻合。',
      },
    },
    {
      id: 'a-env',
      name: '对比两台机器 Node/npm 版本',
      desc: '排除环境版本差异',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-env'],
      hypotheses: [{ id: 'h-env', status: 'excluded' }],
      result: {
        type: 'text',
        title: '环境对比',
        text: '两台机器 Node 20.11 / npm 10.2 完全一致——环境相同，差异只在依赖解析结果。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-lock', text: 'lockfile 被 gitignore，同事安装时 ^范围解析到了更新的 dayjs（1.12），API 不兼容导致报错', correct: true },
    { id: 'rc-env', text: '两台机器 Node 环境版本不同导致行为差异', correct: false },
    { id: 'rc-code', text: '日期工具函数代码本身有 bug', correct: false },
  ],

  expertCost: 4,
  restartActionId: '',

  expertChain: [
    {
      thought: '同分支同代码不同结果——差异必然在代码之外：依赖、环境、配置。',
      update: '三分支：依赖版本 / 环境版本 / 代码本身。先圈复现范围。',
      actionId: 'a-impact',
      why: '1⚡︎ 圈范围：新装机器都白、只有自己正常——"写代码的机器正常"是依赖漂移的经典指纹。',
      conclusion: '复现范围确认 → 排除偶发，是系统性的环境差异。',
    },
    {
      thought: '报错指纹很有信息量：dayjs.default is not a function——.default 是旧版 CJS 兼容层的产物。',
      update: '代码假设了旧版 API → 依赖版本假设升权。读一行代码排除 h-code。',
      actionId: 'a-coderead',
      why: '1⚡︎ 读报错行：错误指纹直接告诉我们代码是为旧版 API 写的——版本假设从"猜"变成"基本确定"。',
      conclusion: '代码依赖旧版 dayjs 的 .default → 谁装了新版谁就会白屏。',
    },
    {
      thought: '验证版本假设最直接的办法：npm ls 对比两台机器的实际版本。',
      update: '实锤：1.10.0 vs 1.12.0，同一份 package.json 装出不同版本。',
      actionId: 'a-diff',
      why: '1⚡︎ 一条命令实锤版本差异——白屏机器必然解析到了 1.12。',
      conclusion: '版本漂移实锤。接下来查"为什么会漂"：锁文件。',
    },
    {
      thought: '版本漂移的根源几乎只有一种：锁文件没锁住。查 git 里 lockfile 的状态。',
      update: '根因实锤：lockfile 被 gitignore。',
      actionId: 'a-lockfile',
      why: '1⚡︎ 一眼定根因：锁文件没进版本库 = 每台机器各自解析 ^范围 = 时间越往后装到的版本越新。',
      conclusion: '根因实锤。修复：从 gitignore 移除 lockfile 并提交，全员重装。',
    },
    {
      thought: '证据链闭合：指纹（API 不存在）→ 版本漂移实锤 → 根因（锁文件未提交）。停止。',
      update: '停止。修复 + 团队规范：禁止 gitignore lockfile。',
      actionId: '',
      why: '根因、修复、预防措施全部明确。',
      conclusion: '提交 lockfile + 固定 dayjs 版本 + 全员删除 node_modules 重装。同事白屏消失。',
    },
  ],

  lessons: [
    {
      text: 'package.json 写的是"版本范围"，lockfile 才是"实际版本"——后者必须进版本库。',
      principle: '^1.10.0 的含义是"1.10.0 到 2.0.0 之间都行"：不同时间 install 会装到不同版本。lockfile 把范围钉死成唯一解，是团队依赖一致性的唯一保障。',
    },
    {
      text: '"xxx is not a function" 常是依赖版本漂移的指纹：代码假设的 API 在新版本里变了。',
      principle: '依赖更新遵循语义化版本，但 Minor/Major 更新可能移除 API。锁文件保证所有人拿到同一个版本，这类"装新装旧各不同"的诡异 bug 就不会存在。',
    },
    {
      text: '同代码不同结果 = 差异在代码之外：依赖、环境、配置、数据。',
      principle: '排查"我这里好好的"类问题的固定清单：依赖版本（npm ls / pip freeze）→ 运行环境版本 → 环境变量/配置 → 数据。逐一对比，差异点即嫌疑点。',
    },
  ],
}
