import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname, extname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const require = createRequire(import.meta.url)
const ts = require(process.env.THINK_REVIEW_TYPESCRIPT || resolve(root, 'web/node_modules/typescript'))
const clone = value => JSON.parse(JSON.stringify(value))
const filename = name => resolve(root, `app/pages/${name}/${name}.uvue`)

function caseFixture() {
  const source = readFileSync(resolve(root, 'app/data/cases/first-npe.ts'), 'utf8')
  const name = source.match(/export const (\w+):/)[1]
  return new Function(source.replace(/^import.*$/gm, '').replace(`export const ${name}: DiagnosisCase`, `const ${name}`) + `; return ${name}`)()
}

function harness() {
  const original = { ...caseFixture(), contentRevision: 1 }
  let current = clone(original)
  const values = new Map([['real-user-progress', '{"plays":9}'], ['real-user-queue', '["pending"]']])
  const requests = []
  const calls = []
  const tracked = []
  let loggedIn = true
  const hooks = new Map()
  const cache = new Map()
  const saveSession = record => { calls.push('saveSession'); values.set('real-user-session', JSON.stringify(record)) }
  const getLastSession = () => values.has('real-user-session') ? JSON.parse(values.get('real-user-session')) : null
  const storage = {
    saveSession, getLastSession,
    bumpChecklistUse: () => calls.push('checklist'), bumpTask: () => calls.push('task'),
    recordSolvedLayer: () => { calls.push('layer'); return true },
  }
  const mocks = {
    'app/config.ts': { API_BASE: 'http://preview.review.test' },
    'app/data/cases/index.ts': { getCaseById: () => current, getCollectedLessons: () => [], MAINLINE_CASE_IDS: ['first-npe', 'caused-by', 'log-correlation', 'async-swallow'] },
    'app/data/chapters.ts': { isCasePlayable: () => true },
    'app/utils/storage.ts': storage,
    'app/utils/auth.ts': { isLoggedIn: () => loggedIn },
    'app/utils/login-guide.ts': { openGuestLoginDialog: id => calls.push('login:' + id) },
    'app/utils/learning-events.ts': { trackLearningEvent: (...args) => tracked.push(args) },
    'app/utils/remote-assets.ts': { getMascotUrl: () => '' },
    'app/utils/daily.ts': { isDailyCase: () => true, markDailyDone: () => calls.push('daily') },
    'app/utils/sync-progress.ts': { scheduleProgressUpload: () => calls.push('upload') },
  }
  const ref = value => ({ value })
  const context = vm.createContext({
    Date, Math, Map, Set, console,
    setTimeout: () => 1, clearTimeout: () => {},
    uni: {
      getStorageSync: key => values.get(key) ?? null,
      setStorageSync: (key, value) => values.set(key, value),
      removeStorageSync: key => values.delete(key),
      request: request => requests.push(request),
      showToast: () => {}, navigateBack: () => {}, redirectTo: () => {}, reLaunch: () => {},
    },
  })
  function load(file) {
    const relative = file.slice(root.length + 1)
    if (mocks[relative]) return mocks[relative]
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    let source = readFileSync(file, 'utf8')
    if (file.endsWith('.uvue')) {
      source = source.match(/<script setup lang="uts">([\s\S]*?)<\/script>/)[1]
      const exports = file === filename('play')
        ? 'previewId,selected,solved,playerCost,initializeCase,toggleChecklist,submitHypotheses,doExecute,finishAndSave'
        : file === filename('review') ? 'chainAll,lessons,playerCost,previewId,needsLogin,goNext' : 'cost,grade,solved,previewId'
      source += `\nexport { ${exports} }`
    }
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: file }).outputText
    const wrapper = new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInContext(context)
    wrapper(specifier => {
      if (specifier === 'vue') return { ref, computed: fn => ({ get value() { return fn() } }) }
      if (specifier === '@dcloudio/uni-app') return { onLoad: callback => hooks.set(file, callback) }
      let target = resolve(dirname(file), specifier)
      if (!extname(target)) target = target.endsWith('/cases') ? resolve(target, 'index.ts') : target + '.ts'
      return load(target)
    }, module, module.exports)
    return module.exports
  }
  function page(name, query = {}) {
    const file = filename(name)
    const api = load(file)
    hooks.get(file)(query)
    return api
  }
  return { original, values, requests, calls, tracked, page, load, getLastSession, guest: () => { loggedIn = false }, replace: value => { current = value } }
}

test('预览完整操作和复盘仅写独立预览空间，不写真实进度/任务/连续/队列/学习事件', () => {
  const h = harness()
  const before = clone([...h.values])
  const play = h.page('play', { previewId: 'preview-1', previewToken: 'scoped-token' })
  assert.equal(h.requests[0].header.Authorization, 'Bearer scoped-token')
  h.requests[0].success({ statusCode: 200, data: { payload: h.original } })
  play.toggleChecklist()
  play.selected.value = h.original.hypotheses.slice(0, 2).map(item => item.id)
  play.submitHypotheses()
  play.doExecute(h.original.actions[0])
  play.solved.value = true
  play.finishAndSave()
  const victory = h.page('victory', { previewId: 'preview-1' })
  const review = h.page('review', { previewId: 'preview-1' })
  assert.equal(victory.solved.value, true)
  assert.equal(review.lessons.value.length, h.original.lessons.length)
  assert.deepEqual([...h.values].filter(([key]) => !key.startsWith('think_preview_')), before)
  assert.deepEqual(h.calls, [])
  assert.deepEqual(h.tracked, [])
})

test('开局固定题目与sessionId，中途更新不改变终局评分版本或复盘正文', () => {
  const h = harness()
  const play = h.page('play', { id: h.original.id })
  h.replace({ ...h.original, contentRevision: 2, title: '更新后的题目', expertCost: 99, lessons: [{ text: '新版检查单' }], expertChain: [] })
  play.solved.value = true
  play.finishAndSave()
  const record = h.getLastSession()
  assert.equal(record.sessionId, h.tracked[0][1])
  assert.equal(record.contentRevision, 1)
  assert.equal(record.expertCost, h.original.expertCost)
  assert.equal(record.caseSnapshot.title, h.original.title)
  assert.equal(record.playerCost, 0)
  const victory = h.page('victory')
  const review = h.page('review')
  assert.equal(victory.cost.value, 0)
  assert.equal(review.lessons.value[0].text, h.original.lessons[0].text)
  assert.equal(review.chainAll.value.length, h.original.expertChain.length)
})

test('失效预览凭证不落地草稿、不写真实学习记录', () => {
  const h = harness()
  const before = clone([...h.values])
  h.page('play', { previewId: 'expired', previewToken: 'expired-token' })
  h.requests[0].success({ statusCode: 403, data: { detail: 'expired' } })
  assert.deepEqual([...h.values], before)
  assert.deepEqual(h.calls, [])
  assert.deepEqual(h.tracked, [])
})

test('第三关完整复盘后进入登录引导，携带第四关目标并保留复盘会话', () => {
  const h = harness()
  h.guest()
  const record = { sessionId: 'trial-3', caseId: 'log-correlation', solved: true, grade: 'S', playerCost: 4, expertCost: 4, wrongIdentifies: 0, contentRevision: 1, events: [], mascotEvents: [], hStates: [], caseSnapshot: { ...h.original, id: 'log-correlation' } }
  h.values.set('real-user-session', JSON.stringify(record))
  const review = h.page('review')
  assert.equal(review.needsLogin.value, true)
  review.goNext()
  assert.deepEqual(h.calls, ['login:async-swallow'])
  assert.deepEqual(h.getLastSession(), record)
})
