<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NTag, useMessage } from 'naive-ui'
import { contentApi } from '../api/content'
import { submissionApi, statusLabels, type SubmissionDetail } from '../api/submissions'
import SubmissionReview from '../components/SubmissionReview.vue'

const router = useRouter()
const message = useMessage()
const subs = ref<SubmissionDetail[]>([])
const loading = ref(true)
const busyId = ref('')
const filter = ref('all')
const selectedId = ref('')
const detailVersion = ref(0)
const shown = computed(() => filter.value === 'all' ? subs.value : subs.value.filter((s) => s.displayStatus === filter.value))
onMounted(load)
async function load() {
  loading.value = true
  try { subs.value = await submissionApi.list() } catch (e) { message.error((e as Error).message) } finally { loading.value = false }
}
async function refresh() { await load(); detailVersion.value++ }
async function draft(id: string, ai: boolean) {
  busyId.value = id
  try {
    const result = await (ai ? contentApi.makeAiDraft(id) : contentApi.makeDraft(id))
    if (result.warnings?.length) message.warning(result.warnings.join('；'))
    else message.success('已生成草稿，进入编辑与试玩')
    router.push('/cases/' + result.caseId)
  } catch (e) { message.error((e as Error).message) } finally { busyId.value = '' }
}
</script>

<template>
  <div>
    <div class="toolbar"><NButton v-if="selectedId" size="small" @click="selectedId = ''">← 返回投稿列表</NButton><NButton size="small" @click="refresh">刷新</NButton><span v-if="busyId">正在起草，请稍候……</span></div>
    <SubmissionReview v-if="selectedId" :key="selectedId + detailVersion" :id="selectedId" @updated="load" @draft="draft" />
    <template v-else>
      <div class="toolbar"><NButton v-for="(label, value) in {all:'全部',...statusLabels}" :key="value" size="small" :type="filter === value ? 'primary' : 'default'" @click="filter = value">{{ label }}（{{ value === 'all' ? subs.length : subs.filter(s => s.displayStatus === value).length }}）</NButton></div>
      <p class="muted">原稿、作者补件、脱敏公开范围与内部审阅分别留存。采纳只表示进入制作，发布以正式案例状态为准。</p>
      <NCard v-if="loading" size="small">加载中……</NCard><p v-else-if="!shown.length">暂无投稿。</p>
      <NCard v-for="s in shown" :key="s.id" size="small" class="sub">
        <div class="sub__head"><b>{{ s.title }}</b><NTag>{{ statusLabels[s.displayStatus] }}</NTag></div>
        <p class="muted">作者 {{ s.author }} · {{ s.createdAt }} · {{ s.id }}</p>
        <p class="excerpt">{{ s.symptom }}</p><p v-if="s.reviewNote" class="muted">给作者的反馈：{{ s.reviewNote }}</p>
        <div class="toolbar"><NButton size="small" type="primary" secondary @click="selectedId = s.id">查看与编审</NButton><NButton v-if="s.caseId" size="small" @click="router.push('/cases/' + s.caseId)">查看关联案例</NButton></div>
      </NCard>
    </template>
  </div>
</template>

<style scoped>
.sub { margin-bottom: 12px; }
.sub__head,.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sub__head { justify-content: space-between; }
.toolbar { margin-bottom: 16px; }
.muted { color: var(--ink3); font-size: 12px; line-height: 1.6; }
.excerpt { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
