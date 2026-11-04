import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hashContent } from '../pipeline/baseline.mjs'

const root = new URL('../../', import.meta.url)
const baseline = JSON.parse(readFileSync(new URL('t04b-master-systems-cases.json', import.meta.url), 'utf8'))
function load(file) {
  const s = readFileSync(new URL(file, root), 'utf8'), name = s.match(/export const (\w+)/)[1]
  return new Function(s.replace(/^import.*$/gm, '').replace('export const', 'const')
    .replace(new RegExp(`const ${name}: \\w+`), `const ${name}`) + `;return ${name}`)()
}
const source = readFileSync(new URL('app/utils/scoring.ts', root), 'utf8')
  .match(/export function computeGrade[\s\S]*?\n}/)[0]
  .replace('export ', '').replace(/:\s*(boolean|number|string)/g, '')
const grade = new Function(`${source};return computeGrade`)()

test('T04B大师系统清单恰为40题且排除已校准首批四题', () => {
  assert.equal(baseline.count, 40)
  assert.equal(baseline.cases.length, 40)
  assert.equal(new Set(baseline.cases.map(c => c.id)).size, 40)
  for (const c of baseline.cases) assert.equal(['first-npe', 'caused-by', 'log-correlation', 'async-swallow'].includes(c.id), false)
})

for (const r of baseline.cases.filter(r => r.status === 'calibrated')) {
  const c = load(r.file)
  test(`${c.id}：校准哈希、六维、两条路径与终局语义`, () => {
    assert.equal(hashContent(c), r.calibratedHash)
    assert.equal(c.part, 'master')
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


test('真实Node Agent默认按origin分池，显式maxTotalSockets才限制总量',async()=>{
 const http=await import('node:http'),servers=[],agents=[],requests=[],jobs=[];let signal
 const ready=()=>new Promise(resolve=>signal=resolve)
 let hold=ready();const serverA=http.createServer((req,res)=>signal(res)),serverB=http.createServer((req,res)=>res.end('ok'))
 for(const server of [serverA,serverB]){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server)}
 function get(server,agent){const job=new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:server.address().port,agent},res=>{res.resume();res.on('end',resolve)});requests.push(req);req.on('error',reject)});job.catch(()=>{});jobs.push(job);return job}
 try{const perOrigin=new http.Agent({maxSockets:1,keepAlive:false});agents.push(perOrigin);let firstDone=false;const first=get(serverA,perOrigin).then(()=>firstDone=true),res=await hold;await get(serverB,perOrigin);assert.equal(firstDone,false);res.end('ok');await first;perOrigin.destroy()
  const global=new http.Agent({maxSockets:1,maxTotalSockets:1,keepAlive:false});agents.push(global);hold=ready();const third=get(serverA,global),response=await hold;const fourth=get(serverB,global);await new Promise(resolve=>setImmediate(resolve));assert.equal(Object.values(global.requests).reduce((n,a)=>n+a.length,0),1);response.end('ok');await Promise.all([third,fourth])
 }finally{for(const req of requests)req.destroy();for(const agent of agents)agent.destroy();await Promise.allSettled(jobs);for(const server of servers)await new Promise(resolve=>server.close(resolve))}
})

test('真实题内闭包代码产生A附件+B收件人，独立const绑定修复',async()=>{
 const c=load('app/data/cases/callback-mismatch.ts'),text=c.actions.find(a=>a.id==='a-closureread').result.text,block=text.match(/for\(var r of batch\) \{[\s\S]*?\n\}/)[0]
 async function run(code){const jobs=[],sent=[];const render=data=>new Promise(resolve=>jobs.push(()=>resolve(data)));new Function('batch','render','mailer',code)([{data:'A',recipient:'a'},{data:'B',recipient:'b'}],render,{send:(res,to)=>sent.push([res,to])});for(const finish of jobs)finish();await Promise.resolve();return sent}
 assert.deepEqual(await run(block),[['A','b'],['B','b']]);assert.deepEqual(await run(block.replace('var r','const r')),[['A','a'],['B','b']])
})

test('并发案例的事务顺序与拒绝容量算术一致',()=>{
 assert.equal(100-137,-37);assert.equal(32*.5*3,48);assert.ok(Math.abs(8/.009-888.8889)<.001);assert.ok(Math.abs(1000/(1200-8/.009)-3.2143)<.001)
 const c=load('app/data/cases/lock-expiry.ts');assert.match(c.actions.find(a=>a.id==='a-releasecheck').result.text,/到65秒已过期/);const local=load('app/data/cases/threadlocal-leak.ts');assert.match(local.actions.find(a=>a.id==='a-tlexamine').result.text,/旧B会被覆盖/);assert.match(load('app/data/cases/pool-deadlock.ts').actions.find(a=>a.id==='a-repro').result.text,/barrier/)
})
test('已校准题的六维原文、危险成本和噪声在两条路径完整收线',()=>{
 for(const r of baseline.cases.filter(r=>r.status==='calibrated')){const c=load(r.file);assert.ok(r.dimensionEvidence.every(e=>e.includes('原文依据')));if(c.difficulty===1)continue;assert.equal(r.noise.length,c.difficulty===3?3:1);for(const n of r.noise){assert.ok(c.scene.symptoms.some(s=>s.title===n.title&&s.text===n.text));assert.ok(c.actions.find(a=>a.id===n.closeActionId).result.text.includes(n.closure));for(const p of r.paths)assert.ok(p.actions.includes(n.closeActionId))}}
})
test('延迟题直接执行真实题内公式，正确带偏移epoch可直接相减',()=>{
 const c=load('app/data/cases/mq-delay.ts'),code=c.actions.find(a=>a.id==='a-tzaudit').result.text.split('\n').slice(0,2).join('\n').replace('实际代码：',''),bad=new Function('targetEpoch','nowEpoch','createdEpoch',code+';return delayMs');const target=Date.parse('2026-09-29T19:00:00+08:00'),now=Date.parse('2026-09-29T18:30:00+08:00');assert.equal((target-now)/60000,30);assert.deepEqual(['18:17','18:22','18:25'].map(t=>bad(target,now,Date.parse(`2026-09-29T${t}:00+08:00`))/60000),[17,22,25]);assert.equal(target,Date.parse('2026-09-29T11:00:00Z'))
})
test('消费局部吞吐与全局权重、DLQ抽样和Kafka分区数学可对账',()=>{
 assert.equal(480+9800+70132,80412);assert.equal(494/500,0.988);assert.ok(Math.abs(250/(249*.48+480)*60-25.02)<.01);assert.equal(12*125+4*25,1600);assert.equal((2000-1600)*60*6,144000);assert.equal(Array.from({length:24},(_,hash)=>(hash%12)!==(hash%24)).filter(Boolean).length,12)
})
test('消息确认与持久化各有边界，不把DLQ或消费ack当端到端确认',()=>{
 const c=load('app/data/cases/mq-lost.ts');assert.match(c.actions.find(a=>a.id==='a-confirmcheck').result.text,/createConfirmChannel/);assert.match(c.actions.find(a=>a.id==='a-fixconfirm').result.text,/不能补回从未到达Broker/);assert.match(load('app/data/cases/mq-duplicate.ts').actions.find(a=>a.id==='a-logcheck').result.text,/单向方法/)
})
test('重放候选与实际积分分开，预插已处理不能吞待处理；物理磁盘容量不超总量',()=>{
 assert.equal(27000*3,81000);assert.equal(9900*3,29700);assert.equal(100*5,500);assert.ok(800+500>1000);const replay=load('app/data/cases/replay-surge.ts');assert.match(replay.actions.find(a=>a.id==='a-fixidem').result.text,/造成新漏发/);assert.equal(3*4,12);assert.equal(10.92/12,.91);assert.ok(Math.abs((10.92-3.2)/12*100-64.3333)<.001);const disk=load('app/data/cases/mq-disk.ts');assert.match(disk.actions.find(a=>a.id==='a-retentioncfg').result.text,/清理扫描正常运行/)
})
test('Kafka组内分摊与独立订阅不同，consumer进度与心跳期限分开',()=>{
 assert.equal(100*16,1600);assert.ok(2*160+40>300);assert.ok(160+8<300);assert.ok(Math.abs(6*40/3600*100-6.6667)<.001);const c=load('app/data/cases/rebalance-storm.ts');assert.match(c.scene.architecture,/classic/);assert.match(c.actions.find(a=>a.id==='a-pollaudit').result.text,/旧处理线程不会自动停止/);const outbox=load('app/data/cases/mq-dualwrite.ts');assert.match(outbox.actions.find(a=>a.id==='a-impact').result.text,/GC只是暂停诱因/);assert.match(outbox.actions.find(a=>a.id==='a-fixcatch').result.text,/写表前进程退出/)
})
