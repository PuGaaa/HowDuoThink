#!/usr/bin/env node
/** 官方导出只读取案例TS与核定的发布清单；不会自动提高修订。 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const MANIFEST = 'app/data/cases/publication-revisions.ts'
const CONTROLS = new Set(['baseRevision','contentRevision','sourceType','sourceCommit','sourceHash','submissionId','authorName','calibrationStatus'])

export function loadCaseSource(source) {
  const name = source.match(/export\s+const\s+(\w+)/)[1]
  const body = source.replace(/^import\s+.*$/gm, '').replace(/export\s+const/, 'const').replace(new RegExp(`const\\s+${name}\\s*:\\s*\\w+`), `const ${name}`)
  return new Function(`${body}; return ${name};`)()
}
export function normalizeCase(value) {
  const body = Object.fromEntries(Object.entries(structuredClone(value)).filter(([key]) => !CONTROLS.has(key)))
  body.part ??= 'engineer'; body.chapterId ??= ''; body.order ??= 1; body.typeTags ??= []; body.restartActionId ??= ''
  body.scene.tag ??= '故障现场'
  body.actions = body.actions.map(action => ({danger:false,effects:[],tests:[],hypotheses:[],...action}))
  body.hypotheses = body.hypotheses.map(hypothesis => ({excludeActionId:'',...hypothesis}))
  body.rootCauses = body.rootCauses.map(cause => ({correct:false,...cause}))
  body.expertChain = body.expertChain.map(step => ({actionId:'',...step}))
  return body
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => JSON.stringify(key)+':'+canonical(value[key])).join(',')}}`
  return JSON.stringify(value)
}
export function contentHash(value) { return createHash('sha256').update(canonical(normalizeCase(value))).digest('hex') }
export function registeredFiles(indexSource) {
  const imports = new Map([...indexSource.matchAll(/import\s+\{\s*(\w+)\s*\}\s+from\s+'\.\/([\w-]+)'/g)].map(match => [match[1],match[2]+'.ts']))
  const names = indexSource.match(/export const ALL_CASES[^=]*=\s*\[([\s\S]*?)\]/)[1].split(',').map(name => name.trim()).filter(Boolean)
  return names.map(name => 'app/data/cases/'+imports.get(name))
}
export function loadManifest(root = ROOT) {
  const source = readFileSync(join(root, MANIFEST),'utf8')
  return JSON.parse(source.slice(source.indexOf('=')+1).trim().replace(/;$/, ''))
}
export function envelope(value, publication) {
  if (publication.calibrationStatus === 'needs_review') throw new Error(`${value.id} 尚未完成校准，不可导出发布种子`)
  if (contentHash(value) !== publication.contentHash) throw new Error(`${value.id} 正文与发布清单哈希不一致；先完成审阅并生成新修订`)
  return {payload: normalizeCase(value), publication:{baseRevision:publication.baseRevision,contentRevision:publication.contentRevision,sourceCommit:publication.sourceCommit,contentHash:publication.contentHash,calibrationStatus:publication.calibrationStatus}}
}
function run() {
  const publications = loadManifest()
  const files = process.argv[2] ? [process.argv[2]] : registeredFiles(readFileSync(join(ROOT,'app/data/cases/index.ts'),'utf8'))
  const outDir = join(ROOT,'server/seed')
  mkdirSync(outDir,{recursive:true})
  for (const file of files) {
    const value = loadCaseSource(readFileSync(resolve(ROOT,file),'utf8'))
    const output = process.argv[3] || join(outDir,value.id+'.json')
    writeFileSync(output,JSON.stringify(envelope(value,publications[value.id]),null,2)+'\n')
    console.log('exported',value.id)
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run()
