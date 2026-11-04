import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hashContent } from '../pipeline/baseline.mjs'

const root = new URL('../../', import.meta.url)
const baseline = JSON.parse(readFileSync(new URL('t04b-apprentice-cases.json', import.meta.url), 'utf8'))
function load(file) {
  const s = readFileSync(new URL(file, root), 'utf8'), name = s.match(/export const (\w+)/)[1]
  return new Function(s.replace(/^import.*$/gm, '').replace('export const', 'const')
    .replace(new RegExp(`const ${name}: \\w+`), `const ${name}`) + `;return ${name}`)()
}
const source = readFileSync(new URL('app/utils/scoring.ts', root), 'utf8')
  .match(/export function computeGrade[\s\S]*?\n}/)[0]
  .replace('export ', '').replace(/:\s*(boolean|number|string)/g, '')
const grade = new Function(`${source};return computeGrade`)()

test('T04B学徒清单恰为23题且排除已校准首批四题', () => {
  assert.equal(baseline.count, 23)
  assert.equal(baseline.cases.length, 23)
  assert.equal(new Set(baseline.cases.map(c => c.id)).size, 23)
  for (const c of baseline.cases) assert.equal(['first-npe', 'caused-by', 'log-correlation', 'async-swallow'].includes(c.id), false)
})

for (const r of baseline.cases.filter(r => r.status === 'calibrated')) {
  const c = load(r.file)
  test(`${c.id}：校准哈希、六维、两条路径与终局语义`, () => {
    assert.equal(hashContent(c), r.calibratedHash)
    assert.equal(c.part, 'apprentice')
    assert.equal(c.chapterId, r.chapter)
    assert.equal(c.order, r.order)
    const dims = [...r.dimensions].sort()
    assert.equal(c.difficulty, Math.floor((dims[2] + dims[3]) / 2))
    if (c.difficulty === 3) assert.ok(dims.filter(x => x === 3).length >= 2)
    assert.equal(r.dimensionEvidence.length, 6)
    assert.notDeepEqual(r.paths[0].actions, r.paths[1].actions)
    assert.deepEqual(c.expertChain.filter(s => s.actionId).map(s => s.actionId), r.paths[0].actions)
    assert.equal(c.expertChain.at(-1).actionId, '')
    for (const path of r.paths) {
      const states = Object.fromEntries(c.hypotheses.map(h => [h.id, 'open']))
      let cost = 0
      assert.equal(new Set(path.actions).size, path.actions.length)
      if (path.name === '标准路径') assert.equal(path.actions[0], c.expertChain[0].actionId)
      for (const id of path.actions) {
        const a = c.actions.find(a => a.id === id)
        cost += a.cost
        for (const e of a.hypotheses) {
          if (!['excluded', 'confirmed'].includes(states[e.id]) || e.status === 'confirmed') states[e.id] = e.status
        }
      }
      assert.equal(cost, path.cost)
      assert.equal(cost, c.expertCost)
      assert.equal(grade(true, cost, c.expertCost, 0), 'S')
      for (const [id, status] of Object.entries(states)) assert.equal(status, r.expectedConfirmed.includes(id) ? 'confirmed' : 'excluded', id)
    }
    for (const a of c.actions.filter(a => a.danger)) {
      assert.ok(a.cost >= 8 && a.cost <= 10)
      assert.equal(a.gain, 'none')
    }
  })
}

test('多症状归一使用受控对照而非无前提的巧合概率', () => {
  const c = load('app/data/cases/symptom-cluster.ts')
  const check = c.actions.find(a => a.id === 'a-cointoss')
  assert.match(check.result.text, /同构核验/)
  assert.match(check.result.text, /只把缺失键/)
  assert.deepEqual(check.hypotheses, [{ id: 'h-onecause', status: 'confirmed' }, { id: 'h-three', status: 'excluded' }])
})

test('错误风暴区分报出超时与先行事件，标准路径包含全量关联覆盖', () => {
  const c = load('app/data/cases/first-domino.ts')
  const first = c.actions.find(a => a.id === 'a-firsterror').result.text
  assert.match(first, /01:14:03\.120.*等待30秒/)
  assert.match(first, /01:13:33/)
  assert.match(first, /01:13:20新SQL/)
  assert.match(c.actions.find(a => a.id === 'a-independence').result.text, /3000\+1200\+800=5000/)
  assert.equal(c.expertChain[2].actionId, 'a-independence')
})

test('Cookie题只有凭证模式成立，不能把三个候选同时标为根因', () => {
  const c = load('app/data/cases/cookie-lost.ts')
  const detail = c.actions.find(a => a.id === 'a-cookiedetail').result.text
  assert.match(detail, /SameSite=Lax; Max-Age=604800/)
  assert.match(detail, /跨源但同站/)
  assert.match(c.actions.find(a => a.id === 'a-fetchcode').result.text, /既不发送目标源Cookie，也不接纳响应的Set-Cookie/)
})

test('轮询题的QPS与容量算术能对账，304不减少调度次数', () => {
  const c = load('app/data/cases/poll-storm.ts')
  assert.equal(30 * 100 / 5, 600)
  assert.equal(30 * 12 / 60, 6)
  assert.ok(600 + 40 > 500)
  assert.equal(30 / 5 + 40, 46)
  assert.match(c.actions.find(a => a.id === 'a-timeraudit').result.text, /30页×100个÷5秒=600QPS/)
  assert.match(c.actions.find(a => a.id === 'a-backendlog').result.text, /总46QPS/)
  assert.match(c.actions.find(a => a.id === 'a-fixcache').result.text, /不会把600次请求自动变成6次/)
})

test('性能分段总和3秒，金额单位方向不再写反', () => {
  const timing = load('app/data/cases/waterfall-read.ts')
  assert.equal(Math.round((0.10 + 2.36 + 0.24 + 0.20 + 0.10) * 100), 300)
  assert.match(timing.actions.find(a => a.id === 'a-impact').result.text, /代理CONNECT协商2.36s/)
  assert.match(timing.actions.find(a => a.id === 'a-repro').result.text, /总耗时约0.68s/)
  const amount = load('app/data/cases/mock-canyon.ts')
  assert.equal(880 / 100, 8.8)
  assert.equal((8.8 / 100).toFixed(3), '0.088')
  assert.match(amount.actions.find(a => a.id === 'a-impact').result.text, /缩小100倍/)
})

test('构建与发布题保留关键协议和部署边界', () => {
  const white = load('app/data/cases/white-screen.ts')
  assert.match(white.actions.find(a => a.id === 'a-console').result.text, /模块脚本未执行/)
  assert.match(white.actions.find(a => a.id === 'a-resources').result.text, /200，Content-Type:text\/html/)
  const dep = load('app/data/cases/dep-hell.ts')
  assert.match(dep.actions.find(a => a.id === 'a-diff').result.text, /3\.10\.1.*4\.17\.21/)
  assert.match(dep.actions.find(a => a.id === 'a-coderead').result.text, /_\.pluck/)
  const ci = load('app/data/cases/ci-cache-pollution.ts')
  assert.match(JSON.stringify(ci), /未执行npm ci/)
  const image = load('app/data/cases/image-tag-drift.ts')
  assert.match(image.actions.find(a => a.id === 'a-pullpolicy').result.text, /字段省略时默认Always/)
  const chunk = load('app/data/cases/chunk-overlap.ts')
  assert.equal(chunk.expertCost, 5)
  assert.match(JSON.stringify(chunk), /30分钟/)
  const pipeline = load('app/data/cases/pipeline-review.ts')
  assert.equal(pipeline.expertCost, 7)
  assert.deepEqual(pipeline.expertChain.filter(s => s.actionId).map(s => s.actionId), ['a-supply', 'a-botpath', 'a-cache', 'a-parallel', 'a-keyfix'])
})
