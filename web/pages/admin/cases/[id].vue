<script setup lang="ts">
const route = useRoute()
const api = useApi()
const payloadText = ref('')
const cid = ref(String(route.params.id || ''))
const status = ref('')
const msg = ref('')
const errs = ref<string[]>([])
const placeholderHits = computed(() => (payloadText.value.match(/（待补充/g) || []).length)

const meta = reactive({ part: '', chapterId: '', order: 1, typeTags: '' })
const PARTS = [
  { id: 'apprentice', name: '侦探学徒篇' },
  { id: 'engineer', name: '一线工兵篇' },
  { id: 'master', name: '资深值班篇' },
]
const CHAPTER_LIST = [
  { id: 'access', name: '接入层之夜' },
  { id: 'build', name: '构建与依赖' },
  { id: 'data', name: '数据的脾气' },
  { id: 'runtime', name: '运行时暗面' },
  { id: 'concurrency', name: '并发迷宫' },
  { id: 'observability', name: '可观测性迷雾' },
]

onMounted(async () => {
  const r: any = await api.get('/api/admin/cases/' + cid.value)
  status.value = r.status
  payloadText.value = JSON.stringify(r.payload, null, 2)
  meta.part = r.payload.part || 'engineer'
  meta.chapterId = r.payload.chapterId || ''
  meta.order = r.payload.order || 1
  meta.typeTags = (r.payload.typeTags || []).join(', ')
})

async function saveMeta() {
  msg.value = ''
  errs.value = []
  try {
    await api.patch('/api/admin/cases/' + cid.value + '/meta', {
      part: meta.part,
      chapterId: meta.chapterId,
      order: Number(meta.order) || 1,
      typeTags: meta.typeTags.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean),
    })
    msg.value = '✓ 元数据已保存'
  } catch (e: any) {
    msg.value = e?.data?.detail || String(e)
  }
}

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

    <div class="card metacard">
      <div class="metacard__title">三级架构元数据</div>
      <div class="metarow">
        <div class="metarow__f">
          <label>篇</label>
          <select v-model="meta.part">
            <option value="apprentice">侦探学徒篇</option>
            <option value="engineer">一线工兵篇</option>
            <option value="master">资深值班篇</option>
          </select>
        </div>
        <div class="metarow__f">
          <label>章</label>
          <select v-model="meta.chapterId">
            <option value="access">接入层之夜</option>
            <option value="build">构建与依赖</option>
            <option value="data">数据的脾气</option>
            <option value="runtime">运行时暗面</option>
            <option value="concurrency">并发迷宫</option>
            <option value="observability">可观测性迷雾</option>
          </select>
        </div>
        <div class="metarow__f">
          <label>章内排序</label>
          <input v-model.number="meta.order" type="number" min="1" />
        </div>
      </div>
      <div class="metarow__f" style="margin-top: 10px">
        <label>机理标签（逗号分隔：config/dependency/race/resource/capacity/cert/timing/data）</label>
        <input v-model="meta.typeTags" placeholder="config, cert" />
      </div>
      <button class="btn btn--ghost" style="padding: 8px 18px; font-size: 13px; margin-top: 10px" @click="saveMeta">保存元数据</button>
    </div>

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
