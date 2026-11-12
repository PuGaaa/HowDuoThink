<script setup lang="ts">
// 隐私政策（公开只读）：与 App「关于好多星 → 隐私政策」同一份数据（GET /api/docs/privacy-policy）。
// 管理端编辑后此处与 App 端同步生效；本页同时作为 App Store Connect 隐私政策 URL 与备案信息展示落点。
const config = useRuntimeConfig()
const apiBase = (config.public.apiBase as string).replace(/\/$/, '')

interface DocBlock { kind: 'h1' | 'h2' | 'li' | 'p'; text: string }
interface DocInfo {
  content: string
  updatedAt: string | null
  updatedBy: string | null
  customized: boolean
}

const { data: doc, error, status } = await useFetch<DocInfo>(`${apiBase}/api/docs/privacy-policy`, { timeout: 8000 })

/** 与 App 端同一套块解析：'# '标题、'## '小节、'- '条目、空行分段；行内 ** 加粗标记去除 */
function parseBlocks(content: string): DocBlock[] {
  const out: DocBlock[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('## ')) out.push({ kind: 'h2', text: line.slice(3) })
    else if (line.startsWith('# ')) out.push({ kind: 'h1', text: line.slice(2) })
    else if (line.startsWith('- ')) out.push({ kind: 'li', text: '· ' + line.slice(2).replaceAll('**', '') })
    else out.push({ kind: 'p', text: line.replaceAll('**', '') })
  }
  return out
}

const blocks = computed(() => (doc.value ? parseBlocks(doc.value.content) : []))

useHead({ title: '隐私政策 · 好多星 HowDuoThink' })
</script>

<template>
  <div>
    <h1 style="font-size: 22px">隐私政策</h1>
    <p v-if="doc?.updatedAt" class="muted" style="margin-top: -6px">更新于 {{ doc.updatedAt }}</p>

    <div v-if="status === 'pending'" class="muted">加载中……</div>
    <div v-else-if="error || !doc" class="card muted">隐私政策暂时加载失败，请稍后刷新重试。</div>
    <div v-else class="card doc">
      <template v-for="(b, i) in blocks" :key="i">
        <h2 v-if="b.kind === 'h1'" class="doc__h1">{{ b.text }}</h2>
        <h3 v-else-if="b.kind === 'h2'" class="doc__h2">{{ b.text }}</h3>
        <p v-else-if="b.kind === 'li'" class="doc__li">{{ b.text }}</p>
        <p v-else class="doc__p">{{ b.text }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.doc { line-height: 1.75; }
.doc__h1 { font-size: 19px; font-weight: 800; color: var(--ink); margin: 6px 0 10px; }
.doc__h2 { font-size: 15.5px; font-weight: 700; color: var(--ink); margin: 22px 0 6px; }
.doc__p { font-size: 14px; color: var(--ink2); margin: 8px 0; }
.doc__li { font-size: 14px; color: var(--ink2); margin: 8px 0 8px 4px; padding-left: 10px; }
</style>
