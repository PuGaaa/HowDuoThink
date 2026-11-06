import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const source = readFileSync(resolve(root, 'app/pages/profile-edit/profile-edit.uvue'), 'utf8')

const template = source.match(/<template>([\s\S]*?)<\/template>/)[1]
const style = source.match(/<style>([\s\S]*?)<\/style>/)[1]

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

// 页面可用网格宽：750 - 内容区左右 32×2 - 表单卡左右 28×2 = 630rpx
const GRID_W = 750 - 2 * 32 - 2 * 28

test('头像网格稳定 4 列铺满（space-between，不留右侧大空位）', () => {
  const grid = cssBlock('avgrid')
  assert.match(grid, /justify-content\s*:\s*space-between/, '网格应用 space-between 铺满行宽')
  const item = cssBlock('avgrid__item')
  assert.ok(!/margin-right/.test(item), 'item 不应带 margin-right（间距交给 space-between）')
  const w = rpx(item, 'width')
  assert.ok(w > GRID_W / 5 && w <= GRID_W / 4, `item 宽 ${w}rpx 应落在 4 列区间 (${GRID_W / 5}, ${GRID_W / 4}]`)
})

test('选中勾不再被圆形轮廓裁切且层级置顶', () => {
  const item = cssBlock('avgrid__item')
  assert.ok(!/border-radius/.test(item), 'item 容器不应有圆角（原生端会裁切子元素，勾曾变成月牙）')
  const check = cssBlock('avgrid__check')
  const z = Number((check.match(/z-index\s*:\s*(\d+)/) || [])[1] || 0)
  assert.ok(z >= 1, '勾需要显式 z-index 压在头像图之上')
  assert.ok(rpx(check, 'right') <= 4 && rpx(check, 'bottom') <= 4, '勾应贴合头像右下角')

  // 选中橙环移到图片本体（模板对 image 绑定条件类，img 自圆自环）
  assert.match(template, /avgrid__img\s+avgrid__img--on/, '模板应给 image 绑定选中态类')
  const imgOn = cssBlock('avgrid__img--on')
  assert.match(imgOn, /border-color\s*:\s*#FF8A5C/, '选中态橙环应挂在 img 上')
})
