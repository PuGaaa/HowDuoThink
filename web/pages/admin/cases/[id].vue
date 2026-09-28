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
const ALL_CHAPTERS = [
  { id: 'access', part: 'apprentice', name: '接入层之夜' },
  { id: 'build', part: 'apprentice', name: '构建与依赖' },
  { id: 'data', part: 'engineer', name: '数据的脾气' },
  { id: 'runtime', part: 'engineer', name: '运行时暗面' },
  { id: 'concurrency', part: 'master', name: '并发迷宫' },
  { id: 'observability', part: 'master', name: '可观测性迷雾' },
]
const chapterOptions = computed(() => {
  return ALL_CHAPTERS.filter((c) => c.part === meta.part)
})

onMounted(async () => {
  const r: any = await api.get('/api/admin/cases/' + cid.value)
  status.value = r.status
  payloadText.value = JSON.stringify(r.payload, null, 2)
  meta.part = r.payload.part || 'engineer'
  meta.chapterId = r.payload.chapterId || ''
  meta.order = r.payload.order || 1
  meta.typeTags = (r.payload.typeTags || []).join(', ')
})

const CHAPTER_PART_MAP: { [key: string]: string } = {
  access: 'apprentice', build: 'apprentice',
  data: 'engineer', runtime: 'engineer',
  concurrency: 'master', observability: 'master',
}

async function saveMeta() {
  msg.value = ''
  errs.value = []
  const ch = ALL_CHAPTERS.find((c) => c.id === meta.chapterId)
  if (ch) meta.part = CHAPTER_PART_MAP[meta.chapterId] || meta.part
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
  <div class="page">
    <div class="pagehead">
      <NuxtLink to="/admin" class="backlink">← 返回管理端</NuxtLink>
      <div class="pagehead__row">
        <h1 class="pagehead__title">Case 编辑</h1>
        <span class="statuschip">{{ status }}</span>
      </div>
      <p class="pagehead__id">{{ cid }}</p>
      <div class="placeholderbar">
        <span>待补充占位</span>
        <b :class="placeholderHits > 0 ? 'hot' : 'ok'">{{ placeholderHits }}</b>
        <span class="dim">处（tests 绑定 / 效应标注 / 干扰假设 需人工设计——这是创作，不是填表）</span>
      </div>
    </div>

    <!-- 三级架构元数据 -->
    <section class="panel">
      <h2 class="panel__title">三级架构元数据</h2>
      <div class="metagrid">
        <div class="mfield">
          <label>篇</label>
          <select v-model="meta.part">
            <option value="apprentice">侦探学徒篇</option>
            <option value="engineer">一线工兵篇</option>
            <option value="master">资深值班篇</option>
          </select>
        </div>
        <div class="mfield">
          <label>章</label>
          <select v-model="meta.chapterId">
            <option v-for="co in chapterOptions" :key="co.id" :value="co.id">{{ co.name }}</option>
          </select>
        </div>
        <div class="mfield">
          <label>章内排序</label>
          <input v-model.number="meta.order" type="number" min="1" />
        </div>
      </div>
      <div class="mfield mfield--full">
        <label>机理标签（逗号分隔）</label>
        <input v-model="meta.typeTags" placeholder="config, cert" />
        <span class="mfield__vocab">词表：config / dependency / race / resource / capacity / cert / timing / data</span>
      </div>
      <button class="metabtn" @click="saveMeta">保存元数据</button>
    </section>

    <!-- JSON 编辑器 -->
    <section class="panel panel--code">
      <h2 class="panel__title">Case Payload（JSON）</h2>
      <textarea v-model="payloadText" spellcheck="false" class="jsoneditor"></textarea>
    </section>

    <!-- 消息 -->
    <div v-if="msg" class="msgbar">{{ msg }}</div>
    <ul v-if="errs.length" class="errlist">
      <li v-for="(e, i) in errs" :key="i" class="errlist__item">{{ e }}</li>
    </ul>

    <!-- 操作 -->
    <div class="actions">
      <button class="actionbtn actionbtn--ghost" @click="save">保存草稿</button>
      <button class="actionbtn actionbtn--primary" @click="publish">发布（过门禁）</button>
    </div>
    <p class="deployhint">发布 = Pydantic 结构校验 + 门禁红线（排除路径/影响面动作/专家链首末步/危险动作）+ version 递增 + 文章投影。App 端 casepack 拉取后可见。</p>
  </div>
</template>

<style>
.page {
  max-width: 760px; margin: 0 auto; padding: 28px 24px 80px;
  font-family: -apple-system, 'PingFang SC', sans-serif; color: #4A4458;
}
.pagehead { margin-bottom: 24px; }
.pagehead__row { display: flex; align-items: center; gap: 14px; }
.pagehead__title { font-size: 24px; font-weight: 800; color: #4A4458; margin: 0; }
.pagehead__id { font-size: 13px; color: #AFA8BD; margin: 6px 0 0; }
.statuschip { display: inline-block; font-size: 12px; font-weight: 700; border-radius: 999px; padding: 4px 14px; background: #E9F7F1; color: #2E7D5B; }
.backlink { font-size: 13px; color: #AFA8BD; text-decoration: none; display: inline-block; margin-bottom: 14px; }
.backlink:hover { color: var(--coral); }
.placeholderbar { font-size: 13px; margin: 14px 0 22px; }
.placeholderbar .hot { color: var(--coral-deep); font-size: 16px; }
.placeholderbar .ok { color: var(--mint-deep); font-size: 16px; }
.placeholderbar .dim { color: #AFA8BD; font-size: 12px; }

.panel { background: #fff; border-radius: 16px; border: 2px solid #F5E6DA; padding: 22px 24px; margin-bottom: 20px; }
.panel__title { font-size: 16px; font-weight: 800; color: #4A4458; margin: 0 0 16px; }

.metagrid { display: flex; gap: 16px; margin-bottom: 14px; }
.mfield { flex: 1; }
.mfield--full { margin-top: 4px; }
.mfield label { display: block; font-size: 12px; font-weight: 700; color: #7A7290; margin-bottom: 5px; }
.mfield select, .mfield input {
  width: 100%; border: 2px solid #F5E6DA; border-radius: 10px;
  padding: 9px 14px; font-size: 14px; color: #4A4458; background: #FFF9F4;
}
.mfield select:focus, .mfield input:focus { outline: none; border-color: var(--coral); }
.mfield__vocab { font-size: 11px; color: #C5C0D0; margin-top: 4px; display: block; }
.metabtn {
  background: #FFF1E7; color: var(--coral-deep); border: 2px solid #FFD3BC;
  border-radius: 10px; padding: 8px 22px; font-size: 13px; font-weight: 700; cursor: pointer;
}
.metabtn:hover { background: #FFD3BC; }

.jsoneditor {
  width: 100%; min-height: 480px;
  font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 13px; line-height: 1.7;
  border: 2px solid #F5E6DA; border-radius: 14px; padding: 18px;
  background: #FFFDFB; color: #3A3440; resize: vertical;
}
.jsoneditor:focus { outline: none; border-color: var(--coral); }

.msgbar { text-align: center; font-weight: 700; font-size: 14px; color: var(--mint-deep); background: #E9F7F1; border-radius: 10px; padding: 10px; margin: 14px 0; }
.errlist { color: var(--red); font-size: 13px; padding-left: 18px; margin: 10px 0; }

.actions { display: flex; gap: 14px; margin: 20px 0; }
.actionbtn {
  flex: 1; border-radius: 999px; padding: 14px 28px;
  font-size: 15px; font-weight: 800; cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
}
.actionbtn:active { transform: translateY(3px); }
.actionbtn--primary { background: var(--coral); color: #fff; border: 0; box-shadow: 0 5px 0 var(--coral-deep); }
.actionbtn--primary:active { box-shadow: 0 1px 0 var(--coral-deep); }
.actionbtn--ghost { background: #fff; color: var(--coral); border: 2.5px solid var(--coral); box-shadow: 0 5px 0 #F3CFA9; }
.actionbtn--ghost:active { box-shadow: 0 1px 0 #F3CFA9; }

.deployhint { font-size: 12px; color: #C5C0D0; text-align: center; margin-top: 30px; }
</style>
