import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (p) => readFileSync(resolve(root, p), 'utf8')

test('密码页存在且已注册路由', () => {
  assert.ok(existsSync(resolve(root, 'app/pages/password/password.uvue')), '缺少 pages/password/password.uvue')
  const pages = read('app/pages.json')
  assert.match(pages, /pages\/password\/password/, 'pages.json 未注册密码页')
})

test('密码页三个密码输入 + 客户端校验 + 走 changePassword', () => {
  const source = read('app/pages/password/password.uvue')
  const template = source.match(/<template>([\s\S]*?)<\/template>/)[1]
  // 三个密码输入：当前密码（选填）/ 新密码 / 确认新密码
  assert.equal((template.match(/:password="true"/g) || []).length, 3, '应有三个密码输入框')
  assert.match(template, /confirm/, '应有确认新密码输入')

  // 保存走 auth.ts 的 changePassword，不做裸 uni.request
  assert.match(source, /import\s*\{[^}]*changePassword[^}]*\}\s*from\s*'\.\.\/\.\.\/utils\/auth'/, '应从 utils/auth 导入 changePassword')
  const script = source.match(/<script[\s\S]*?<\/script>/)[0]
  assert.match(script, /changePassword\(/, '保存应调用 changePassword')
  assert.match(script, /长度|6/, '新密码应校验最短 6 位')
  assert.match(script, /两次输入的新密码不一致|不一致/, '应校验两次输入一致')
  // 错误经 toast 显性暴露，不允许静默失败
  assert.match(script, /uni\.showToast/, '错误与成功都应 toast 提示')
})

test('auth.ts 提供 changePassword 与 fetchProfile，AppUser 带 hasPassword', () => {
  const auth = read('app/utils/auth.ts')
  assert.match(auth, /export function changePassword/, '缺少 changePassword')
  assert.match(auth, /\/api\/me\/password/, 'changePassword 应打 /api/me/password')
  assert.match(auth, /oldPassword/, 'payload 用 oldPassword 别名')
  assert.match(auth, /newPassword/, 'payload 用 newPassword 别名')
  assert.match(auth, /hasPassword/, 'AppUser 应带 hasPassword 字段')
  assert.match(auth, /export function fetchProfile/, '缺少 fetchProfile（GET /api/me 刷新登录资料）')
})

test('个人中心登录态展示设置/修改密码入口并正确分发', () => {
  const profile = read('app/pages/profile/profile.uvue')
  const template = profile.match(/<template>([\s\S]*?)<\/template>/)[1]
  // 账号区只在登录态出现
  assert.match(template, /v-if="user != null"[^>]*@click="goPassword"|@click="goPassword"[^>]*v-if="user != null"/, '设置/修改密码入口应限登录态')
  const script = profile.match(/<script[\s\S]*?<\/script>/)[0]
  assert.match(script, /function goPassword\(\)/, '缺少 goPassword 分发')
  assert.match(script, /pages\/password\/password/, 'goPassword 应跳密码页')
  // 入口文案由 hasPassword 驱动
  assert.match(script, /hasPassword/, '入口文案应依赖 hasPassword 字段')
})
