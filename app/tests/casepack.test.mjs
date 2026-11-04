import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const require = createRequire(import.meta.url)
const ts = require(process.env.THINK_REVIEW_TYPESCRIPT || resolve(root, 'web/node_modules/typescript'))

function harness() {
  const values = new Map([
    ['think_casepack_v1', JSON.stringify([{ id: 'legacy', title: '旧题', contentRevision: 1, actions: [], lessons: [] }])],
    ['think_pack_version', '1'],
  ])
  const requests = []
  const captures = []
  const writes = []
  const module = { exports: {} }
  const compiled = ts.transpileModule(readFileSync(resolve(root, 'app/utils/sync.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const context = vm.createContext({
    Map, uni: {
      getStorageSync: key => values.get(key) ?? null,
      setStorageSync: (key, value) => { writes.push(key); values.set(key, value) },
      request: request => requests.push(request),
    },
  })
  const wrapper = new vm.Script(`(function(require,module,exports){${compiled}\n})`).runInContext(context)
  wrapper(specifier => specifier === '../config' ? { API_BASE: 'http://review.test' } : {
    preserveLegacyChapterUnlocks: () => captures.push(values.get('think_casepack_v1')),
  }, module, module.exports)
  const response = (index, version, revision, title) => requests[index].success({ statusCode: 200, data: {
    version, count: 1, cases: [{ id: 'legacy', title, contentRevision: revision, actions: [], lessons: [] }],
  } })
  return { sync: module.exports, captures, writes, response }
}

test('请求发出前先冻结旧缓存资格，晚到旧响应不降低cursor或题目修订', () => {
  const h = harness()
  h.sync.fetchCasepack(() => {})
  h.sync.fetchCasepack(() => {})
  assert.equal(JSON.parse(h.captures[0])[0].title, '旧题')
  h.response(1, 3, 3, '新题')
  h.response(0, 2, 2, '晚到旧题')
  assert.equal(h.sync.getPackVersion(), 3)
  assert.equal(h.sync.getRemoteCases()[0].title, '新题')
  assert.deepEqual(h.writes, ['think_casepack_v1', 'think_pack_version'])
})

test('题目内容按contentRevision合并，较高发布游标不覆盖已缓存的新正文', () => {
  const h = harness()
  h.sync.fetchCasepack(() => {})
  h.response(0, 3, 3, '新修订')
  h.sync.fetchCasepack(() => {})
  h.response(1, 4, 2, '旧修订')
  assert.equal(h.sync.getPackVersion(), 4)
  assert.equal(h.sync.getRemoteCases()[0].title, '新修订')
})
