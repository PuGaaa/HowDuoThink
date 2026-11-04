import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const baseline = JSON.parse(readFileSync(new URL('t04a-cases.json', import.meta.url), 'utf8'))

function loadCase(id) {
  const source = readFileSync(new URL(`app/data/cases/${id}.ts`, root), 'utf8')
  const name = source.match(/export const (\w+)/)[1]
  const body = source.replace(/^import.*$/gm, '').replace('export const', 'const')
    .replace(new RegExp(`const ${name}: \\w+`), `const ${name}`)
  return new Function(`${body};return ${name}`)()
}

const gradeSource = readFileSync(new URL('app/utils/scoring.ts', root), 'utf8')
  .match(/export function computeGrade[\s\S]*?\n}/)[0]
  .replace('export ', '').replace(/:\s*(boolean|number|string)/g, '')
const computeGrade = new Function(`${gradeSource};return computeGrade`)()
const expectedRoot = {
  'first-npe': 'rc-accountnull', 'caused-by': 'rc-pool',
  'log-correlation': 'rc-chain', 'async-swallow': 'rc-swallow',
}

function playPath(c, ids) {
  const states = Object.fromEntries(c.hypotheses.map(h => [h.id, 'open']))
  let cost = 0
  for (const id of ids) {
    const action = c.actions.find(a => a.id === id)
    cost += action.cost
    for (const effect of action.hypotheses) {
      const terminal = ['excluded', 'confirmed'].includes(states[effect.id])
      if (!terminal || effect.status === 'confirmed') states[effect.id] = effect.status
    }
  }
  return { states, cost }
}

for (const record of baseline.cases) {
  const c = loadCase(record.id)
  test(`${c.id}两条已编审路径均能按真实评分获S，并排除错误假设`, () => {
    assert.equal(record.status, 'calibrated')
    assert.equal(record.paths.length, 2)
    assert.notDeepEqual(record.paths[0].actions, record.paths[1].actions)
    assert.deepEqual(c.expertChain.filter(s => s.actionId !== '').map(s => s.actionId), record.paths[0].actions)
    assert.equal(c.expertChain.at(-1).actionId, '')
    assert.equal(c.rootCauses.find(r => r.correct).id, expectedRoot[c.id])
    for (const path of record.paths) {
      assert.equal(path.actions[0], 'a-impact')
      assert.equal(new Set(path.actions).size, path.actions.length)
      const result = playPath(c, path.actions)
      assert.equal(result.cost, path.cost)
      assert.equal(result.cost, c.expertCost)
      assert.equal(computeGrade(true, result.cost, c.expertCost, 0), 'S')
      for (const h of c.hypotheses) {
        const correct = h.id.replace('h-', 'rc-') === expectedRoot[c.id]
        assert.equal(result.states[h.id], correct ? 'confirmed' : 'excluded', h.id)
      }
    }
  })
}

test('首关不能把被NPE消息排除的用户为空标为实锤', () => {
  const c = loadCase('first-npe')
  const frame = c.actions.find(a => a.id === 'a-frameread')
  assert.deepEqual(frame.hypotheses, [
    { id: 'h-usernull', status: 'excluded' }, { id: 'h-accountnull', status: 'up' },
  ])
  assert.match(c.scene.symptoms[0].text, /because the return value of "com\.xj\.points\.UserPoint\.getAccount\(\)" is null/)
  assert.match(c.actions.find(a => a.id === 'a-impact').result.text, /老用户100次查询均正常/)
  assert.match(c.actions.find(a => a.id === 'a-rpctime').result.text, /首次建账，期间无DELETE/)
})

test('连接池题区分借连接与SQL读取，不构造reset因果链', () => {
  const c = loadCase('caused-by')
  const chain = c.actions.find(a => a.id === 'a-chaindeep').result.text
  assert.match(chain, /SQLTransientConnectionException/)
  assert.match(chain, /getConnection/)
  assert.match(chain, /未发送它自己的SQL/)
  assert.doesNotMatch(JSON.stringify(c), /Connection reset|SocketTimeoutException|最底层.*才是根因|池 20 → 40/)
  assert.match(c.actions.find(a => a.id === 'a-sizecheck').result.text, /没有进入文件写入/)
})

test('日志关联题的GC窗口覆盖下游期限，但上游收到504时尚未到期', () => {
  const c = loadCase('log-correlation')
  const text = c.actions.find(a => a.id === 'a-correlate').result.text
  const millis = s => { const [h, m, sec] = s.split(':').map(Number); return (h * 3600 + m * 60 + sec) * 1000 }
  const aStart = text.match(/A (\d\d:\d\d:\d\d\.\d{3})发起/)[1]
  const bStart = text.match(/B (\d\d:\d\d:\d\d\.\d{3})向c-7/)[1]
  const gc = text.match(/(\d\d:\d\d:\d\d\.\d{3})开始Stop-The-World，(\d\d:\d\d:\d\d\.\d{3})结束，暂停([\d.]+)秒/)
  const bEnd = text.match(/B (\d\d:\d\d:\d\d\.\d{3})到达5秒期限/)[1]
  const aEnd = '10:00:' + text.match(/A在(\d\d\.\d{3})收到504/)[1]
  assert.equal(Math.round(millis(gc[2]) - millis(gc[1])), Number(gc[3]) * 1000)
  assert.equal(Math.round(millis(bEnd) - millis(bStart)), 5000)
  assert.ok(millis(gc[1]) < millis(bEnd) && millis(gc[2]) > millis(bEnd))
  assert.ok(millis(aEnd) - millis(aStart) < 8000)
  assert.match(text, /C入口访问记录：req-7712a.*进入c-7/)
  assert.match(c.actions.find(a => a.id === 'a-tzcheck').result.text, /NTP偏差均小于20毫秒/)
})

test('submit题不把UncaughtExceptionHandler当Future异常观察器', () => {
  const c = loadCase('async-swallow')
  const audit = c.actions.find(a => a.id === 'a-taskaudit').result.text
  const fix = c.actions.find(a => a.id === 'a-fixhandler').result.text
  assert.match(audit, /FutureTask保存异常/)
  assert.match(audit, /工作线程继续执行下一任务/)
  assert.match(audit, /本次计数仍为0/)
  assert.match(audit, /handler不能代替观察Future/)
  assert.match(fix, /后台收集者get\(\)或afterExecute检查Future/)
  assert.match(c.actions.find(a => a.id === 'a-fixmon').result.text, /不把UncaughtExceptionHandler的零计数当成/)
  assert.equal(c.restartActionId, 'a-danger')
})
