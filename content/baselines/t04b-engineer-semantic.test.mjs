import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hashContent } from '../pipeline/baseline.mjs'

const root = new URL('../../', import.meta.url)
const baseline = JSON.parse(readFileSync(new URL('t04b-engineer-cases.json', import.meta.url), 'utf8'))
function load(file) {
  const s = readFileSync(new URL(file, root), 'utf8'), name = s.match(/export const (\w+)/)[1]
  return new Function(s.replace(/^import.*$/gm, '').replace('export const', 'const')
    .replace(new RegExp(`const ${name}: \\w+`), `const ${name}`) + `;return ${name}`)()
}
const source = readFileSync(new URL('app/utils/scoring.ts', root), 'utf8')
  .match(/export function computeGrade[\s\S]*?\n}/)[0]
  .replace('export ', '').replace(/:\s*(boolean|number|string)/g, '')
const grade = new Function(`${source};return computeGrade`)()

test('T04B工兵清单恰为29题且排除已校准首批四题', () => {
  assert.equal(baseline.count, 29)
  assert.equal(baseline.cases.length, 29)
  assert.equal(new Set(baseline.cases.map(c => c.id)).size, 29)
  for (const c of baseline.cases) assert.equal(['first-npe', 'caused-by', 'log-correlation', 'async-swallow'].includes(c.id), false)
})

for (const r of baseline.cases.filter(r => r.status === 'calibrated')) {
  const c = load(r.file)
  test(`${c.id}：校准哈希、六维、两条路径与终局语义`, () => {
    assert.equal(hashContent(c), r.calibratedHash)
    assert.equal(c.part, 'engineer')
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

test('配置题限定刷新与绑定语义，不制造字段RefreshScope和任意环境变量映射',()=>{
 const hot=load('app/data/cases/hot-reload-gap.ts');assert.match(hot.actions.find(a=>a.id==='a-injectmode').result.text,/Bean类标注@RefreshScope/);assert.match(hot.actions.find(a=>a.id==='a-injectmode').result.text,/不发布刷新事件/)
 const priority=load('app/data/cases/priority-clash.ts');assert.match(priority.actions.find(a=>a.id==='a-sourcecheck').result.text,/POOL_SIZE→pool.size/);assert.equal(priority.actions.flatMap(a=>a.hypotheses).some(h=>h.id==='h-multi'&&h.status==='confirmed'),false)
 const typo=load('app/data/cases/config-typo.ts');assert.match(typo.actions.find(a=>a.id==='a-fixbind').result.text,/ignoreUnknownFields=false/)
})
test('恢复风暴分别核算连接与查询，并区分尝试和成功连接',()=>{
 const c=load('app/data/cases/boot-storm.ts');assert.equal(50*20,1000);assert.equal(50*240/60,200);assert.ok(50*10<800);assert.equal(800+200,1000);assert.match(c.actions.find(a=>a.id==='a-impact').result.text,/建立800、拒绝200/);assert.match(c.actions.find(a=>a.id==='a-fixstagger').result.text,/共9分钟/);assert.equal(c.expertCost,6)
})
