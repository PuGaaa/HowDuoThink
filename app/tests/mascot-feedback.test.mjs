import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const require = createRequire(import.meta.url)
const ts = require(process.env.THINK_REVIEW_TYPESCRIPT || resolve(root, 'web/node_modules/typescript'))

function loadMascot() {
  const compiled = ts.transpileModule(readFileSync(resolve(root, 'app/utils/mascot.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  const wrapper = new vm.Script(`(function(require,module,exports){${compiled}\n})`).runInThisContext()
  wrapper(require, module, module.exports)
  return module.exports
}

const playSource = readFileSync(resolve(root, 'app/pages/play/play.uvue'), 'utf8')
const mascotComp = readFileSync(resolve(root, 'app/components/mascot/mascot.uvue'), 'utf8')

// 函数体提取：以「行首 }」为函数收口（嵌套块均有缩进）
const fnBody = (source, name) => {
  const m = source.match(new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'))
  assert.ok(m, `缺少函数 ${name}`)
  return m[0]
}

test('选错根因：垂耳兔改为固定引导文案，弹窗不自动消失（sticky）', () => {
  const m = loadMascot()
  const lines = new Set()
  for (let i = 0; i < 10; i++) {
    const a = m.onWrongIdentify()
    assert.equal(a.id, 'rabbit')
    assert.equal(a.sticky, true, '选错反馈应 sticky：点击才收，不被 2.8s 计时藏掉')
    lines.add(a.line)
  }
  assert.equal(lines.size, 1, '选错反馈应是固定引导文案，不再随机嘲讽')
  assert.match([...lines][0], /回假设板/, '引导文案应指明下一步动作')
})

test('出局：三角龙安慰弹窗同样 sticky（点击才收）', () => {
  const m = loadMascot()
  const a = m.onEliminated()
  assert.equal(a.id, 'dino')
  assert.equal(a.sticky, true)
})

test('开场恐怖蛙与动作结算的动物保持自动消失（sticky=false）', () => {
  const m = loadMascot()
  assert.equal(m.onSceneOpen(['error']).sticky, false)
  const r = m.onActionResolved(0, 'high', 0)
  assert.equal(r.appearance.sticky, false)
})

test('mascot 气泡层级高于抽屉（z-index ≥ 98），不再被盖住', () => {
  const style = mascotComp.match(/<style>([\s\S]*?)<\/style>/)[1]
  const block = style.match(/\.mascot\s*\{([^}]*)\}/)
  assert.ok(block, '缺少 .mascot 样式')
  const z = block[1].match(/z-index\s*:\s*(\d+)/)
  assert.ok(z && Number(z[1]) >= 98, `气泡 z-index 应 ≥ 98（抽屉为 97），当前为 ${z ? z[1] : '缺失'}`)
})

test('sticky 弹窗支持点击收起：组件发 dismiss，play 页接住', () => {
  assert.match(mascotComp, /@click="\$emit\('dismiss'\)"/, '气泡根节点应可点击收起')
  assert.match(mascotComp, /defineEmits\(\['dismiss'\]\)/, '组件应声明 dismiss 事件')
  assert.match(playSource, /@dismiss="dismissMascot"/, 'play 页应监听 dismiss')
  const fn = playSource.match(/function dismissMascot\(\)\s*\{[\s\S]*?\n\}/)
  assert.ok(fn, '缺少 dismissMascot 处理')
})

test('appear 按 sticky 区分：重要反馈不自动消失，普通仍定时收', () => {
  const fn = fnBody(playSource, 'appear')
  assert.match(fn, /m\.sticky/, 'appear 应依据 sticky 决定是否定时收起')
})

test('第 2 次错误出局：自动收起抽屉露出终局条', () => {
  const fn = fnBody(playSource, 'confirmIdentify')
  assert.match(fn, /wrongCount\.value >= maxWrong[\s\S]*?drawerOpen\.value = false/, '出局分支应关闭抽屉')
})

test('指认抽屉移除 reguide 纯文字块，反馈只走弹窗', () => {
  assert.ok(!playSource.includes('reguide'), 'reguide 文字块与样式应整体移除')
  assert.ok(!playSource.includes('你的证据链指向了别处'), '引导文案移交 mascot 引擎')
})

test('验证动作与指认根因列表恢复 scroll-view 滚动（假设板同款写法）', () => {
  // 假设板（drawer-board）的 scroll-view 在同一抽屉内已被真机验证可滚动且 tap 正常
  assert.match(
    playSource,
    /<scroll-view class="drawer__scroll" direction="vertical">/,
    '验证动作列表区应恢复 scroll-view（v4 曾误删导致内容裁剪）'
  )
  assert.match(
    playSource,
    /<scroll-view class="dscroll" direction="vertical">/,
    '指认根因列表区应恢复 scroll-view'
  )
})

test('抽屉打开时动物弹窗抬升，不遮挡底部确认按钮', () => {
  assert.match(mascotComp, /mascot--raised/, '应有抬升态样式类')
  const style = mascotComp.match(/<style>([\s\S]*?)<\/style>/)[1]
  const raised = style.match(/\.mascot--raised\s*\{([^}]*)\}/)
  assert.ok(raised, '缺少 .mascot--raised 样式')
  const bottom = raised[1].match(/bottom\s*:\s*(\d+)rpx/)
  assert.ok(
    bottom && Number(bottom[1]) >= 300,
    `抬升后 bottom 应 ≥ 300rpx（确认按钮顶缘约 266rpx），当前为 ${bottom ? bottom[1] + 'rpx' : '缺失'}`
  )
  assert.match(playSource, /:raised="drawerOpen"/, 'play 页应传入 drawerOpen 控制抬升')
})

test('抽屉关闭时弹窗保持原位（bottom 140rpx 不变）', () => {
  const style = mascotComp.match(/<style>([\s\S]*?)<\/style>/)[1]
  const base = style.match(/\.mascot\s*\{([^}]*)\}/)
  assert.ok(base, '缺少 .mascot 样式')
  assert.match(base[1], /bottom\s*:\s*140rpx/, '默认位置应保持 140rpx（开场震惊娃观感不变）')
})
