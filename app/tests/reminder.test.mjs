import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (p) => readFileSync(resolve(root, p), 'utf8')
const reminder = read('app/utils/reminder.ts')
const manifest = JSON.parse(readFileSync(resolve(root, 'app/manifest.json'), 'utf8'))
const profile = read('app/pages/profile/profile.uvue')

test('iOS 本地通知 UTS 插件存在且用系统日程触发器（app 被杀也弹）', () => {
  const swift = read('app/uni_modules/hduo-reminder/utssdk/app-ios/index.swift')
  assert.match(swift, /UNUserNotificationCenter/, '应使用 UNUserNotificationCenter')
  assert.match(swift, /UNCalendarNotificationTrigger[\s\S]*repeats:\s*true/, '应用每日重复日程触发器')
  assert.match(swift, /removePendingNotificationRequests/, '换时间应先移除旧通知再注册')
})

test('reminder.ts 不再依赖 uniPush（createPushMessage/onPushMessage 撤除），轮询仅服务 H5', () => {
  assert.ok(!reminder.includes('createPushMessage'), '不应再有 createPushMessage')
  assert.ok(!reminder.includes('onPushMessage'), '不应再有 onPushMessage')
  const poll = reminder.match(/export function startReminderPolling\(\)[\s\S]*?\n\}\n/)[0]
  assert.ok(poll.includes('#ifdef WEB'), '轮询应仅 H5（App 由系统调度，无需轮询）')
})

test('manifest 不再启用 Push 模块（本地通知不需要，且引入个推 SDK）', () => {
  const noPush = manifest.app == null || manifest.app.modules == null || manifest.app.modules.Push == null
  assert.ok(noPush, 'manifest 不应再启用 Push 模块')
})

test('个人中心提醒设置接线插件：App 端调度/取消', () => {
  assert.match(profile, /scheduleDailyReminder\(/, '应调用 scheduleDailyReminder 注册系统每日提醒')
  assert.match(profile, /cancelDailyReminder\(\)/, '关闭提醒应调用 cancelDailyReminder')
})
