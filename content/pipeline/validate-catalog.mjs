#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function validateCatalog(projectRoot = root) {
  const chaptersSource = readFileSync(resolve(projectRoot, 'app/data/chapters.ts'), 'utf8')
  const casesIndexSource = readFileSync(resolve(projectRoot, 'app/data/cases/index.ts'), 'utf8')
  const chapterParts = new Map()
  for (const match of chaptersSource.matchAll(/\{ id: '([^']+)', part: '([^']+)'/g)) {
    chapterParts.set(match[1], match[2])
  }

  const casesDir = resolve(projectRoot, 'app/data/cases')
  const cases = []
  for (const file of readdirSync(casesDir).filter((name) => name.endsWith('.ts') && !['index.ts', 'publication-revisions.ts'].includes(name))) {
    const source = readFileSync(resolve(casesDir, file), 'utf8')
    const id = source.match(/\n  id: '([^']+)'/)?.[1]
    const part = source.match(/\n  part: '([^']+)'/)?.[1]
    const chapterId = source.match(/\n  chapterId: '([^']+)'/)?.[1]
    if (id == null || part == null || chapterId == null) return [`${file} 缺少 id/part/chapterId`]
    cases.push({ file, id, part, chapterId })
  }

  const errors = []
  const ids = new Set()
  for (const item of cases) {
    if (ids.has(item.id)) errors.push(`案例 id 重复：${item.id}`)
    ids.add(item.id)
    if (!chapterParts.has(item.chapterId)) errors.push(`${item.id} 引用了未知章节：${item.chapterId}`)
    if (chapterParts.get(item.chapterId) !== item.part) {
      errors.push(`${item.id} 的 part=${item.part} 与 chapterId=${item.chapterId} 的 part=${chapterParts.get(item.chapterId)} 不一致`)
    }
  }

  const trialDeclaration = casesIndexSource.match(/TRIAL_CASE_IDS = \[([^\]]+)\]/)?.[1] ?? ''
  const trial = [...trialDeclaration.matchAll(/'([^']+)'/g)].map((match) => match[1])
  if (trial.join(',') !== 'first-npe,caused-by,log-correlation') {
    errors.push('TRIAL_CASE_IDS 必须固定为 first-npe、caused-by、log-correlation')
  }
  const trialCases = trial.map((id) => cases.find((item) => item.id === id))
  if (trialCases.some((item) => item == null)) errors.push('试玩目录必须包含 first-npe、caused-by、log-correlation')
  if (trialCases.some((item) => item?.chapterId !== 'error-reading')) errors.push('试玩三题必须属于 error-reading')
  return errors
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = validateCatalog()
  for (const error of errors) console.error(`✗ ${error}`)
  if (errors.length === 0) console.log('✓ 目录门禁通过：试玩顺序、章节引用与 chapterId→part 约束均有效')
  process.exit(errors.length > 0 ? 1 : 0)
}
