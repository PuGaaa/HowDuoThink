<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { NButton, NInput, NInputNumber, NSelect, NTag } from 'naive-ui'
import { contentApi } from '../api/content'

const route = useRoute()
const message = useMessage()
const cid = ref(String(route.params.id || ''))

const status = ref('')
const version = ref(0)
const payloadText = ref('')
const msg = ref('')
const errs = ref<string[]>([])
const loading = ref(true)
const previewUrl = ref('')

const meta = ref({ part: 'engineer', chapterId: '', order: 1, typeTags: '' })

const PART_OPTIONS = [
  { label: '侦探学徒篇', value: 'apprentice' },
  { label: '一线工兵篇', value: 'engineer' },
  { label: '资深值班篇', value: 'master' },
]
const CHAPTER_PART_MAP: Record<string, string> = {
  access: 'apprentice', build: 'apprentice', 'error-reading': 'apprentice', integration: 'apprentice',
  data: 'engineer', runtime: 'engineer', contract: 'engineer', 'config-boot': 'engineer',
  concurrency: 'master', observability: 'master', security: 'master', evolution: 'master',
  messaging: 'master', deployment: 'master', network: 'master', testing: 'master',
}
const CHAPTER_NAMES: Record<string, string> = {
  access: '接入层之夜', build: '构建与依赖', data: '数据的脾气', runtime: '运行时暗面',
  concurrency: '并发迷宫', observability: '可观测性迷雾',
}

const chapterOptions = computed(() => {
  const known = Object.keys(CHAPTER_PART_MAP).map((id) => ({
    label: CHAPTER_NAMES[id] || id,
    value: id,
    part: CHAPTER_PART_MAP[id],
  }))
  const opts = known.filter((o) => o.part === meta.value.part)
  // payload 里已有但不在词表的章 id：保留可选中，避免打开编辑器就丢数据
  if (meta.value.chapterId && !opts.some((o) => o.value === meta.value.chapterId)) {
    opts.unshift({ label: meta.value.chapterId + '（词表外）', value: meta.value.chapterId, part: meta.value.part })
  }
  return opts
})

const placeholderHits = computed(() => (payloadText.value.match(/（待补充/g) || []).length)

onMounted(async () => {
  try {
    const r = await contentApi.caseDetail(cid.value)
    status.value = r.status
    version.value = r.version
    payloadText.value = JSON.stringify(r.payload, null, 2)
    meta.value.part = r.payload.part || 'engineer'
    meta.value.chapterId = r.payload.chapterId || ''
    meta.value.order = r.payload.order || 1
    meta.value.typeTags = (r.payload.typeTags || []).join(', ')
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
})

function onPartChange() {
  const ch = CHAPTER_PART_MAP[meta.value.chapterId]
  if (ch && ch !== meta.value.part) meta.value.chapterId = ''
}

async function saveMeta() {
  msg.value = ''
  errs.value = []
  try {
    await contentApi.updateMeta(cid.value, {
      part: meta.value.part,
      chapterId: meta.value.chapterId,
      order: Number(meta.value.order) || 1,
      typeTags: meta.value.typeTags.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean),
    })
    message.success('元数据已保存')
  } catch (e: any) {
    message.error(e?.message || '保存元数据失败')
  }
}

async function saveDraft() {
  msg.value = ''
  errs.value = []
  try {
    const payload = JSON.parse(payloadText.value)
    const r = await contentApi.saveDraft(cid.value, payload)
    status.value = r.status
    message.success('草稿已保存')
  } catch (e: any) {
    if (e instanceof SyntaxError) message.error('JSON 解析失败：' + e.message)
    else message.error(e?.message || '保存失败')
  }
}

async function publish() {
  msg.value = ''
  errs.value = []
  let payload: any
  try {
    payload = JSON.parse(payloadText.value)
  } catch (e: any) {
    message.error('JSON 解析失败：' + e.message)
    return
  }
  try {
    await contentApi.saveDraft(cid.value, payload)
    const r = await contentApi.publish(payload)
    status.value = 'published'
    version.value = r.version
    message.success(`已发布 v${r.version}，文章 ${r.articleId}`)
  } catch (e: any) {
    const d = e?.detail
    if (Array.isArray(d)) errs.value = d.map((x: any) => (x.msg || '') + ' @ ' + (x.loc || []).join('.'))
    else if (d?.errors) errs.value = d.errors
    else if (d?.message) errs.value = [d.message, ...(d.errors || [])]
    else errs.value = [e?.message || String(e)]
  }
}

async function preview() {
  try {
    const payload = JSON.parse(payloadText.value)
    const r = await contentApi.preview(cid.value, payload)
    previewUrl.value = r.previewUrl
    window.open(r.previewUrl, '_blank')
    message.success('预览链接已生成')
  } catch (e: any) {
    if (e instanceof SyntaxError) message.error('JSON 解析失败：' + e.message)
    else message.error(e?.message || '生成预览失败')
  }
}
</script>

<template>
  <div v-if="loading">加载中……</div>
  <div v-else>
    <div class="pagehead">
      <div class="pagehead__row">
        <h1 class="pagehead__title">Case 编辑</h1>
        <NTag size="small" :type="status === 'published' ? 'success' : 'warning'">
          {{ status }}{{ version ? ' · v' + version : '' }}
        </NTag>
      </div>
      <p class="pagehead__id">{{ cid }}</p>
      <div class="placeholderbar">
        <span>待补充占位</span>
        <b :class="placeholderHits > 0 ? 'hot' : 'ok'">{{ placeholderHits }}</b>
        <span class="dim">处（tests 绑定 / 效应标注 / 干扰假设 需人工设计——这是创作，不是填表）</span>
      </div>
    </div>

    <section class="panel glass-panel">
      <h2 class="panel__title">三级架构元数据</h2>
      <div class="metagrid">
        <div class="mfield">
          <label>篇</label>
          <NSelect v-model:value="meta.part" :options="PART_OPTIONS" @update:value="onPartChange" />
        </div>
        <div class="mfield">
          <label>章</label>
          <NSelect v-model:value="meta.chapterId" :options="chapterOptions" placeholder="选择章" clearable />
        </div>
        <div class="mfield">
          <label>章内排序</label>
          <NInputNumber v-model:value="meta.order" :min="1" class="w100" />
        </div>
      </div>
      <div class="mfield mfield--full">
        <label>机理标签（逗号分隔）</label>
        <NInput v-model:value="meta.typeTags" placeholder="config, cert" />
        <span class="mfield__vocab">词表：config / dependency / race / resource / capacity / cert / timing / data</span>
      </div>
      <NButton size="small" @click="saveMeta">保存元数据</NButton>
    </section>

    <section class="panel glass-panel">
      <h2 class="panel__title">Case Payload（JSON）</h2>
      <NInput
        v-model:value="payloadText"
        type="textarea"
        :autosize="{ minRows: 22, maxRows: 40 }"
        class="jsoneditor"
        :input-props="{ spellcheck: false }"
      />
    </section>

    <ul v-if="errs.length" class="errlist">
      <li v-for="(e, i) in errs" :key="i">{{ e }}</li>
    </ul>

    <div class="actions">
      <NButton size="large" secondary @click="saveDraft">保存草稿</NButton>
      <NButton size="large" secondary @click="preview">生成 H5 预览</NButton>
      <NButton size="large" type="primary" @click="publish">发布（过门禁）</NButton>
    </div>
    <p v-if="previewUrl" class="previewurl">预览链接：{{ previewUrl }}</p>
    <p class="deployhint">
      发布 = Pydantic 结构校验 + 门禁红线（排除路径/影响面动作/专家链首末步/危险动作）+ version 递增 +
      文章投影。App 端 casepack 拉取后可见。
    </p>
  </div>
</template>

<style scoped>
.pagehead {
  margin-bottom: 20px;
}
.pagehead__row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pagehead__title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}
.pagehead__id {
  font-size: 13px;
  color: var(--ink3);
  margin: 6px 0 0;
}
.placeholderbar {
  font-size: 13px;
  margin: 12px 0 18px;
}
.placeholderbar .hot {
  color: var(--red-deep);
  font-size: 16px;
}
.placeholderbar .ok {
  color: var(--mint-deep);
  font-size: 16px;
}
.placeholderbar .dim {
  color: var(--ink3);
  font-size: 12px;
}
.panel {
  padding: 20px 22px;
  margin-bottom: 18px;
}
.panel__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 14px;
}
.metagrid {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}
.mfield {
  flex: 1;
}
.mfield--full {
  margin: 4px 0 14px;
}
.mfield label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink2);
  margin-bottom: 5px;
}
.mfield__vocab {
  font-size: 11px;
  color: var(--ink3);
  margin-top: 4px;
  display: block;
}
.w100 {
  width: 100%;
}
.errlist {
  color: var(--red-deep);
  font-size: 13px;
  padding-left: 18px;
  margin: 10px 0;
}
.actions {
  display: flex;
  gap: 14px;
  margin: 18px 0;
}
.deployhint {
  font-size: 12px;
  color: var(--ink3);
  text-align: center;
  margin-top: 26px;
}
</style>
