import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const source = readFileSync(resolve(root, 'app/pages/privacy/privacy.uvue'), 'utf8')
const util = readFileSync(resolve(root, 'app/utils/privacy-doc.ts'), 'utf8')
const about = readFileSync(resolve(root, 'app/pages/about/about.uvue'), 'utf8')
const pagesJson = readFileSync(resolve(root, 'app/pages.json'), 'utf8')

const template = source.match(/<template>([\s\S]*?)<\/template>/)[1]
const style = source.match(/<style>([\s\S]*?)<\/style>/)[1]
const script = source.match(/<script[\s\S]*?<\/script>/)[0]

const cssBlock = name => {
  const m = style.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))
  assert.ok(m, `缺少样式 .${name}`)
  return m[1]
}

test('页面已登记路由，依赖文件齐全', () => {
  assert.match(pagesJson, /pages\/privacy\/privacy/, 'pages.json 应登记隐私政策页')
  assert.ok(existsSync(resolve(root, 'app/utils/privacy-doc.ts')), '缺少 utils/privacy-doc.ts')
  assert.match(source, /import safeTop/, '应复用 safe-top 组件')
  assert.match(source, /import navbar/, '应复用 navbar 组件')
})

test('拉取与缓存走 utils，失败保留旧缓存并可重试', () => {
  assert.match(util, /think_privacy_doc_v1/, '缓存 key 应固定版本化')
  assert.match(util, /API_BASE \+ '\/api\/docs\/privacy-policy'/, '应请求公开文档接口')
  assert.match(source, /readCachedPrivacyDoc/, '应先渲染本地缓存（秒开）')
  assert.match(source, /fetchPrivacyDoc/, '应后台拉取最新文本')
  assert.match(script, /loadFailed/, '应有失败态')
  assert.match(template, /点击重试/, '失败态应可点击重试')
})

test('文本块渲染：标题/小节/条目分级，样式齐全', () => {
  assert.match(script, /startsWith\('## '\)/, '解析应区分 ## 小节')
  assert.match(script, /startsWith\('# '\)/, '解析应区分 # 标题')
  assert.match(script, /startsWith\('- '\)/, '解析应区分 - 条目')
  for (const cls of ['blk__h1', 'blk__h2', 'blk__li', 'blk__p']) {
    cssBlock(cls)
  }
  assert.match(template, /v-for="\(b, i\) in blocks"/, '应按块渲染全文')
})

test('关于好多星提供隐私政策入口', () => {
  assert.match(about, /隐私政策/, '关于页应有隐私政策入口')
  assert.match(about, /\/pages\/privacy\/privacy/, '入口应跳转隐私政策页')
})
