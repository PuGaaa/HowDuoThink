import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (p) => readFileSync(resolve(root, p), 'utf8')

const page = read('app/pages/account-settings/account-settings.uvue')
const tpl = page.match(/<template>([\s\S]*?)<\/template>/)[1]
const script = page.match(/<script[\s\S]*?<\/script>/)[0]

test('账号设置页存在且已注册路由（pages.json 预登记，不改 pages.json）', () => {
  assert.ok(existsSync(resolve(root, 'app/pages/account-settings/account-settings.uvue')), '缺少 account-settings.uvue')
  assert.match(read('app/pages.json'), /pages\/account-settings\/account-settings/, 'pages.json 未注册账号设置页')
})

test('页面骨架：safe-top + navbar + 两个条目（账号密码 / 注销账号·仅登录态）', () => {
  assert.match(page, /safe-top/, '缺 safe-top')
  assert.match(page, /components\/navbar\/navbar\.uvue/, '缺 navbar 组件')
  assert.match(tpl, /账号密码/, '缺「账号密码」条目')
  assert.match(tpl, /注销账号/, '缺「注销账号」条目')
  assert.match(tpl, /v-if="loggedIn"[^>]*@click="onDelete"|@click="onDelete"[^>]*v-if="loggedIn"/, '注销入口应限登录态')
  // 账号密码继续走既有密码页（该页保持不动）
  assert.match(script, /pages\/password\/password/, '账号密码应跳既有密码页')
})

test('注销必须二次确认，弹窗文案写清后果（不可恢复/进度清除/手机号匿名化）', () => {
  assert.match(script, /openConfirmDialog/, '注销应走全站确认弹窗二次确认')
  assert.match(script, /danger: true/, '确认弹窗应为危险样式')
  for (const keyword of ['不可恢复', '学习进度', '匿名化']) {
    assert.match(script, new RegExp(keyword), `弹窗文案缺少「${keyword}」后果说明`)
  }
})

test('确认后调注销接口，成功清理本地登录态与进度并回到上一页', () => {
  assert.match(script, /import\s*\{[^}]*deleteAccount[^}]*\}\s*from\s*'\.\.\/\.\.\/utils\/auth'/, '应从 utils/auth 导入 deleteAccount')
  assert.match(script, /deleteAccount\(/, '确认后应调用注销接口')
  assert.match(script, /deleteAccountLocal\(\)/, '成功后应清理本地登录态与进度')
  assert.match(script, /uni\.navigateBack/, '应回到「我的」页')
  assert.match(script, /账号已注销/, '应 toast 提示注销完成')
})

test('auth.ts 提供注销接口调用与本地清理，接口路径为 /api/me/delete', () => {
  const auth = read('app/utils/auth.ts')
  assert.match(auth, /export function deleteAccount/, '缺少 deleteAccount')
  assert.match(auth, /\/api\/me\/delete/, 'deleteAccount 应打 /api/me/delete')
  assert.match(auth, /export function deleteAccountLocal/, '缺少 deleteAccountLocal')
  // 本地清理覆盖：进度域 / 匿名事件队列 / 登录态
  assert.match(auth, /clearProgressLocal\(\)/, '本地进度清理应走 clearProgressLocal')
  assert.match(auth, /think_learning_events_v1_/, '应清理学习事件队列键')
  assert.match(auth, /think_learning_anonymous_id_v1/, '应清理匿名学习身份键')
})
