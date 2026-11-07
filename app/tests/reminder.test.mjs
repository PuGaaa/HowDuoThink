import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const reminder = readFileSync(resolve(root, 'app/utils/reminder.ts'), 'utf8')
const manifest = JSON.parse(readFileSync(resolve(root, 'app/manifest.json'), 'utf8'))

test('App 端提醒走系统本地通知（uniPush createPushMessage），manifest 启用 Push 模块', () => {
  assert.match(reminder, /uni\.createPushMessage/, 'App 端到点应创建本地通知')
  assert.ok(manifest.app != null && manifest.app.modules != null && manifest.app.modules.Push != null, 'manifest app.modules.Push 未启用（无此模块 createPushMessage 不生效）')
})

test('前台收到本地通知要有应用内呈现（iOS 前台默认不显示横幅）', () => {
  assert.match(reminder, /uni\.onPushMessage/, '应注册 onPushMessage 处理前台呈现')
})

test('轮询驱动不再锁 H5（App/H5 都生效），当日去重保留', () => {
  const poll = reminder.match(/export function startReminderPolling\(\)[\s\S]*?\n\}\n/)[0]
  assert.ok(!poll.includes('#ifdef WEB'), '轮询不应再被 #ifdef WEB 锁死')
  assert.match(reminder, /KEY_SENT/, '当日去重保留')
})
