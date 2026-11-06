import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (p) => readFileSync(resolve(root, p), 'utf8')

const profile = read('app/pages/profile/profile.uvue')
const profileTpl = profile.match(/<template>([\s\S]*?)<\/template>/)[1]
const login = read('app/pages/login/login.uvue')
const loginTpl = login.match(/<template>([\s\S]*?)<\/template>/)[1]

test('个人中心移除「检查单云同步」手动入口（同步由写穿透与回页拉取自动完成）', () => {
  assert.ok(!profile.includes('检查单云同步'), '不应再有检查单云同步行')
  assert.ok(!/manualSync/.test(profile), '手动同步入口移除后不应再引用 manualSync')
})

test('忘记密码入口从个人中心迁移到登录页', () => {
  assert.ok(!profileTpl.includes('忘记密码'), '个人中心不应再有忘记密码入口')
  assert.ok(!/goForgot/.test(profile), '个人中心不应再有 goForgot 分发')
  assert.match(profile, /goPassword/, '设置/修改密码入口应保留')
  assert.match(loginTpl, /忘记密码/, '登录页应有忘记密码入口')
  const loginScript = login.match(/<script[\s\S]*?<\/script>/)[0]
  assert.match(loginScript, /function onForgot\(\)/, '登录页缺少 onForgot')
  assert.match(loginScript, /tab\.value = 'sms'/, '忘记密码应切到短信验证码登录（找回路径）')
})

test('学习提醒支持自定义时间（系统时间选择器）', () => {
  assert.match(profileTpl, /<picker[^>]*mode="time"/, '应有 mode=time 的 picker 作为自定义时间入口')
  assert.match(profile, /onCustomReminderTime/, 'picker change 应接 onCustomReminderTime')
  // 快捷选项与自定义共用同一套开启逻辑，避免权限/轮询/刷新三处复制
  assert.match(profile, /function applyReminder\(/, '应抽出 applyReminder 共享开启逻辑')
})
