// 轻量 markdown 渲染：先整体 HTML 转义，再仅用白名单规则生成自有标签，杜绝 XSS。
// 覆盖 AI 回答实际用到的子集：段落、`#`~`###` 标题（深级并入 md-h3）、`---`/`***` 分隔线、
// 有序/无序列表、**加粗**、`行内代码`。标题渲染为带样式的 <p>（md-h 类）而非 h 标签——
// 气泡内不需要文档大纲语义，视觉层级交给 CSS。

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

export function renderMarkdownLite(src: string): string {
  const lines = escapeHtml(src).split('\n')
  const out: string[] = []
  let list: 'ol' | 'ul' | null = null
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const ol = line.match(/^\s*(\d+)[.、)]\s+(.*)$/)
    const ul = line.match(/^\s*[-*•]\s+(.*)$/)
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/)
    const hr = line.match(/^\s*(?:-{3,}|\*{3,})\s*$/)
    if (heading) {
      // 深于三级的标题并入 md-h3：reasoner 的 #### 以上极罕见，不值得各配一档字号
      const level = Math.min(heading[1].length, 3)
      closeList()
      out.push(`<p class="md-h md-h${level}">${inline(heading[2])}</p>`)
    } else if (hr) {
      closeList()
      out.push('<hr>')
    } else if (ol) {
      if (list !== 'ol') {
        closeList()
        out.push('<ol>')
        list = 'ol'
      }
      out.push(`<li>${inline(ol[2])}</li>`)
    } else if (ul) {
      if (list !== 'ul') {
        closeList()
        out.push('<ul>')
        list = 'ul'
      }
      out.push(`<li>${inline(ul[1])}</li>`)
    } else if (line.trim() === '') {
      closeList()
    } else {
      closeList()
      out.push(`<p>${inline(line)}</p>`)
    }
  }
  closeList()
  return out.join('')
}
