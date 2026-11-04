import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateCatalog } from './validate-catalog.mjs'

test('目录满足试玩与 chapterId→part 约束', () => {
  assert.deepEqual(validateCatalog(), [])
})
