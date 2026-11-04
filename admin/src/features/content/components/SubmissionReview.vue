<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { NButton, NCard, NCheckbox, NInput, NSelect, NTag, useMessage } from 'naive-ui'
import { submissionApi, type Candidate, type Material, type SubmissionDetail, statusLabels } from '../api/submissions'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ updated: []; draft: [id: string, ai: boolean] }>()
const message = useMessage()
const detail = ref<SubmissionDetail | null>(null)
const material = ref<Material | null>(null)
const tags = computed({ get: () => material.value!.stackTags.join(', '), set: (value: string) => { material.value!.stackTags = value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean) } })
const candidates = ref<Candidate[]>([])
const checked = ref<string[]>([])
const busy = ref(false)
const review = reactive({ decision: 'distinct', mechanism: '', evidence: '', reasoning: '', publicNote: '', internalNote: '', targetType: 'case', targetId: '' })
const domains = [
  { label: '网络/接入', value: 'network' }, { label: '数据/缓存', value: 'data' }, { label: '构建/依赖', value: 'build' },
  { label: '运行时', value: 'runtime' }, { label: '部署', value: 'deploy' }, { label: '并发', value: 'concurrency' },
]
const decisions = [{ label: '独立训练价值，可制作新题', value: 'distinct' }, { label: '有效补证，合并至主内容', value: 'merge' }, { label: '材料不足，请作者补充', value: 'needs_more' }, { label: '本次不采用', value: 'reject' }]
const canReview = computed(() => [review.mechanism, review.evidence, review.reasoning].every((v) => v.trim().length >= 4) && candidates.value.every((c) => checked.value.includes(c.key)) && (review.decision !== 'merge' || review.targetId.length > 0))
const canDraft = computed(() => detail.value?.materialConfirmed && detail.value.review.decision === 'distinct' && !detail.value.linkedCaseId && !detail.value.parentSubmissionId)

const kindLabels: Record<string, string> = {material:'脱敏版本存档',review:'人工裁定存档',note:'内部备注',feedback:'编辑反馈',supplement:'作者补件',consent:'公开范围确认'}
onMounted(() => load().catch((e: Error) => message.error(e.message)))
async function load() {
  const [row, matches] = await Promise.all([submissionApi.detail(props.id), submissionApi.similar(props.id)])
  detail.value = row
  material.value = structuredClone(row.material ?? { title: row.title, symptom: row.symptom, resolution: row.resolution, keyError: row.keyError, timeline: row.timeline, lessons: row.lessons, stackTags: row.stackTags, domainHint: row.domainHint })
  candidates.value = matches.items
  checked.value = JSON.parse(row.review.candidate_ids)
  review.decision = row.review.decision ?? 'distinct'
  review.mechanism = row.review.mechanism ?? ''
  review.evidence = row.review.evidence ?? ''
  review.reasoning = row.review.reasoning ?? ''
  review.publicNote = row.reviewNote ?? ''
  review.targetType = row.parentSubmissionId ? 'submission' : 'case'
  review.targetId = row.linkedCaseId ?? row.parentSubmissionId ?? ''
}
async function saveMaterial() {
  busy.value = true
  try {
    await submissionApi.material(props.id, material.value!)
    await load()
    emit('updated')
    message.success('已保存脱敏版本，等待作者核对并确认')
  } catch (e) { message.error((e as Error).message) } finally { busy.value = false }
}
async function saveReview() {
  busy.value = true
  try {
    await submissionApi.review(props.id, {
      decision: review.decision, mechanism: review.mechanism, evidence: review.evidence, reasoning: review.reasoning,
      publicNote: review.publicNote, internalNote: review.internalNote, candidateIds: checked.value,
      linkedCaseId: review.decision === 'merge' && review.targetType === 'case' ? review.targetId : null,
      parentSubmissionId: review.decision === 'merge' && review.targetType === 'submission' ? review.targetId : null,
    })
    review.internalNote = ''
    await load()
    emit('updated')
    message.success('已记录裁定与作者可见反馈')
  } catch (e) { message.error((e as Error).message) } finally { busy.value = false }
}
function toggleCandidate(key: string, selected: boolean) {
  checked.value = selected ? [...checked.value, key] : checked.value.filter((value) => value !== key)
}
</script>

<template>
  <section v-if="detail && material" class="review">
    <div class="review__heading"><h2>{{ detail.title }}</h2><NTag>{{ statusLabels[detail.displayStatus] }}</NTag></div>
    <NCard size="small" title="作者原稿与补件（仅编审可见）">
      <p><b>现象：</b>{{ detail.symptom }}</p><p v-if="detail.keyError"><b>原始报错：</b>{{ detail.keyError }}</p>
      <p><b>时间线：</b>{{ detail.timeline }}</p><p><b>解决过程：</b>{{ detail.resolution }}</p>
      <p><b>经验：</b>{{ detail.lessons.join(' / ') }}</p>
      <template v-for="note in detail.messages" :key="note.id">
        <details v-if="note.visibility === 'internal'" class="note note--internal"><summary><b>内部 · {{ kindLabels[note.kind] }}</b> · {{ note.created_at }}</summary><p>{{ note.body }}</p></details>
        <div v-else class="note"><b>作者可见 · {{ kindLabels[note.kind] }}</b><small>{{ note.created_at }}</small><p>{{ note.body }}</p></div>
      </template>
    </NCard>
    <NCard size="small" title="整理脱敏素材">
      <p class="muted">原稿永久保留。此处只放允许公开与交给 AI 整理的材料；每次保存后都须作者重新确认。</p>
      <label>标题<NInput v-model:value="material.title" :maxlength="40" /></label>
      <label>现象<NInput v-model:value="material.symptom" type="textarea" :maxlength="1200" /></label>
      <label>解决过程<NInput v-model:value="material.resolution" type="textarea" :maxlength="2400" /></label>
      <label>可公开报错<NInput v-model:value="material.keyError" type="textarea" :maxlength="600" /></label>
      <label>时间线<NInput v-model:value="material.timeline" :maxlength="300" /></label>
      <label v-for="(_, i) in material.lessons" :key="i">经验 {{ i + 1 }}<NInput v-model:value="material.lessons[i]" :maxlength="80" /></label>
      <NButton v-if="material.lessons.length < 3" size="small" @click="material.lessons.push('')">添加经验</NButton>
      <label>公开标签（逗号分隔，最多6项）<NInput v-model:value="tags" /></label>
      <label>归属领域（必选）<NSelect v-model:value="material.domainHint" :options="domains" /></label>
      <div class="actions"><NButton :loading="busy" :disabled="!material.domainHint" @click="saveMaterial">保存并请作者确认</NButton><NTag :type="detail.materialConfirmed ? 'success' : 'warning'">第 {{ detail.materialVersion }} 版 · {{ !detail.materialCurrent ? '待编辑根据补件更新' : detail.materialConfirmed ? '作者已确认' : '等待作者确认' }}</NTag></div>
    </NCard>
    <NCard size="small" title="人工查重与差异裁定">
      <p class="muted">候选包含待审稿、草稿和公开案例。文字相似仅供查找，需核对机制、证据和训练目标，不能据分数直接拒稿。</p>
      <div v-for="candidate in candidates" :key="candidate.key" class="candidate">
        <NCheckbox :checked="checked.includes(candidate.key)" @update:checked="toggleCandidate(candidate.key, $event)">已人工核对</NCheckbox>
        <b>{{ candidate.title }}</b><small>{{ candidate.kind }} / {{ candidate.status }} / {{ candidate.id }}</small><p>{{ candidate.excerpt }}</p>
      </div>
      <p v-if="!candidates.length" class="muted">当前没有相似候选。</p>
      <label>机制差异<NInput v-model:value="review.mechanism" type="textarea" placeholder="相对哪份材料，事故机制有什么不同？" /></label>
      <label>证据差异<NInput v-model:value="review.evidence" type="textarea" placeholder="新增哪份可验证证据？冲突是否已核实？" /></label>
      <label>推理与训练价值<NInput v-model:value="review.reasoning" type="textarea" placeholder="新增哪一步判断，还是应合并为补证？" /></label>
      <label>裁定<NSelect v-model:value="review.decision" :options="decisions" /></label>
      <div v-if="review.decision === 'merge'" class="merge">
        <NSelect v-model:value="review.targetType" :options="[{label:'主案例 ID',value:'case'},{label:'独立母投稿 ID',value:'submission'}]" />
        <NInput v-model:value="review.targetId" placeholder="填写上方已核实的案例或母投稿 ID" />
        <p class="muted">保留原稿与有效补证署名，不另建关卡。合并前也须作者确认当前脱敏版本。</p>
      </div>
      <label>给作者的公开反馈<NInput v-model:value="review.publicNote" type="textarea" :maxlength="1200" /></label>
      <label>内部审阅备注（作者不可见）<NInput v-model:value="review.internalNote" type="textarea" :maxlength="3000" /></label>
      <div class="actions"><NButton type="primary" :disabled="!canReview" :loading="busy" @click="saveReview">保存人工裁定</NButton><NButton :disabled="!canDraft" @click="emit('draft', detail.id, false)">人工骨架起草</NButton><NButton :disabled="!canDraft" @click="emit('draft', detail.id, true)">AI 起草</NButton></div>
      <p class="muted">起草只是制作中；完成编辑、试玩和发布后，作者才会看到正式可玩与文章入口。</p>
    </NCard>
  </section>
</template>

<style scoped>
.review { display: grid; gap: 16px; }
.review__heading,.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
h2 { margin: 0; font-size: 19px; } p { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
label { display: grid; gap: 6px; margin: 14px 0; font-weight: 600; }
.muted,small { color: var(--ink3); font-size: 12px; font-weight: normal; }
small { display: block; margin-top: 5px; }
.note,.candidate { margin: 12px 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; }
.note--internal { border-left: 3px solid #8b6caf; background: #faf7ff; }
.candidate b { display: block; margin-top: 8px; }
.merge { display: grid; gap: 10px; }
</style>
