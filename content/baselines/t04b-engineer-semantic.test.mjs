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
test('错误文案必须实际让includes变化；14处风险不等于14处本次失败',()=>{
 assert.equal('账户余额不足，请先充值'.includes('余额不足'),true);assert.equal('可用资金不足，请先充值'.includes('余额不足'),false);const c=load('app/data/cases/error-contract.ts');assert.match(c.scene.symptoms[0].text,/可用资金不足/);assert.match(c.actions.find(a=>a.id==='a-impact').result.text,/另外11处.*未失效/)
})
test('枚举题业务PAID始终映射3后被旧消费者解释SHIPPED，修正数字为字符串仍需迁移',()=>{
 const c=load('app/data/cases/enum-drift.ts');assert.match(c.actions.find(a=>a.id==='a-enumdiff').result.text,/PAID→3，SHIPPED→2/);assert.match(c.actions.find(a=>a.id==='a-ordertrace').result.text,/生成唯一事件E1→发送status=3/);assert.match(c.actions.find(a=>a.id==='a-fixenum').result.text,/number直接改string也是破坏性/)
})
test('超时40%重试按总尝试计算，不能写成2.4倍；响应扩展不保证兼容',()=>{
 assert.equal((600+400)/600,5/3);const c=load('app/data/cases/timeout-contract.ts');assert.match(c.actions.find(a=>a.id==='a-impact').result.text,/≈1.67倍/);assert.match(c.actions.find(a=>a.id==='a-fixbudget').result.text,/串行阶段、并行波次、排队与重试/);assert.match(load('app/data/cases/required-field.ts').actions.find(a=>a.id==='a-schemacheck').result.text,/严格schema/)
})
test('连接池题20条长SQL才能解释20个持有者，读库正常不排除主库',()=>{
 const c=load('app/data/cases/pool-exhausted.ts');assert.match(c.actions.find(a=>a.id==='a-slowquery').result.text,/20条同类/);assert.match(c.actions.find(a=>a.id==='a-impact').result.text,/读库正常不能排除主库故障/);assert.equal(c.expertCost,8)
})
test('filesort不等于必然落盘，缓存命中旧价不靠扩容或回源互斥解决',()=>{
 const c=load('app/data/cases/slow-query.ts');assert.match(c.actions.find(a=>a.id==='a-explain').result.text,/可能在内存完成/);assert.equal(c.actions.find(a=>a.id==='a-fixindex').danger,true);const cache=load('app/data/cases/cache-review.ts');assert.match(cache.actions.find(a=>a.id==='a-stampede').result.text,/一直hit旧值/);assert.match(cache.actions.find(a=>a.id==='a-benefit').result.text,/尚未实测/)
})
test('叠加题以QPS乘秒计算需求，并明确200是真实执行上限',()=>{
 assert.equal(3000*0.35,1050);assert.equal(3000*0.005,15);assert.equal(50*0.35,17.5);const c=load('app/data/cases/double-strike.ts');assert.match(c.actions.find(a=>a.id==='a-combo').result.text,/实际200执行/);assert.match(c.actions.find(a=>a.id==='a-impact').result.text,/慢日志1s阈值/)
})
test('深分页4501页与90000 OFFSET相符，COUNT单独计时不与第一页60ms矛盾',()=>{
 assert.equal((4501-1)*20,90000);assert.equal((100-1)*20,1980);const c=load('app/data/cases/deep-pagination.ts');assert.match(c.scene.symptoms[1].text,/整体接口第1页约1.26s/);assert.match(c.actions.find(a=>a.id==='a-countcheck').result.text,/关闭COUNT后.*仍6s/)
})
test('提交状态决定误更新能否普通回滚，秒级复制指标不能给出毫秒精度',()=>{
 const c=load('app/data/cases/data-script-accident.ts');assert.match(c.actions[0].result.text,/autocommit=1/);assert.match(c.actions.find(a=>a.id==='a-restore').result.text,/隔离实例/);const lag=load('app/data/cases/replica-lag.ts');assert.match(lag.scene.symptoms[0].text,/秒级指示/);assert.match(lag.actions.find(a=>a.id==='a-fixsession').result.text,/固定10秒.*不保证/)
})
test('监听器泄漏的字节和回调次数可对账，once不能代替关联生命周期',()=>{
 assert.equal(2429*16/1024,37.953125);assert.equal(3*(3+1)/2,6);const c=load('app/data/cases/closure-leak.ts');assert.match(c.actions.find(a=>a.id==='a-coderead').result.text,/const context = buildLabelContext/);assert.match(c.actions.find(a=>a.id==='a-fix').result.text,/on改once不能阻止/);assert.match(c.actions.find(a=>a.id==='a-heaptype').result.text,/external和arrayBuffers近似稳定/)
})
test('OOM结合Reason和cgroup事件，事件循环题使用真实zlib同步API',()=>{
 const oom=load('app/data/cases/oom-leak.ts');assert.match(oom.actions.find(a=>a.id==='a-k8sevent').result.text,/137只代表SIGKILL/);assert.ok(Math.abs((2048-400)/45-36.6)<.1);const loop=load('app/data/cases/event-loop-blocked.ts');assert.match(loop.actions.find(a=>a.id==='a-code').result.text,/zlib.gzipSync/);assert.match(loop.actions.find(a=>a.id==='a-fix').result.text,/async\/Promise本身不会移出主线程/)
})
test('端口题同元组不超过范围，HPA按requests且readiness不直接重启',()=>{
 assert.equal(60999-32768+1,28232);assert.equal(468*60,28080);assert.ok(28080+100<28232);const tw=load('app/data/cases/timewait-exhausted.ts');assert.match(tw.actions.find(a=>a.id==='a-code').result.text,/agent:false/);assert.match(tw.actions.find(a=>a.id==='a-rollback').result.text,/只重启Node进程不会清除/);const h=load('app/data/cases/container-review.ts');assert.match(h.actions.find(a=>a.id==='a-hpa').result.text,/相对CPU request/);assert.match(h.actions.find(a=>a.id==='a-probe').result.text,/不直接重启/)
})
test('级联超时等待重叠，不把四层30秒相加；正则不承诺线程中断',()=>{
 assert.equal(1000*.05*5,250);const c=load('app/data/cases/cascade-timeout.ts');assert.match(c.scene.symptoms[1].text,/不能.*相加.*120s/);const regex=load('app/data/cases/regex-catastrophe.ts');assert.match(regex.actions.find(a=>a.id==='a-flamegraph').result.text,/\^\(a\+\)\+\$/);assert.match(regex.actions.find(a=>a.id==='a-fixregex').result.text,/Future.get超时也不代表匹配线程停下/)
})
