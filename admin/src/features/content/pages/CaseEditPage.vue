<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NInput, NTag, useMessage } from 'naive-ui'
import { contentApi, type CaseDetail, type CaseRevision } from '../api/content'
import CaseMetadataForm from '../components/CaseMetadataForm.vue'
import CaseRevisionHistory from '../components/CaseRevisionHistory.vue'

const cid = String(useRoute().params.id)
const message = useMessage()
const detail = ref<CaseDetail | null>(null)
const revisions = ref<CaseRevision[]>([])
const payloadText = ref('')
const loading = ref(true)
const busy = ref(false)
const errors = ref<string[]>([])
const previewUrl = ref('')
const meta = ref({part:'engineer',chapterId:'',order:1,typeTags:''})
const readOnly = computed(() => detail.value?.readOnly === true)
const placeholders = computed(() => (payloadText.value.match(/（待补充/g) || []).length)

function showPayload(payload: Record<string,any>) {
  payloadText.value = JSON.stringify(payload,null,2)
  meta.value = {part:payload.part,chapterId:payload.chapterId,order:payload.order,typeTags:payload.typeTags.join(', ')}
}
async function load() {
  loading.value = true
  try {
    const [row,history] = await Promise.all([contentApi.caseDetail(cid),contentApi.revisions(cid)])
    detail.value = row
    revisions.value = history.items
    showPayload(row.payload)
    errors.value = []
  } catch(e) { message.error((e as Error).message) } finally { loading.value = false }
}
onMounted(load)
function applyMeta() {
  try {
    const payload = JSON.parse(payloadText.value)
    Object.assign(payload,{part:meta.value.part,chapterId:meta.value.chapterId,order:meta.value.order,typeTags:meta.value.typeTags.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean)})
    payloadText.value = JSON.stringify(payload,null,2)
    message.success('已应用到待发布正文，正式发布前不会修改线上内容')
  } catch(e) { message.error((e as Error).message) }
}
async function saveDraft() {
  busy.value = true
  try { await contentApi.saveDraft(cid,JSON.parse(payloadText.value)); await load(); message.success('草稿已保存') }
  catch(e) { message.error((e as Error).message) } finally { busy.value = false }
}
async function publish() {
  busy.value = true
  errors.value = []
  try {
    const payload = JSON.parse(payloadText.value)
    for (const key of ['contentRevision','sourceType','sourceCommit','sourceHash','submissionId','authorName']) delete payload[key]
    payload.id = cid
    payload.baseRevision = detail.value!.contentRevision ?? 0
    const result = await contentApi.publish(payload)
    await load()
    message.success(result.unchanged ? '正文相同，没有产生新修订' : `已发布内容修订 ${result.contentRevision}`)
  } catch(e:any) {
    if (Array.isArray(e.detail)) errors.value=e.detail.map((item:any)=>item.msg+' @ '+item.loc.join('.'))
    else if (e.detail?.errors) errors.value=e.detail.errors
    else errors.value=[e.message]
  } finally { busy.value = false }
}
function restore(payload:Record<string,any>) {
  showPayload(payload)
  message.success(`已载入历史正文；发布仍以当前修订 ${detail.value!.contentRevision} 为基准`)
}
async function preview() {
  busy.value = true
  try {
    const result = await contentApi.preview(cid,JSON.parse(payloadText.value))
    previewUrl.value = result.previewUrl
    window.open(result.previewUrl,'_blank')
  } catch(e) { message.error((e as Error).message) } finally { busy.value = false }
}
</script>

<template>
  <div v-if="loading">加载中……</div>
  <div v-else-if="detail">
    <div class="heading"><h1>{{ readOnly ? '案例查看' : '案例编辑' }}</h1><NTag>{{ detail.sourceType === 'official' ? '官方 · Git唯一源' : '社区' }}</NTag><NTag>{{ detail.status }} · 内容修订 {{ detail.contentRevision ?? 0 }}</NTag><NButton size="small" @click="load">重新载入</NButton></div>
    <p class="muted">{{ cid }}</p>
    <p v-if="detail.sourceType === 'official'" class="notice">官方正文与篇章信息只读。请在案例 TS 唯一源完成审阅、核定修订，再经受信导入发布。</p>
    <p v-else-if="detail.status === 'archived'" class="notice">此独立草稿已归档，正文与历史仍保留；不能继续发布重复关卡。</p>
    <p v-else-if="detail.status === 'published'" class="notice">当前修改暂不影响线上。重新发布会比较打开时的修订号；冲突后请保留修改并重新载入比较。</p>
    <CaseMetadataForm v-model="meta" :read-only="readOnly" @apply="applyMeta" />
    <section class="panel glass-panel"><h2>待发布正文</h2><p class="muted">{{ placeholders }} 处“待补充”；发布前请补齐证据、标准路径与停止条件，并通过完整试玩。</p><NInput v-model:value="payloadText" type="textarea" :readonly="readOnly" :autosize="{minRows:22,maxRows:40}" :input-props="{spellcheck:false}" class="json" /></section>
    <ul v-if="errors.length" class="errors"><li v-for="error in errors" :key="error">{{ error }}</li></ul>
    <div class="actions"><NButton v-if="!readOnly && detail.status === 'draft'" :loading="busy" @click="saveDraft">保存草稿</NButton><NButton :loading="busy" @click="preview">生成 H5 预览</NButton><NButton v-if="!readOnly" type="primary" :loading="busy" @click="publish">{{ detail.status === 'published' ? '发布新的修订' : '正式发布' }}</NButton></div>
    <p v-if="previewUrl" class="muted url">预览链接：{{ previewUrl }}</p>
    <CaseRevisionHistory :items="revisions" :read-only="readOnly" @restore="restore" />
  </div>
</template>
<style scoped>
h1{margin:0;font-size:21px}h2{margin:0 0 14px;font-size:16px}.heading,.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.muted{color:var(--ink3);font-size:12px;line-height:1.7}.notice{padding:14px;background:var(--lemon-soft);border-radius:10px;line-height:1.7;font-size:13px}.panel{margin:20px 0}.json :deep(textarea){font-family:ui-monospace,monospace;font-size:12px;line-height:1.65}.errors{background:var(--red-soft);padding:16px 30px;color:var(--red-deep);font-size:13px}.actions{margin:20px 0}.url{overflow-wrap:anywhere}
</style>
