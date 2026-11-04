import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BASELINE, CONTENT_FIELDS, META_FIELDS, canonical, currentCases, hashContent } from './baseline.mjs'

test('T04A 基线覆盖四道首批案例且 ID 唯一', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
  assert.equal(baseline.schemaVersion, 1)
  assert.deepEqual(baseline.cases.map((item) => item.id), ['first-npe', 'caused-by', 'log-correlation', 'async-swallow'])
  assert.equal(new Set(baseline.cases.map((item) => item.id)).size, baseline.cases.length)
  assert.deepEqual(baseline.contentFields, CONTENT_FIELDS)
  assert.deepEqual(baseline.metadataFields, META_FIELDS)
})

test('T04A 当前四题正文与目录均匹配冻结基线', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
  const frozen = new Map(baseline.cases.map((item) => [item.id, item]))
  for (const item of currentCases()) {
    assert.equal(item.contentHash, frozen.get(item.id).contentHash, `${item.id} 正文哈希漂移`)
    assert.equal(canonical(item.metadata), canonical(frozen.get(item.id).metadata), `${item.id} 目录元数据漂移`)
    assert.equal(item.status, 'uncalibrated')
  }
})

test('正文变化不能复用旧的 ID+正文哈希基线', () => {
  const current = currentCases()[0]
  const changed = { ...current, title: `${current.title}（修订）` }
  assert.notEqual(hashContent(changed), current.contentHash)
})

