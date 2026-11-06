import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const source = readFileSync(resolve(root, 'app/pages/about/about.uvue'), 'utf8')

const template = source.match(/<template>([\s\S]*?)<\/template>/)[1]
const style = source.match(/<style>([\s\S]*?)<\/style>/)[1]
const script = source.match(/<script[\s\S]*?<\/script>/)[0]

const cssBlock = name => {
  const m = style.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))
  assert.ok(m, `缺少样式 .${name}`)
  return m[1]
}
const rpx = (block, prop) => {
  const m = block.match(new RegExp(`${prop}\\s*:\\s*(-?[\\d.]+)rpx`))
  assert.ok(m, `样式缺少 ${prop}`)
  return Number(m[1])
}

test('Hero 卡使用包内 LOGO，不再依赖远程吉祥物', () => {
  const logoPath = resolve(root, 'app/static/logo/app-logo.png')
  assert.ok(existsSync(logoPath), '缺少包内 LOGO 文件 app/static/logo/app-logo.png')
  assert.match(template, /src="\/static\/logo\/app-logo\.png"/, 'Hero 卡应直接引用包内 LOGO')
  assert.ok(!/getMascotUrl/.test(script), '关于页不再拉取远程吉祥物 URL')
  assert.ok(!/frogUrl/.test(source), '关于页不再使用 frog 槽位')

  // LOGO 以圆角方块呈现（App 图标观感），尺寸不小于 160rpx 保证主视觉
  const logoCss = cssBlock('herocard__logo')
  assert.ok(rpx(logoCss, 'width') >= 160 && rpx(logoCss, 'height') >= 160, 'LOGO 主视觉应足够大')
  assert.ok(rpx(logoCss, 'border-radius') > 0, 'LOGO 需要圆角（App 图标观感）')
})

test('已移除"这是什么"与"技术栈致谢"卡片', () => {
  assert.ok(!template.includes('这是什么'), '关于页不应再出现"这是什么"卡')
  assert.ok(!template.includes('技术栈致谢'), '关于页不应再出现"技术栈致谢"卡')
  // 技术栈内容不再出现（含 script 注释）
  assert.ok(!source.includes('FastAPI') && !source.includes('Nuxt'), '技术栈内容应整体移除')
  // 产品标语沉到页脚
  assert.match(template, /多想一步，星就多一颗/, '页脚应保留产品标语')
})

test('相关站点卡保留（展示行，域名指向社区站）', () => {
  assert.match(template, /相关站点/, '相关站点卡应保留')
  assert.match(template, /hdt\.moooooz\.com/, '站点行应显示社区站域名')
  // 站点行为纯展示（不绑点击）：不要求也不禁止 @click，只锁内容
  assert.ok(!/goHandbook/.test(source), '未使用的 goHandbook 死代码应移除')
})

test('数据与隐私卡说明本机进度与云同步', () => {
  assert.match(template, /数据与隐私/, '缺少数据与隐私卡')
  assert.match(template, /本机/, '隐私文案应说明进度存本机')
  assert.match(template, /云同步/, '隐私文案应说明登录后云同步')
  assert.match(template, /相册/, '隐私文案应说明相册权限用途')
})

test('Hero 卡显示版本号，取自共享常量', () => {
  // 版本行恢复在 hero 卡内（slogan 之后），绑定 utils 常量而非硬编码
  assert.match(template, /herocard__ver/, 'Hero 卡缺少版本行')
  assert.match(source, /import\s*\{\s*APP_VERSION\s*\}\s*from\s*'\.\.\/\.\.\/utils\/version'/, '版本号应从 utils/version 导入')
  assert.ok(!/'v0\.\d'\s*/.test(source), '关于页不允许硬编码版本字符串')
  const verCss = cssBlock('herocard__ver')
  assert.ok(rpx(verCss, 'font-size') >= 18, '版本号字号不应小于 18rpx')
})
