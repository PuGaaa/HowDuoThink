<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { NButton, NCard, NInput, NModal, NTag } from 'naive-ui'
import { contentApi, type Submission } from '../api/content'

const router = useRouter()
const message = useMessage()

const subs = ref<Submission[]>([])
const cases = ref<{ status: string }[]>([])
const loading = ref(true)
const busyId = ref('')
const filter = ref<'all' | 'pending'>('all')
const rejectTarget = ref<Submission | null>(null)
const rejectNote = ref('')

const shown = computed(() =>
  filter.value === 'all' ? subs.value : subs.value.filter((s) => s.status === 'pending'),
)
const pendingCount = computed(() => subs.value.filter((s) => s.status === 'pending').length)
const draftCount = computed(() => cases.value.filter((c) => c.status === 'draft').length)
const pubCount = computed(() => cases.value.filter((c) => c.status === 'published').length)

onMounted(load)

async function load() {
  loading.value = true
  try {
    const [s, c] = await Promise.all([contentApi.submissions(), contentApi.cases()])
    subs.value = s
    cases.value = c
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function makeDraft(s: Submission) {
  busyId.value = s.id
  try {
    const r = await contentApi.makeDraft(s.id)
    s.status = 'accepted'
    message.success('已生成 Case 草稿')
    router.push('/cases/' + r.caseId)
  } catch (e: any) {
    message.error(e?.message || '转草稿失败')
  } finally {
    busyId.value = ''
  }
}

async function makeAiDraft(s: Submission) {
  busyId.value = s.id
  try {
    const r = await contentApi.makeAiDraft(s.id)
    s.status = 'accepted'
    if (r.warnings?.length) message.warning('AI 起草有提示：' + r.warnings.join('；'))
    else message.success('AI 起草完成')
    router.push('/cases/' + r.caseId)
  } catch (e: any) {
    message.error(e?.message || 'AI 起草失败')
  } finally {
    busyId.value = ''
  }
}

function askReject(s: Submission) {
  rejectTarget.value = s
  rejectNote.value = ''
}

async function confirmReject() {
  const s = rejectTarget.value
  if (!s) return
  try {
    await contentApi.setSubmissionStatus(s.id, 'rejected', rejectNote.value || '暂不采用')
    s.status = 'rejected'
    message.success('已驳回')
  } catch (e: any) {
    message.error(e?.message || '驳回失败')
  } finally {
    rejectTarget.value = null
  }
}
</script>

<template>
  <div>
    <div class="stats">
      <div class="statbox">
        <div class="statbox__n">{{ pendingCount }}</div>
        <div class="statbox__k">待审投稿</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ draftCount }}</div>
        <div class="statbox__k">Case 草稿</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ pubCount }}</div>
        <div class="statbox__k">已上线</div>
      </div>
    </div>

    <div class="filter">
      <NButton size="small" :type="filter === 'all' ? 'primary' : 'default'" secondary @click="filter = 'all'">
        全部（{{ subs.length }}）
      </NButton>
      <NButton size="small" :type="filter === 'pending' ? 'primary' : 'default'" secondary @click="filter = 'pending'">
        待审（{{ pendingCount }}）
      </NButton>
    </div>

    <NCard v-if="loading" size="small">加载中……</NCard>
    <p v-else-if="shown.length === 0" class="empty">暂无投稿。</p>

    <NCard v-for="s in shown" :key="s.id" size="small" class="sub">
      <div class="sub__head">
        <b>{{ s.title }}</b>
        <NTag size="small" :type="s.status === 'pending' ? 'warning' : s.status === 'accepted' ? 'success' : 'default'">
          {{ s.status }}
        </NTag>
      </div>
      <div class="sub__meta">
        作者 @{{ s.author || '?' }} · {{ s.createdAt }} · 标签 {{ s.stackTags.join('/') || '无' }}
      </div>
      <details class="sub__detail">
        <summary>展开全文</summary>
        <p><b>现象：</b>{{ s.symptom }}</p>
        <p v-if="s.keyError"><b>报错：</b><code>{{ s.keyError }}</code></p>
        <p v-if="s.timeline"><b>时间线：</b>{{ s.timeline }}</p>
        <p><b>解决过程：</b>{{ s.resolution }}</p>
        <p v-if="s.lessons.length"><b>经验：</b>{{ s.lessons.join(' / ') }}</p>
      </details>
      <div class="sub__actions">
        <NButton
          v-if="s.status === 'pending'"
          type="primary"
          size="small"
          :loading="busyId === s.id"
          @click="makeDraft(s)"
        >
          通过并生成 Case 草稿
        </NButton>
        <NButton
          v-if="s.status === 'pending'"
          size="small"
          type="primary"
          secondary
          :loading="busyId === s.id"
          @click="makeAiDraft(s)"
        >
          AI 预填草稿
        </NButton>
        <NButton v-if="s.status === 'pending'" size="small" quaternary type="error" @click="askReject(s)">
          驳回
        </NButton>
        <NButton v-if="s.status === 'accepted'" size="small" tag="a" @click="router.push('/cases/' + s.id.replace('s-', 'c-'))">
          编辑 Case
        </NButton>
      </div>
    </NCard>

    <NModal
      :show="!!rejectTarget"
      preset="dialog"
      title="驳回投稿"
      positive-text="确认驳回"
      negative-text="取消"
      @positive-click="confirmReject"
      @negative-click="rejectTarget = null"
      @close="rejectTarget = null"
    >
      <NInput v-model:value="rejectNote" type="textarea" placeholder="驳回备注（留给作者的话）" />
    </NModal>
  </div>
</template>

<style scoped>
.stats {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.statbox {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  text-align: center;
}
.statbox__n {
  font-size: 24px;
  font-weight: 800;
  color: #e8604c;
}
.statbox__k {
  font-size: 12px;
  color: #9c96ad;
  margin-top: 2px;
}
.filter {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.sub {
  margin-bottom: 10px;
}
.sub__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.sub__meta {
  color: #9c96ad;
  font-size: 12px;
  margin: 6px 0;
}
.sub__detail summary {
  cursor: pointer;
  color: #9c96ad;
  font-size: 13px;
}
.sub__detail p {
  margin: 6px 0;
  font-size: 13px;
  line-height: 1.6;
}
.sub__actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
.empty {
  color: #9c96ad;
  text-align: center;
  padding: 40px 0;
}
</style>
