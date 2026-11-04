import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hashContent } from '../pipeline/baseline.mjs'

const root = new URL('../../', import.meta.url)
const baseline = JSON.parse(readFileSync(new URL('t04b-master-product-cases.json', import.meta.url), 'utf8'))
function load(file) {
  const s = readFileSync(new URL(file, root), 'utf8'), name = s.match(/export const (\w+)/)[1]
  return new Function(s.replace(/^import.*$/gm, '').replace('export const', 'const')
    .replace(new RegExp(`const ${name}: \\w+`), `const ${name}`) + `;return ${name}`)()
}
const source = readFileSync(new URL('app/utils/scoring.ts', root), 'utf8')
  .match(/export function computeGrade[\s\S]*?\n}/)[0]
  .replace('export ', '').replace(/:\s*(boolean|number|string)/g, '')
const grade = new Function(`${source};return computeGrade`)()

test('T04B四章清单恰为35题且保留独占范围', () => {
  assert.equal(baseline.count, 35)
  assert.equal(baseline.cases.length, 35)
  assert.equal(new Set(baseline.cases.map(c => c.id)).size, 35)
  for (const c of baseline.cases) assert.ok(['observability', 'security', 'evolution', 'deployment'].includes(c.chapter))
  assert.deepEqual(Object.fromEntries(['observability', 'security', 'evolution', 'deployment'].map(ch => [ch, baseline.cases.filter(c => c.chapter === ch).length])), { observability: 8, security: 8, evolution: 8, deployment: 11 })
})

for (const r of baseline.cases.filter(r => r.status === 'calibrated')) {
  const c = load(r.file)
  test(`${c.id}：校准哈希、六维、两条路径与终局语义`, () => {
    assert.equal(hashContent(c), r.calibratedHash)
    assert.equal(c.part, 'master')
    assert.equal(c.contentRevision ?? null, r.originalRevision)
    assert.equal(c.sourceCommit ?? null, r.originalSourceCommit)
    if (c.order === 1) assert.ok(c.difficulty <= 2)
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


test('日志题WARN不会吞ERROR，Filebeat心跳不代替文件路径覆盖',()=>{
 const c=load('app/data/cases/log-sampling.ts')
 assert.match(c.actions.find(a=>a.id==='a-sampleconf').result.text,/WARN仍允许ERROR/)
 assert.match(c.actions.find(a=>a.id==='a-sampleconf').result.text,/errors\/current\.json/)
 assert.deepEqual(c.actions.find(a=>a.id==='a-hostdiff').hypotheses,[{id:'h-level',status:'excluded'},{id:'h-noerr',status:'excluded'},{id:'h-host',status:'up'}])
})
test('均值与分位按同一10000样本可复算，0.5%长尾并不必进P99',()=>{
 assert.equal((9950*55+50*5055)/10000,80)
 const sample=[...Array(9950).fill(55),...Array(50).fill(5055)]
 assert.equal(sample[Math.ceil(.99*sample.length)-1],55)
 assert.equal(sample[Math.ceil(.999*sample.length)-1],5055)
 const c=load('app/data/cases/avg-metric.ts');assert.match(c.actions.find(a=>a.id==='a-gwconf').result.text,/proxy_connect_timeout=5s/);assert.equal(c.expertCost,6)
})
test('经典累计桶+Inf是总量，顶桶分位返回次高上界',()=>{
 const c=load('app/data/cases/histogram-bucket.ts'),t=c.actions.find(a=>a.id==='a-bucket').result.text
 assert.equal((1000-300)/1000,.7)
 assert.match(t,/返回第二高桶的上界0\.1s/)
 assert.match(t,/\+Inf计数包含全部1000次/)
 assert.match(c.actions.find(a=>a.id==='a-fixbucket').result.text,/不是直接把\+Inf\/count当超尺比例/)
})
test('通知数和规则数分开，预算不能因归因外部而追溯剔除',()=>{
 assert.equal(187+143+96+97,523);assert.equal(31*5,155)
 const a=load('app/data/cases/alert-storm.ts');assert.match(a.actions.find(a=>a.id==='a-timeline').result.text,/至01:55.*共32次/)
 assert.equal(30*24*60*.001,43.2)
 const e=load('app/data/cases/error-budget.ts');assert.match(e.actions.find(a=>a.id==='a-thirdbreak').result.text,/不自动免预算/);assert.match(e.rootCauses.find(r=>r.correct).text,/冻结新增风险/)
})
test('基数算术、增量内存与WAL恢复边界保持明确',()=>{
 assert.equal(1200000*8*40,384000000)
 assert.ok(2200000*1.5*1024/1024**3+4.9>8)
 const c=load('app/data/cases/cardinality-blast.ts');assert.match(c.actions.find(a=>a.id==='a-seriescount').result.text,/不是Prometheus每序列固定常数/);assert.match(c.actions.find(a=>a.id==='a-fixlabel').result.text,/不是简单labeldrop|不要简单labeldrop/)
})
test('消息新trace可由links关联，W3C非标准parent_trace_id不能当判据',()=>{
 const c=load('app/data/cases/trace-break.ts')
 assert.match(c.actions.find(a=>a.id==='a-msgheader').result.text,/不是W3C标准字段/)
 assert.match(c.actions.find(a=>a.id==='a-asynccheck').result.text,/新trace也可合法关联/)
 assert.match(c.actions.find(a=>a.id==='a-samplepolicy').result.text,/100%记录\/导出/)
 assert.equal(c.expertCost,5)
})
