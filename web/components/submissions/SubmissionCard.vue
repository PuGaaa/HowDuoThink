<script setup lang="ts">
import type { Submission } from './types'
import MaterialPreview from './MaterialPreview.vue'
const props = defineProps<{ submission: Submission }>()
const emit = defineEmits<{ refreshed: [] }>()
const api = useApi()
const config = useRuntimeConfig()
const supplement = ref('')
const agreed = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const labels = { received: '已收到', needs_more: '待补充', producing: '制作中', published: '已发布', rejected: '未采用' }
const descriptions = {
  received: '编辑将核对事实与证据，收到不代表一定发表。',
  needs_more: '请根据下方反馈补充事实、证据或复现步骤。',
  producing: '正在整理与校验，制作中不代表一定发表。',
  published: '内容已发布，仍可补充事实或报告需要纠正的地方。',
  rejected: '本次未采用。你仍可补充证据或说明，编辑会看到新的反馈。',
}
const playUrl = computed(() => config.public.appH5Origin.replace(/\/$/, '') + props.submission.playPath + '&source=community')
watch(() => [props.submission.materialVersion, props.submission.materialConfirmed, props.submission.materialCurrent], () => { agreed.value = false })

async function addSupplement() {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await api.post(`/api/me/submissions/${props.submission.id}/supplements`, { text: supplement.value })
    supplement.value = ''
    agreed.value = false
    notice.value = '补充已收到。新增事实需重新核对脱敏素材，旧版确认不会沿用。'
    emit('refreshed')
  } catch {
    error.value = '补充未能发送，请稍后重试。'
  } finally { busy.value = false }
}

async function confirmMaterial() {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await api.post(`/api/me/submissions/${props.submission.id}/consent`, { version: props.submission.materialVersion })
    notice.value = `已确认第${props.submission.materialVersion}版，素材改版后需重新确认。`
    emit('refreshed')
  } catch {
    agreed.value = false
    error.value = '本版未能确认。素材或原始事实可能已更新，请刷新后阅读当前版本再确认。'
    emit('refreshed')
  } finally { busy.value = false }
}
</script>

<template>
  <article class="card submission">
    <h3>{{ submission.title }}</h3>
    <div class="meta"><span class="chip">{{ labels[submission.displayStatus] }}</span><time>{{ submission.createdAt }}</time></div>
    <p class="muted">{{ descriptions[submission.displayStatus] }}</p>
    <p v-if="submission.reviewNote" class="review-note">编辑反馈：{{ submission.reviewNote }}</p>
    <div v-if="submission.displayStatus === 'published'" class="published-links">
      <NuxtLink v-if="submission.articlePath" :to="submission.articlePath" class="btn btn--ghost">阅读解决逻辑</NuxtLink>
      <a v-if="submission.playPath && config.public.appH5Origin" :href="playUrl" class="btn" target="_blank" rel="noopener">进入关卡</a>
      <p v-else-if="submission.playPath" class="muted">关卡入口待配置，可在 App 查看。</p>
    </div>

    <details class="original">
      <summary>查看我的原始投稿</summary>
      <dl>
        <dt>现象</dt><dd>{{ submission.symptom }}</dd>
        <dt>解决逻辑</dt><dd>{{ submission.resolution }}</dd>
        <template v-if="submission.keyError"><dt>关键报错</dt><dd>{{ submission.keyError }}</dd></template>
        <template v-if="submission.timeline"><dt>时间线</dt><dd>{{ submission.timeline }}</dd></template>
        <template v-if="submission.lessons.length"><dt>经验</dt><dd>{{ submission.lessons.join('\n') }}</dd></template>
        <template v-if="submission.stackTags.length"><dt>技术栈</dt><dd>{{ submission.stackTags.join('、') }}</dd></template>
      </dl>
    </details>

    <section v-if="submission.material" class="material-review">
      <h4>{{ submission.materialCurrent ? '当前脱敏素材' : '历史脱敏素材' }} · 第 {{ submission.materialVersion }} 版</h4>
      <p class="muted">下面是编辑整理的完整脱敏素材。确认范围只覆盖本版；原始投稿和私下补充不会因此直接公开。</p>
      <MaterialPreview :material="submission.material" />
      <p v-if="!submission.materialCurrent" class="muted">补件已使旧素材失效，待编辑整理新版本后再确认；上方仅保留旧版供核对。</p>
      <p v-else-if="submission.materialConfirmed" class="confirmed" role="status">✓ 本版已确认；内容修订后会重新征求确认。</p>
      <template v-else>
        <label class="consent"><input v-model="agreed" type="checkbox" :disabled="busy" />
          <span>我已阅读上方完整第 {{ submission.materialVersion }} 版，确认已脱敏，同意该版本公开展示并由 AI 整理。</span>
        </label>
        <button class="btn" :disabled="!agreed || busy" @click="confirmMaterial">{{ busy ? '处理中…' : `确认第${submission.materialVersion}版公开范围` }}</button>
      </template>
    </section>

    <section v-if="submission.messages.length" class="messages">
      <h4>补充与反馈</h4>
      <div v-for="message in submission.messages" :key="message.id" class="message">
        <div class="muted">{{ message.kind === 'supplement' ? '我补充的事实' : message.kind === 'consent' ? '版本确认' : '编辑反馈' }} · {{ message.created_at }}</div>
        <p>{{ message.body }}</p>
      </div>
    </section>
    <form @submit.prevent="addSupplement">
      <div class="field">
        <label :for="'supplement-' + submission.id">补充事实或纠错</label>
        <textarea :id="'supplement-' + submission.id" v-model="supplement" required minlength="4" maxlength="3000" rows="3" :disabled="busy" placeholder="补充复现条件、证据、技术依据，或指出已发布内容需要纠正的位置。请先移除密钥和个人信息。"></textarea>
        <div class="hint">补充仅作者与编辑可见；新的事实需要重新核对脱敏与公开范围。</div>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="notice" class="confirmed" role="status">{{ notice }}</p>
      <button class="btn btn--ghost" type="submit" :disabled="busy">{{ busy ? '处理中…' : '发送补充' }}</button>
    </form>
  </article>
</template>

<style scoped>
h3 { margin: 0 0 10px; font-size: 17px; overflow-wrap: anywhere; }
h4 { margin: 0 0 8px; font-size: 15px; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--ink3); }
.review-note { padding: 12px; background: var(--lemon-soft); border-radius: 10px; white-space: pre-wrap; }
.original, .material-review, .messages { margin: 20px 0; }
summary { cursor: pointer; font-size: 13px; color: var(--ink2); }
dt { margin-top: 10px; font-weight: 700; font-size: 12px; }
dd { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; }
.published-links { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0 24px; }
.consent { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 1.7; margin-bottom: 14px; }
.consent input { margin-top: 5px; flex-shrink: 0; }
.message { border-left: 3px solid var(--line); padding-left: 12px; }
.message p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.6; }
.confirmed { color: var(--mint-deep); font-size: 13px; }
.error { color: var(--red); font-size: 13px; }
button:disabled { cursor: default; opacity: .55; }
</style>
