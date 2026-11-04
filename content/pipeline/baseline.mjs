#!/usr/bin/env node
/**
 * T04A 存量内容基线。
 *
 * 正文哈希不包含 id 与目录元数据；目录元数据单独冻结，避免修订正文或移动目录
 * 后继续把旧快照当作已校准内容。正文唯一来源仍是 app/data/cases/*.ts。
 *
 * 用法：
 *   node content/pipeline/baseline.mjs --write
 *   node content/pipeline/baseline.mjs --check
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const BASELINE = resolve(ROOT, 'content/baselines/t04a-cases.json')
const CASES = [
  ['first-npe', 'firstNpeCase'],
  ['caused-by', 'causedByCase'],
  ['log-correlation', 'logCorrelationCase'],
  ['async-swallow', 'asyncSwallowCase'],
]

const CONTENT_FIELDS = [
  'title', 'intro', 'domain', 'layer', 'scene', 'hypotheses', 'actions',
  'rootCauses', 'expertCost', 'restartActionId', 'expertChain', 'lessons',
]
const META_FIELDS = ['part', 'chapterId', 'order', 'typeTags', 'difficulty']

function loadCase(id, constName) {
  const file = resolve(ROOT, `app/data/cases/${id}.ts`)
  const source = readFileSync(file, 'utf8')
  const body = source
    .replace(/^import\s+.*$/gm, '')
    .replace(/export\s+const/, 'const')
    .replace(new RegExp(`const\\s+${constName}\\s*:\\s*\\w+`), `const ${constName}`)
  return { file: `app/data/cases/${id}.ts`, value: new Function(`${body}; return ${constName}`)() }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function pick(value, fields) {
  return Object.fromEntries(fields.map((field) => [field, value[field]]))
}

function hashContent(value) {
  return createHash('sha256').update(canonical(pick(value, CONTENT_FIELDS))).digest('hex')
}

function snapshot([id, constName]) {
  const loaded = loadCase(id, constName)
  const value = loaded.value
  const actionById = new Map(value.actions.map((action) => [action.id, action]))
  const expertPathCost = value.expertChain
    .map((step) => actionById.get(step.actionId))
    .filter(Boolean)
    .reduce((sum, action) => sum + action.cost, 0)
  return {
    id: value.id,
    file: loaded.file,
    contentHash: hashContent(value),
    metadata: pick(value, META_FIELDS),
    expertCost: value.expertCost,
    expertPathCost,
    status: 'uncalibrated',
    reasons: {
      'first-npe': ['核实 user/account 假设效应与老用户偶发的异步延迟机制', '标准专家链成本需人工确认'],
      'caused-by': ['核实异常包装、连接池资源机制，避免把最底层异常等同业务根因', '标准专家链成本需人工确认'],
      'log-correlation': ['补齐 requestId 到具体实例的关联证据，避免以时间相关替代因果'],
      'async-swallow': ['核实 Future、异常处理器与状态机失败分支的技术事实'],
    }[value.id],
  }
}

function currentCases() {
  return CASES.map(snapshot)
}

function check() {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
  const current = currentCases()
  const errors = []
  if (baseline.schemaVersion !== 1) errors.push(`schemaVersion 不支持：${baseline.schemaVersion}`)
  const expected = new Map(baseline.cases.map((item) => [item.id, item]))
  for (const item of current) {
    const frozen = expected.get(item.id)
    if (!frozen) {
      errors.push(`${item.id} 不在 T04A 基线中`)
      continue
    }
    if (frozen.file !== item.file) errors.push(`${item.id} 文件路径变化：${frozen.file} -> ${item.file}`)
    if (frozen.contentHash !== item.contentHash) errors.push(`${item.id} 正文哈希变化：旧 ${frozen.contentHash}，现 ${item.contentHash}`)
    if (canonical(frozen.metadata) !== canonical(item.metadata)) errors.push(`${item.id} 目录元数据变化，不能沿用旧基线`)
  }
  for (const item of baseline.cases) {
    if (!current.some((currentItem) => currentItem.id === item.id)) errors.push(`${item.id} 基线记录找不到当前案例`)
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`)
    process.exitCode = 1
    return
  }
  for (const item of current) console.log(`✓ ${item.id} — ${item.contentHash} — ${item.status}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  const output = {
    schemaVersion: 1,
    kind: 't04a-content-baseline',
    frozenAt: '2026-11-04',
    source: 'app/data/cases',
    hash: 'sha256(canonical正文字段；数组顺序保留；对象键排序)',
    contentFields: CONTENT_FIELDS,
    metadataFields: META_FIELDS,
    cases: currentCases(),
  }
  writeFileSync(BASELINE, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`已写入 ${BASELINE}`)
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--check')) {
  check()
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error('用法：node content/pipeline/baseline.mjs --write|--check')
  process.exitCode = 1
}

export { BASELINE, CONTENT_FIELDS, META_FIELDS, canonical, currentCases, hashContent }
