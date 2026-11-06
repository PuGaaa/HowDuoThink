import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (p) => readFileSync(resolve(root, p), 'utf8')

test('忘记密码页存在且已注册路由，登录页入口跳转到它', () => {
  assert.ok(existsSync(resolve(root, 'app/pages/forgot/forgot.uvue')), '缺少 pages/forgot/forgot.uvue')
  assert.match(read('app/pages.json'), /pages\/forgot\/forgot/, 'pages.json 未注册忘记密码页')
  const login = read('app/pages/login/login.uvue')
  const script = login.match(/<script[\s\S]*?<\/script>/)[0]
  assert.match(script, /function onForgot\(\)/, '登录页缺少 onForgot')
  assert.match(script, /pages\/forgot\/forgot/, '忘记密码应跳转独立找回页，而不是仅提示')
})

test('忘记密码两步：短信验证手机号 → 通过后才给新密码框', () => {
  const source = read('app/pages/forgot/forgot.uvue')
  const template = source.match(/<template>([\s\S]*?)<\/template>/)[1]
  const script = source.match(/<script[\s\S]*?<\/script>/)[0]
  // 第一步：手机号 + 验证码 + 获取验证码
  assert.match(template, /手机号/, '第一步应有手机号输入')
  assert.match(template, /验证码/, '第一步应有验证码输入')
  assert.match(script, /sendSmsCode\(/, '获取验证码应复用 sendSmsCode')
  // 两步由 step 状态切换：验证通过前不出现密码框
  assert.match(template, /v-if="step === 'verify'"/, '第一步应受 step 状态控制')
  assert.match(template, /v-(else|if="step === 'reset'")/, '第二步应受 step 状态控制')
  assert.equal((template.match(/:password="true"/g) || []).length, 2, '第二步应有新密码 + 确认两个密码框')
  // 第二步校验与提交
  assert.match(script, /verifyResetCode\(/, '第一步应调用 verifyResetCode 换取重置票据')
  assert.match(script, /resetPassword\(/, '第二步应调用 resetPassword')
  assert.match(script, /不一致/, '应校验两次输入一致')
  assert.match(script, /6/, '新密码应校验最短 6 位')
  assert.match(script, /navigateBack/, '重置成功应返回登录页')
})

test('auth.ts 提供找回密码两步接口封装', () => {
  const auth = read('app/utils/auth.ts')
  assert.match(auth, /export function verifyResetCode/, '缺少 verifyResetCode')
  assert.match(auth, /\/api\/auth\/password\/reset\/verify/, 'verifyResetCode 应打 reset/verify')
  assert.match(auth, /export function resetPassword/, '缺少 resetPassword')
  assert.match(auth, /\/api\/auth\/password\/reset'/, 'resetPassword 应打 /api/auth/password/reset')
  assert.match(auth, /resetToken/, '第二步 payload 应带 resetToken')
})
