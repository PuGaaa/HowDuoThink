#!/usr/bin/env node
/** 受审阅的发布修订清单。正文仍只写案例TS；构建只检查，不隐式改修订。
 * --write 在案例文件提交并完成校准后运行；--check 验证当前TS与核定清单一致。
 * 6523490 是旧全库冻结见证；98cc581 是首批四题显式revision=2的见证。
 */
import { execFileSync } from 'node:child_process'
import { existsSync,readFileSync,writeFileSync,readdirSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { hashContent } from '../pipeline/baseline.mjs'
import { ROOT,MANIFEST,canonical,loadCaseSource,contentHash,loadManifest,registeredFiles } from './export-case.mjs'

function git(...args) { return execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim() }
function snapshots(commit) {
  const files = registeredFiles(git('show',commit+':app/data/cases/index.ts'))
  return new Map(files.map(file => { const value=loadCaseSource(git('show',commit+':'+file)); return [value.id,{contentHash:contentHash(value),contentRevision:value.contentRevision ?? 1,sourceCommit:commit}] }))
}
function current() {
  return registeredFiles(readFileSync(join(ROOT,'app/data/cases/index.ts'),'utf8')).map(file => ({file,value:loadCaseSource(readFileSync(join(ROOT,file),'utf8'))}))
}
function calibration(value,file) {
  const records=readdirSync(join(ROOT,'content/baselines')).filter(name=>name.endsWith('-cases.json'))
  for(const name of records) {
    const baseline=JSON.parse(readFileSync(join(ROOT,'content/baselines',name),'utf8'))
    const record=baseline.cases.find(row=>row.id===value.id && row.status==='calibrated')
    if(!record || record.calibratedHash!==hashContent(value)) continue
    const source=readFileSync(join(ROOT,file),'utf8')
    const documented=source.match(/六维[：为\s]*([1-3](?:\/[1-3]){5})/)
    const dimensions=record.dimensions ?? (name==='t04a-cases.json' && documented ? documented[1].split('/').map(Number) : [])
    const sorted=[...dimensions].sort((a,b)=>a-b)
    const actions=new Map(value.actions.map(action=>[action.id,action]))
    const cost=value.expertChain.filter(step=>step.actionId).reduce((sum,step)=>sum+actions.get(step.actionId).cost,0)
    const pathsMatch=record.paths.length>=2 && record.paths.every(path=>path.actions.length>0 && path.actions.every(id=>actions.has(id)) && path.actions.reduce((sum,id)=>sum+actions.get(id).cost,0)===path.cost && path.cost===value.expertCost)
    const dimensionsHaveEvidence=name==='t04a-cases.json' ? Boolean(documented) : record.dimensionEvidence?.length===6
    if(dimensions.length===6 && dimensionsHaveEvidence && Math.floor((sorted[2]+sorted[3])/2)===value.difficulty && cost===value.expertCost && pathsMatch) {
      return {status:'calibrated',record:'content/baselines/'+name,dimensions,gaps:[]}
    }
  }
  return {status:'needs_review',record:null,dimensions:[],gaps:['尚缺匹配当前正文哈希的六维与双路径校准记录']}
}
function check() {
  const publications=loadManifest()
  const cases=current()
  const legacy=snapshots('6523490')
  for (const {file,value} of cases) {
    const entry=publications[value.id]
    if (entry.contentHash !== contentHash(value)) throw new Error(value.id+' 正文已变更但未声明发布修订')
    const proof=calibration(value,file)
    const isLegacy=legacy.get(value.id)?.contentHash===entry.contentHash
    const status=proof.status==='calibrated'?'calibrated':isLegacy?'legacy':'needs_review'
    if(entry.calibrationStatus!==status || JSON.stringify(entry.calibration)!==JSON.stringify(proof)) throw new Error(value.id+' 发布状态与当前校准证据不一致')
    if(status==='legacy' && (entry.contentRevision!==1 || entry.sourceCommit!==git('rev-parse','6523490'))) throw new Error(value.id+' 冻结存量只能以revision=1和原见证提交初始化')
    if(entry.baseRevision!==Math.max(0,entry.contentRevision-1)) throw new Error(value.id+' baseRevision与当前修订不连续')
    const revisions=new Map()
    for (const row of entry.history) {
      if (revisions.has(row.contentRevision) && revisions.get(row.contentRevision)!==row.contentHash) throw new Error(value.id+' 同修订出现不同正文')
      if(!/^[0-9a-f]{40}$/.test(row.sourceCommit)) throw new Error(value.id+' 修订来源提交不是完整Git哈希')
      git('cat-file','-e',row.sourceCommit+'^{commit}')
      revisions.set(row.contentRevision,row.contentHash)
    }
    if (revisions.get(entry.contentRevision)!==entry.contentHash) throw new Error(value.id+' 当前修订未进入历史')
  }
  if (Object.keys(publications).length!==cases.length) throw new Error('官方登记与发布清单数量不同')
  const catalog=JSON.parse(readFileSync(join(ROOT,'server/features/cases/official_ids.json'),'utf8'))
  const expectedCatalog={source:'官方登记和核定修订，由publication-release生成；不是正文编辑入口',ids:Object.keys(publications).sort(),legacySourceCommit:git('rev-parse','6523490'),legacyContentHashes:Object.fromEntries([...legacy].map(([id,row])=>[id,row.contentHash])),publications}
  if(canonical(catalog)!==canonical(expectedCatalog)) throw new Error('服务端官方登记与发布修订清单不同，请重新生成')
  const counts={calibrated:0,legacy:0,needs_review:0};for(const row of Object.values(publications)) counts[row.calibrationStatus]++;
  console.log(`✓ ${cases.length} 项官方修订与正文哈希一致`,counts)
}
function write() {
  const cases=current()
  const dirty=new Set(git('diff','--name-only','HEAD').split('\n'))
  if (cases.some(row=>dirty.has(row.file))) throw new Error('请先提交并审阅案例正文，再冻结Git发布来源')
  const previous=existsSync(join(ROOT,MANIFEST)) ? loadManifest() : {}
  const legacy=snapshots('6523490')
  const versioned=snapshots('98cc581')
  const output={}
  for (const {file,value} of cases) {
    const digest=contentHash(value)
    const sourceCommit=git('log','-1','--format=%H','--',file)
    const proof=calibration(value,file)
    const old=previous[value.id]
    if (old?.contentHash===digest) { output[value.id]={...old,calibrationStatus:proof.status==='calibrated'?'calibrated':legacy.get(value.id)?.contentHash===digest?'legacy':'needs_review',calibration:proof}; continue }
    const history=old ? [...old.history] : []
    if (!old && legacy.has(value.id)) history.push({...legacy.get(value.id),sourceCommit:git('rev-parse','6523490')})
    const first=versioned.get(value.id)
    if (!old && first?.contentRevision>1) history.push({...first,sourceCommit:git('rev-parse','98cc581')})
    const prior=old ?? history.at(-1)
    const same=prior?.contentHash===digest
    const revision=same ? prior.contentRevision : (prior?.contentRevision ?? 0)+1
    if (!same) history.push({contentRevision:revision,contentHash:digest,sourceCommit})
    output[value.id]={contentRevision:revision,baseRevision:same ? Math.max(0,revision-1) : revision-1,contentHash:digest,sourceCommit:same ? prior.sourceCommit : sourceCommit,history,calibrationStatus:proof.status==='calibrated'?'calibrated':legacy.get(value.id)?.contentHash===digest?'legacy':'needs_review',calibration:proof}
  }
  const type='Record<string, {contentRevision:number;baseRevision:number;contentHash:string;sourceCommit:string;history:{contentRevision:number;contentHash:string;sourceCommit:string}[];calibrationStatus:string;calibration:{status:string;record:string|null;dimensions:number[];gaps:string[]}}>'
  writeFileSync(join(ROOT,MANIFEST),'/** 官方发布修订唯一清单，由 publication-release.mjs --write 生成；不要手改。 */\nexport const OFFICIAL_PUBLICATIONS: '+type+' = '+JSON.stringify(output,null,2)+'\n')
  const catalog={source:'官方登记和核定修订，由publication-release生成；不是正文编辑入口',ids:Object.keys(output).sort(),legacySourceCommit:git('rev-parse','6523490'),legacyContentHashes:Object.fromEntries([...legacy].map(([id,row])=>[id,row.contentHash])),publications:output}
  writeFileSync(join(ROOT,'server/features/cases/official_ids.json'),JSON.stringify(catalog,null,2)+'\n')
  check()
}
if (process.argv.includes('--write')) write()
else if (process.argv.includes('--check')) check()
else throw new Error('用法：node content/tools/publication-release.mjs --write|--check')
