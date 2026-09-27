<script setup lang="ts">
const route = useRoute()
const api = useApi()
const payloadText = ref('')
const cid = ref(String(route.params.id || ''))
const status = ref('')
const msg = ref('')
const errs = ref<string[]>([])
const placeholderHits = computed(() => (payloadText.value.match(/（待补充/g) || []).length)

onMounted(async () => {
  const r: any = await api.get('/api/admin/cases/' + cid.value)
  status.value = r.status
  payloadText.value = JSON.stringify(r.payload, null, 2)
})

async function save() {
  msg.value = ''
  errs.value = []
  try {
    const payload = JSON.parse(payloadText.value)
    const r: any = await api.post('/api/admin/cases', { id: cid.value, payload })
    status.value = r.status
    msg.value = '草稿已保存'
  } catch (e: any) {
    msg.value = 'JSON 解析失败：' + (e?.message || String(e))
  }
}

async function publish() {
  msg.value = ''
  errs.value = []
  try {
    const payload = JSON.parse(payloadText.value)
    await api.post('/api/admin/cases', { id: cid.value, payload })
    const r: any = await api.post('/api/cases', payload)
    status.value = 'published'
    msg.value = '✓ 已发布 v' + r.version + '，文章 ' + r.articleId
  } catch (e: any) {
    const d = e?.data
    if (Array.isArray(d)) errs.value = d.map((x: any) => (x.msg || '') + ' @ ' + (x.loc || []).join('.'))
    else if (d?.detail?.errors) errs.value = d.detail.errors
    else if (d?.message) errs.value = [d.message, ...(d.errors || [])]
    else msg.value = String(e?.message || e)
  }
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center">
      <h1 style="font-size: 22px; margin: 0">Case 编辑 · {{ cid }}</h1>
      <span class="chip">{{ status }}</span>
    </div>
    <p class="muted">
      待补充占位：<b :style="placeholderHits > 0 ? 'color: var(--coral-deep)' : 'color: var(--mint-deep)'">{{ placeholderHits }}</b> 处
      （tests 绑定 / 效应标注 / 干扰假设 需人工设计——这是创作，不是填表）
    </p>

    <textarea v-model="payloadText" spellcheck="false"
      style="width: 100%; min-height: 520px; font-family: Menlo, monospace; font-size: 12.5px; line-height: 1.6;
             border: 2px solid var(--line); border-radius: 14px; padding: 16px; background: #fff; color: var(--ink)"></textarea>

    <div v-if="msg" style="margin: 10px 0; font-weight: 700">{{ msg }}</div>
    <ul v-if="errs.length" style="color: var(--red)">
      <li v-for="(e, i) in errs" :key="i">{{ e }}</li>
    </ul>

    <div style="display: flex; gap: 12px; margin: 16px 0">
      <button class="btn btn--ghost" @click="save">保存草稿</button>
      <button class="btn" @click="publish">发布（过门禁）</button>
    </div>
    <p class="muted">发布 = Pydantic 结构校验 + 门禁红线（排除路径/影响面动作/专家链首末步/危险动作）+ version 递增 + 文章投影。App 端 casepack 拉取后可见。</p>
  </div>
</template>
