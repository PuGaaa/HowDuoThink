import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const source = readFileSync(resolve(root, 'app/pages/post/post.uvue'), 'utf8')

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
// 容错版：属性缺失返回 null（装饰元素允许 left/right 两种锚定方式）
const rpxOr = (block, prop) => {
  const m = block.match(new RegExp(`${prop}\\s*:\\s*(-?[\\d.]+)rpx`))
  return m ? Number(m[1]) : null
}

// 计算 view 开标签的闭合位置（按 <view>/<\/view> 配平），用于判断嵌套关系
function sectionEnd(html, openIdx) {
  const re = /<\/?view\b[^>]*>/g
  re.lastIndex = openIdx
  let depth = 0
  let m
  while ((m = re.exec(html))) {
    if (m[0].startsWith('</view>')) {
      depth--
      if (depth === 0) return re.lastIndex
    } else {
      depth++
    }
  }
  return html.length
}

test('海报二维码行：文案在左、二维码在右，模板与导出画布同构', () => {
  const iText = template.indexOf('postcard__qrtext')
  const iWrap = template.indexOf('postcard__qrwrap')
  assert.ok(iText >= 0 && iWrap >= 0, '模板缺少二维码行元素')
  assert.ok(iText < iWrap, '模板中应先文案后二维码（二维码在文字右侧）')

  // 文案与二维码之间的间距应挂在文案右侧（换序后 margin-left 会贴到屏幕左缘）
  const qrtext = cssBlock('postcard__qrtext')
  assert.ok(rpx(qrtext, 'margin-right') >= 20, '文案右侧需要与二维码保持间距')
  assert.ok(!/\bmargin-left\s*:/.test(qrtext), '换序后文案不应再带 margin-left')

  // canvas 导出同构：券面块以画布中线居中（与页面 qrrow flex 居中同构），文案在码框左侧
  assert.match(script, /const panelW = brandW \+ 14 \+ 116 \+ 15 \+ 8 \+ 40/, '券面宽按内容推导（文字+间距+码框+恐龙伸出+边距）')
  assert.match(script, /const panelX = \(BW - panelW\) \/ 2/, '券面块必须以画布中线居中')
  assert.match(script, /const textX = panelX \+ 20/, '文案贴券面左内边距')
  assert.match(script, /const qrX = textX \+ brandW \+ 14/, '码框在文案右侧（间距 14）')
  assert.match(script, /ctx\.fillText\('扫码来试试', textX - BW \/ 2, 4\)/, '画布文案在便签坐标系内动态 x 左对齐绘制')
})

test('三角龙趴在二维码右上角且整只可见：伸出框缘的部分由行容器对称内边距容纳，不越界裁剪', () => {
  const row = cssBlock('postcard__qrrow')
  const dino = cssBlock('postcard__dino')

  // 恐龙的定位父级必须是 qrrow（relative），不能挂在 qrwrap 上用负偏移伸出框外
  assert.match(row, /position\s*:\s*relative/, 'qrrow 须为 relative，作为恐龙的定位父级')
  const rowOpen = template.lastIndexOf('<view', template.indexOf('class="postcard__qrrow"'))
  const wrapOpen = template.lastIndexOf('<view', template.indexOf('class="postcard__qrwrap"'))
  const wrapClose = sectionEnd(template, wrapOpen)
  const rowClose = sectionEnd(template, rowOpen)
  const dinoIdx = template.indexOf('postcard__dino')
  assert.ok(dinoIdx > wrapClose && dinoIdx < rowClose, '恐龙必须是 qrrow 的直接子节点，而非 qrwrap 内的负偏移元素')

  // 正偏移：整只恐龙落在行容器纵向边界内，原生端不会裁剪
  const dinoTop = rpx(dino, 'top')
  const dinoH = rpx(dino, 'height')
  const rowPadTop = rpx(row, 'padding-top')
  assert.ok(dinoTop >= 0, '恐龙 top 必须为非负值（负偏移会超出 qrwrap 被裁剪）')
  assert.ok(dinoTop + dinoH > rowPadTop, '恐龙下缘须压住白框上缘（趴框缘造型）')

  // 调定的位置关系：恐龙右缘伸出白框右缘（右上角趴框），不得改回框内
  // 行内容右缘 = 边界框右缘内缩 padRight 处，故「伸出」即 right < padding-right
  const dinoRight = rpx(dino, 'right')
  const pokePad = rpx(row, 'padding-right')
  assert.ok(dinoRight < pokePad, '恐龙右缘应伸出白框右缘（用户调定的右上角位置关系）')
  assert.ok(pokePad - dinoRight >= 20, '伸出量须 ≥ 20rpx，趴框造型才成立')

  // 防裁剪：qrrow 用左右对称的透明内边距把伸出部分包进边界框 —— 文案/白框绝对位置不变，任何端不裁剪
  const padRight = rpx(row, 'padding-right')
  const padLeft = rpx(row, 'padding-left')
  assert.equal(padRight, padLeft, '左右内边距须对称，行内容（文案/白框）绝对位置才不会移位')
  assert.ok(dinoRight + padRight >= 4, '恐龙右缘（含 4° 旋转角点约 4rpx 外扩）须留在行边界框内，不被裁剪')

  // canvas 导出同构：码图直接贴便签（便签即码纸，对应 qrframe 透明），恐龙右缘伸出码图右缘 15（101+30−116）
  assert.match(script, /ctx\.drawImage\(qrImg, qrX - BW \/ 2, -42, 116, 116\)/, '码图贴便签纸面（码图数据源自带静区）')
  const dinoMatch = script.match(/ctx\.translate\(([^,]+), (-?\d+)\)\s*\n\s*ctx\.rotate\(4/)
  assert.ok(dinoMatch, '导出画布应有恐龙绘制块')
  assert.match(script, /ctx\.translate\(qrX \+ 101 - BW \/ 2, -54\)/, '恐龙中心 = 码图右缘 − 15（伸出 15，含在便签内）')
  assert.ok(Number(dinoMatch[2]) + 30 - -42 <= 20, '导出画布中恐龙压码深度须与页面一致（约 35rpx·0.5）')
})

test('海报卡不顶到返回按钮：内容顶部留白盖过悬浮返回胶囊高度', () => {
  const content = cssBlock('content')
  assert.ok(rpx(content, 'padding-top') >= 96, '悬浮返回胶囊底缘距滚动区顶约 96rpx，内容顶部留白必须更大')
})

test('App 端保存走真实链路：截图海报卡元素后存相册，不留占位提示', () => {
  // 海报卡元素有 id，供 uni.getElementById 查询（App 端截图入口）
  assert.match(template, /class="postcard" id="postcard"/, '海报卡元素须带 id="postcard"')
  assert.ok(!/即将上线/.test(source), '不允许保留"即将上线"占位 toast（环境一致性：不许假实现）')
  assert.match(script, /uni\.getElementById\('postcard'\)/, 'App 端应查询海报卡元素')
  assert.match(script, /takeSnapshot\(/, 'App 端应对海报卡截图（复用页面渲染，不维护第二套绘制代码）')
  assert.match(script, /saveImageToPhotosAlbum\(/, '截图后须调用系统相册保存')

  // iOS 真机/云打包：manifest 须声明相册写入许可描述（uni-app x 路径 app-ios.distribute.privacyDescription）
  const manifest = JSON.parse(readFileSync(resolve(root, 'app/manifest.json'), 'utf8'))
  const privacy = manifest['app-ios']?.distribute?.privacyDescription ?? {}
  assert.ok(
    typeof privacy.NSPhotoLibraryAddUsageDescription === 'string' &&
      privacy.NSPhotoLibraryAddUsageDescription.length >= 6,
    'manifest 须声明 NSPhotoLibraryAddUsageDescription（保存海报到相册的许可描述）',
  )
})


test('终端贴纸改为标题左侧装饰：不再压照片右上角，行容器内边距容纳旋转角点外扩', () => {
  const iBadge = template.indexOf('postcard__titlebadge')
  const iTitleText = template.indexOf('这届 Bug 有点难抓')
  const iTerminal = template.indexOf('postcard__terminal')
  assert.ok(iBadge >= 0, '模板应有 titlerow + titlebadge 标题行')
  assert.ok(iBadge < iTitleText, '贴纸应在标题文字之前（标题左侧装饰）')
  assert.ok(iTerminal === -1, '终端贴纸不应再绝对定位压在照片右上角')

  // 防裁剪：8° 旋转角点外扩约 5rpx，行容器需对称内边距容纳（内容居中位置不变）
  const row = cssBlock('postcard__titlerow')
  const badge = cssBlock('postcard__titlebadge')
  assert.ok(rpx(row, 'padding') >= 8, 'titlerow 需 ≥8rpx 对称内边距容纳贴纸旋转角点外扩')
  assert.match(badge, /rotate\(-?8deg\)/, '贴纸需保留微旋转的手账质感')

  // canvas 导出同构：终端不再画在照片右上角，改为标题行左侧（组合按文字实测宽度居中）
  assert.ok(!/BW - 46/.test(script), '画布不应再在右上角画终端贴纸')
  assert.match(script, /const titleText = '这届 Bug 有点难抓'/, '标题文本应提取为常量')
  assert.match(script, /measureText\(titleText\)/, '标题行组合需按文字实测宽度居中')
  const termBlock = script.match(/ctx\.translate\(([^,]+), (\d+)\)\s*\n\s*ctx\.rotate\(8 \* Math\.PI \/ 180\)/)
  assert.ok(termBlock && Number(termBlock[2]) >= 330 && Number(termBlock[2]) <= 352, '画布终端贴纸应落在标题行中线（y≈341）')
  assert.match(script, /const termW = 44/, '画布贴纸宽 44（对应页面 68rpx 比例）')
  assert.match(script, /const termH = 33/, '画布贴纸高 33（对应页面 51rpx 比例）')
  assert.match(script, /ctx\.drawImage\(termImg, -22, -17, termW, termH\)/, '贴纸居中锚点绘制')
})

test('扫码区保持手账语言：无虚线券框、便签与照片同倾角，装饰元素均正偏移不越界', () => {
  const row = cssBlock('postcard__qrrow')
  assert.ok(!/dashed/.test(row), '虚线券框是 UI 语言，与手账拼贴冲突，应移除')
  assert.match(row, /rotate\(-1\.2deg\)/, '便签应与照片框同倾角（-1.2°，统一手账语言）')
  assert.ok(rpx(row, 'padding-bottom') >= 16, '码图下缘与便签边需要呼吸空间')

  // 装饰元素（星星/胶带）挂 qrrow 内、正偏移，不越界裁剪（背景/投影/胶带具体位置由设计迭代决定）
  const rowOpen = template.lastIndexOf('<view', template.indexOf('class="postcard__qrrow"'))
  const rowClose = sectionEnd(template, rowOpen)
  const sparkIdx = template.indexOf('postcard__spark')
  assert.ok(sparkIdx > rowOpen && sparkIdx < rowClose, '星星应挂在 qrrow 内')
  const spark = cssBlock('postcard__spark')
  assert.ok(rpx(spark, 'left') >= 0 && rpx(spark, 'bottom') >= 0, '星星须正偏移，不越界被裁剪')
  const tapeIdx = template.indexOf('postcard__qrtape')
  assert.ok(tapeIdx > rowOpen && tapeIdx < rowClose, '胶带应挂在 qrrow 内')
  const tape = cssBlock('postcard__qrtape')
  const tapeX = rpxOr(tape, 'left') ?? rpxOr(tape, 'right')
  const tapeY = rpxOr(tape, 'top')
  assert.ok(tapeX !== null && tapeX >= 0 && tapeY !== null && tapeY >= 0, '胶带须正偏移落在便签内，不越界裁剪')
  assert.match(tape, /rotate\(-30deg\)/, '胶带斜贴才有手账感')
  assert.match(script, /rgba\(248, 205, 214/, '导出画布应画粉色胶带（页面同构）')

  // canvas 导出同构：无虚线；便签 -1.2° 旋转绘制；星星不固定画在画布左下角
  assert.ok(!/setLineDash/.test(script), '导出画布不应再画虚线券框')
  assert.match(script, /ctx\.rotate\(-1\.2 \* Math\.PI \/ 180\)/, '导出画布便签应与页面同倾角旋转')
  assert.ok(!/BH - 46/.test(script), '画布不应把星星固定画在画布左下角')
})
