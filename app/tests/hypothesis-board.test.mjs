import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))

const playSource = readFileSync(resolve(root, 'app/pages/play/play.uvue'), 'utf8')
const board = readFileSync(resolve(root, 'app/components/drawer-board/drawer-board.uvue'), 'utf8')

// 函数体提取：以「行首 }」为函数收口（嵌套块均有缩进）
const fnBody = (source, name) => {
  const m = source.match(new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'))
  assert.ok(m, `缺少函数 ${name}`)
  return m[0]
}

test('假设板移除自由备注输入与备注列表', () => {
  assert.ok(!board.includes('freenote'), '备注列表与样式应整体移除')
  assert.ok(!board.includes('noterow'), '备注输入行与样式应整体移除')
  assert.ok(!board.includes('自由备注'), '备注占位文案应移除')
  assert.ok(!board.includes('addNote'), 'addNote 函数应移除')
  assert.ok(!board.includes('add-note'), 'add-note 事件声明应移除')
  assert.ok(!board.includes('freeNotes'), 'freeNotes prop 应移除')
})

test('play 页不再接线自由备注', () => {
  assert.ok(!playSource.includes('free-notes'), 'prop 绑定应移除')
  assert.ok(!playSource.includes('add-note'), '事件绑定应移除')
  assert.ok(!playSource.includes('freeNotes'), 'freeNotes 状态与逻辑应移除')
  assert.ok(!playSource.includes('addNote'), 'addNote 处理函数应移除')
})

test('提交守卫只看假设勾选，提交不再产生备注事件', () => {
  const fn = fnBody(playSource, 'submitHypotheses')
  assert.match(fn, /selected\.value\.length === 0/, '守卫应只判假设勾选')
  assert.ok(!fn.includes('备注：'), '提交不应再写入备注事件')
})
