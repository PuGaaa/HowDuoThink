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

const V2_PREFIX = 'think_casepack_v2/'

function harness(initial) {
  const values = new Map(initial)
  const requests = []
  const captures = []
  const writes = []
  const removes = []
  let reads = 0
  const module = { exports: {} }
  const compiled = ts.transpileModule(readFileSync(resolve(root, 'app/utils/sync.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const context = vm.createContext({
    Map, uni: {
      getStorageSync: key => { reads += 1; return values.get(key) ?? null },
      setStorageSync: (key, value) => { writes.push(key); values.set(key, value) },
      removeStorageSync: key => { removes.push(key); values.delete(key) },
      getStorageInfoSync: () => ({ keys: [...values.keys()] }),
      request: request => requests.push(request),
    },
  })
  const wrapper = new vm.Script(`(function(require,module,exports){${compiled}\n})`).runInContext(context)
  wrapper(specifier => specifier === '../config' ? { API_BASE: 'http://review.test' } : {
    preserveLegacyChapterUnlocks: () => {
      // 冻结快照 = 请求前 storage 里的有效案例集合（v2 拆分 key 单案例 + 旧 v1 整包）
      const snapshot = []
      for (const [k, v] of values) {
        if (k.startsWith(V2_PREFIX) || k === 'think_casepack_v1') {
          try {
            const parsed = JSON.parse(v)
            if (Array.isArray(parsed)) snapshot.push(...parsed)
            else snapshot.push(parsed)
          } catch (e) { /* 忽略 */ }
        }
      }
      captures.push(snapshot)
    },
  }, module, module.exports)
  const response = (index, version, cases) => requests[index].success({ statusCode: 200, data: {
    version, count: cases.length, cases,
  } })
  return { sync: module.exports, captures, writes, removes, values, response, readCount: () => reads };
}

const caseOf = (id, revision = 1, title = id) => ({ id, title, contentRevision: revision, actions: [], lessons: [] })

test('请求发出前先冻结旧缓存资格，晚到旧响应不降低cursor或题目修订', () => {
  const h = harness([
    [V2_PREFIX + 'legacy', JSON.stringify(caseOf('legacy', 1, '旧题'))],
    ['think_pack_version', '1'],
  ])
  h.sync.fetchCasepack(() => {})
  h.sync.fetchCasepack(() => {})
  assert.equal(h.captures[0][0].title, '旧题')
  h.response(1, 3, [caseOf('legacy', 3, '新题')])
  h.response(0, 2, [caseOf('legacy', 2, '晚到旧题')])
  assert.equal(h.sync.getPackVersion(), 3)
  assert.equal(h.sync.getRemoteCases()[0].title, '新题')
  assert.ok(h.writes.includes(V2_PREFIX + 'legacy'), '按案例 key 写入')
  assert.ok(!h.writes.includes('think_casepack_v1'), '不再整包单 key 写入')
  assert.ok(h.removes.includes('think_casepack_v1'), '旧整包 key 清理')
})

test('题目内容按contentRevision合并，较高发布游标不覆盖已缓存的新正文', () => {
  const h = harness([
    [V2_PREFIX + 'legacy', JSON.stringify(caseOf('legacy', 1, '旧题'))],
    ['think_pack_version', '1'],
  ])
  h.sync.fetchCasepack(() => {})
  h.response(0, 3, [caseOf('legacy', 3, '新修订')])
  h.sync.fetchCasepack(() => {})
  h.response(1, 4, [caseOf('legacy', 2, '旧修订')])
  assert.equal(h.sync.getPackVersion(), 4)
  assert.equal(h.sync.getRemoteCases()[0].title, '新修订')
})

test('getRemoteCases 进程内缓存：同一会话整包只读 storage 一轮', () => {
  const h = harness([
    [V2_PREFIX + 'a', JSON.stringify(caseOf('a'))],
    [V2_PREFIX + 'b', JSON.stringify(caseOf('b'))],
  ])
  const first = h.sync.getRemoteCases()
  assert.equal(first.length, 2)
  const afterFirst = h.readCount()
  h.sync.getRemoteCases()
  h.sync.getRemoteCases()
  assert.equal(h.readCount(), afterFirst, '缓存生效，后续调用零 storage 读取')
})

test('旧 v1 整包数据迁移：拆成按案例 key 并删除整包', () => {
  const h = harness([
    ['think_casepack_v1', JSON.stringify([caseOf('legacy', 1, '旧题')])],
    ['think_pack_version', '1'],
  ])
  const remote = h.sync.getRemoteCases()
  assert.equal(remote.length, 1)
  assert.equal(remote[0].title, '旧题')
  assert.ok(h.values.has(V2_PREFIX + 'legacy'), 'v2 拆分 key 已写入')
  assert.ok(!h.values.has('think_casepack_v1'), 'v1 整包已删除')
})

test('增量 delta 不包含的案例保留在本地（不含 ≠ 已删）', () => {
  const h = harness([
    [V2_PREFIX + 'legacy', JSON.stringify(caseOf('legacy', 1))],
    [V2_PREFIX + 'unchanged', JSON.stringify(caseOf('unchanged', 1))],
    ['think_pack_version', '1'],
  ])
  h.sync.fetchCasepack(() => {})
  h.response(0, 2, [caseOf('legacy', 2)])
  assert.equal(JSON.parse(h.values.get(V2_PREFIX + 'legacy')).contentRevision, 2, 'delta 命中的案例更新')
  assert.ok(h.values.has(V2_PREFIX + 'unchanged'), 'delta 未提及的案例保留')
  assert.deepEqual([...h.sync.getRemoteCases()].map(c => c.id), ['legacy', 'unchanged'])
})
