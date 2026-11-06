import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (p) => readFileSync(resolve(root, p), 'utf8')

test('APP_VERSION 是唯一事实源且与 manifest versionName 一致', () => {
  const manifest = JSON.parse(read('app/manifest.json'))
  const versionTs = read('app/utils/version.ts')
  const m = versionTs.match(/APP_VERSION\s*(?::\s*string\s*)?=\s*'([^']+)'/)
  assert.ok(m, 'utils/version.ts 缺少 APP_VERSION 常量')
  assert.equal(m[1], 'v' + manifest.versionName, 'APP_VERSION 应为 v + manifest.versionName')
})

test('profile 页版本显示不再硬编码', () => {
  const profile = read('app/pages/profile/profile.uvue')
  assert.ok(!/'v0\.\d'/.test(profile), 'profile 页不应硬编码版本字符串')
  assert.match(profile, /APP_VERSION/, 'profile 页应使用 APP_VERSION 常量')
})
