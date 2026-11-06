import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const require = createRequire(import.meta.url)
const ts = require(process.env.THINK_REVIEW_TYPESCRIPT || resolve(root, 'web/node_modules/typescript'))
const frozen = JSON.parse(readFileSync(resolve(root, 'content/baselines/course-20261104.json'), 'utf8'))

function harness() {
  const values = new Map()
  const progress = new Map()
  const unlocked = new Set()
  const remote = []
  const modules = new Map()
  let loggedIn = true
  const mocks = {
    'app/utils/storage.ts': {
      getCaseProgress: id => progress.get(id) || null,
      getUnlockedChapterIds: () => [...unlocked],
      rememberUnlockedChapterIds: ids => ids.forEach(id => unlocked.add(id)),
      progressIdentity: () => 'tester',
      progressStorageGet: key => values.get(key),
      progressStorageSet: (key, value) => values.set(key, value),
    },
    'app/utils/auth.ts': { isLoggedIn: () => loggedIn },
    'app/utils/sync.ts': { getRemoteCases: () => remote },
  }
  const context = vm.createContext({ Map, Set })
  function load(file) {
    file = resolve(file)
    const relative = file.slice(root.length + 1)
    if (mocks[relative]) return mocks[relative]
    if (modules.has(file)) return modules.get(file).exports
    const module = { exports: {} }
    modules.set(file, module)
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: file,
    }).outputText
    const wrapper = new vm.Script(`(function(require,module,exports){${compiled}\n})`, { filename: file }).runInContext(context)
    wrapper(specifier => {
      const target = resolve(dirname(file), specifier)
      return load(extname(target) ? target : existsSync(`${target}.ts`) ? `${target}.ts` : resolve(target, 'index.ts'))
    }, module, module.exports)
    return module.exports
  }
  const catalog = load(resolve(root, 'app/data/cases/index.ts'))
  const chapters = load(resolve(root, 'app/data/chapters.ts'))
  const course = load(resolve(root, 'app/data/course.ts'))
  return { catalog, chapters, course, values, progress, unlocked, remote, guest: () => { loggedIn = false } }
}

test('131道旧官方必修和16个挑战关按原目录冻结，新题默认选做', () => {
  const h = harness()
  assert.equal(h.course.MAINLINE_CASE_IDS.length, 131)
  for (const chapter of frozen.chapters) {
    assert.deepEqual([...h.course.COURSE_CASE_IDS[chapter.id]], chapter.requiredCaseIds)
    assert.equal(h.chapters.chapterChallengeCaseId(chapter.id), chapter.challengeCaseId)
  }
  h.remote.push({ ...h.catalog.ALL_CASES[0], id: 'new-practice', chapterId: 'error-reading', order: -100 })
  assert.equal(h.course.MAINLINE_CASE_IDS.includes('new-practice'), false)
  assert.equal(h.chapters.chapterChallengeCaseId('error-reading'), 'first-npe')
  assert.deepEqual(Array.from(h.chapters.casesInChapter('error-reading').slice(0, 4), c => c.id), ['first-npe', 'caused-by', 'log-correlation', 'async-swallow'])
})

test('游客只玩固定三题，增加题和修改排序都不挤占试玩资格', () => {
  const h = harness()
  h.guest()
  h.remote.push({ ...h.catalog.ALL_CASES[0], id: 'new-first', chapterId: 'error-reading', order: -100 })
  for (const id of ['first-npe', 'caused-by', 'log-correlation']) assert.equal(h.chapters.isCasePlayable(id), true)
  for (const id of ['async-swallow', 'new-first', 'ssl-chain-missing']) assert.equal(h.chapters.isCasePlayable(id), false)
})

test('主线未全通不提前解锁，全通后新增社区练习不重新锁章', () => {
  const h = harness()
  for (const id of h.course.COURSE_CASE_IDS['error-reading'].slice(0, 3)) h.progress.set(id, { solved: true })
  assert.equal(h.chapters.chapterCompleted('error-reading'), false)
  assert.equal(h.chapters.isChapterUnlocked('access'), false)
  for (const id of h.course.COURSE_CASE_IDS['error-reading']) h.progress.set(id, { solved: true })
  assert.equal(h.chapters.isChapterUnlocked('access'), true)
  h.remote.push({ ...h.catalog.ALL_CASES[0], id: 'community-extra', chapterId: 'error-reading', order: 0 })
  assert.equal(h.chapters.chapterCompleted('error-reading'), true)
  assert.equal(h.chapters.isChapterUnlocked('access'), true)
})

test('旧社区首关挑战资格在覆盖缓存前捕获，以后只增加', () => {
  const h = harness()
  h.remote.push({ ...h.catalog.ALL_CASES[0], id: 'legacy-challenge', chapterId: 'access', order: -1 })
  h.progress.set('legacy-challenge', { solved: true })
  h.chapters.preserveLegacyChapterUnlocks()
  assert.equal(h.unlocked.has('access'), true)
  h.remote.length = 0
  assert.equal(h.chapters.isChapterUnlocked('access'), true)
  assert.equal(h.chapters.chapterChallengeCaseId('access'), 'dns-hijack')
})

test('同ID采用更高contentRevision，修订比较不受发布游标影响', () => {
  const h = harness()
  const local = h.catalog.getCaseById('first-npe')
  h.remote.push({ ...local, contentRevision: 3, title: '修订后的标题', lessons: [{ text: '新版检查单' }], version: 1 })
  assert.equal(h.catalog.getCaseById('first-npe').title, '修订后的标题')
  assert.equal(h.chapters.casesInChapter('error-reading')[0].title, '修订后的标题')
  h.progress.set('first-npe', { solved: true })
  assert.equal(h.catalog.getCollectedLessons('').filter(item => item.text === '新版检查单').length, 1)
  h.remote[0] = { ...local, contentRevision: 2, title: '相同修订不覆盖包内题', version: 9999 }
  assert.equal(h.catalog.getCaseById('first-npe').title, local.title)
})
