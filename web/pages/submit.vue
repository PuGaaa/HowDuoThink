<script setup lang="ts">
import type { SimilarCandidate } from '~/components/submissions/types'
const api = useApi()
const user = ref<any>(null)
const loaded = ref(false)
const signedOut = ref(false)
const form = reactive({ title: '', symptom: '', resolution: '', keyError: '', timeline: '', lessons: [] as string[], stackTags: '', domainHint: '' })
const requestId = ref('')
const submitted = ref<{ id: string; duplicate: boolean } | null>(null)
const busy = ref(false)
const error = ref('')
const similar = ref<SimilarCandidate[]>([])
const similarBusy = ref(false)
const similarChecked = ref(false)
const similarError = ref('')

watch(form, () => { requestId.value = '' }, { deep: true, flush: 'sync' })
watch(() => form.title, () => { similar.value = []; similarChecked.value = false })
onMounted(async () => {
  try { user.value = await api.get('/api/me') }
  catch (e: any) {
    if (e.status === 401) signedOut.value = true
    else error.value = '暂时无法读取登录状态，请刷新重试。'
  } finally { loaded.value = true }
})

async function findSimilar() {
  similarBusy.value = true
  similarError.value = ''
  const query = form.title
  try {
    const result = await api.get<{ items: SimilarCandidate[] }>('/api/submissions/similar?q=' + encodeURIComponent(query))
    if (query === form.title) { similar.value = result.items; similarChecked.value = true }
  } catch { similarError.value = '暂时无法查询相似内容，不影响你继续投稿。' }
  finally { similarBusy.value = false }
}

async function submit() {
  busy.value = true
  error.value = ''
  if (!requestId.value) requestId.value = crypto.randomUUID()
  try {
    submitted.value = await api.post('/api/submissions', {
      requestId: requestId.value, title: form.title, symptom: form.symptom, resolution: form.resolution,
      keyError: form.keyError || null, timeline: form.timeline || null,
      lessons: form.lessons.filter(l => l.trim()),
      stackTags: form.stackTags.split(/[ ,，]+/).filter(Boolean), domainHint: form.domainHint || null,
    }) as { id: string; duplicate: boolean }
  } catch { error.value = '提交暂未成功，请保留页面重试。同一份内容重试会沿用本次凭证，避免重复收稿。' }
  finally { busy.value = false }
}
</script>

<template>
  <div>
    <h1 style="font-size: 22px">投稿你的故障</h1>
    <p class="muted">必填 3 项：一句话症状、现象描述、最终解决逻辑。编辑会核实证据并整理脱敏素材，公开或交给 AI 整理前会请你确认具体版本。收到不代表一定发表。</p>
    <p v-if="error && !user" class="error" role="alert">{{ error }}</p>
    <div v-if="!loaded" class="muted">加载中……</div>
    <div v-else-if="signedOut" class="card">
      <p style="margin-top: 0">投稿需要先登录，用于署名与跟踪状态。</p>
      <a class="btn" href="/">去首页登录</a>
    </div>
    <div v-else-if="submitted" class="card" role="status">
      <h2 style="margin-top: 0">✓ {{ submitted.duplicate ? '已找到这份投稿' : '已收到' }}</h2>
      <p class="receipt">凭证：<code>{{ submitted.id }}</code></p>
      <p class="muted">{{ submitted.duplicate ? '重复提交已关联到原投稿，不会再收一份。' : '接下来由编辑核对事实与证据。' }}你可以继续补充事实、查看反馈和确认脱敏素材；内容发布后才会出现阅读与关卡入口。</p>
      <NuxtLink to="/me" class="btn btn--ghost">查看我的投稿</NuxtLink>
    </div>
    <form v-else-if="user" class="card" @submit.prevent="submit">
      <fieldset :disabled="busy">
        <div class="field">
          <label for="submission-title">一句话症状 *</label>
          <input id="submission-title" v-model="form.title" required minlength="4" maxlength="40" placeholder="例：线上图片全部裂图" />
          <div class="hint">4–40 字，会被用作标题</div>
        </div>
        <button class="btn btn--ghost similar-button" type="button" :disabled="similarBusy || form.title.length < 4" @click="findSimilar">{{ similarBusy ? '查询中…' : '看看已有的相似内容' }}</button>
        <p class="muted">这里只查已公开内容。症状或根因相似仍可投稿，编辑会判断是新题、补证还是同一事件，不会按相似度自动拒稿。</p>
        <p v-if="similarError" class="error" role="alert">{{ similarError }}</p>
        <section v-if="similarChecked" class="similar" aria-label="相似公开内容">
          <p v-if="!similar.length" class="muted">暂未找到相似公开内容，不代表不存在重复。</p>
          <article v-for="item in similar" :key="item.key">
            <a v-if="item.url" :href="item.url" target="_blank" rel="noopener">{{ item.title }}</a><strong v-else>{{ item.title }}</strong>
            <p>{{ item.excerpt }}</p>
          </article>
        </section>
        <div class="field">
          <label for="submission-symptom">现象描述 *</label>
          <textarea id="submission-symptom" v-model="form.symptom" required minlength="10" rows="5" maxlength="1200" placeholder="谁受影响、什么现象、范围多大、有没有规律……"></textarea>
        </div>
        <div class="field">
          <label for="submission-resolution">最终解决逻辑 *</label>
          <textarea id="submission-resolution" v-model="form.resolution" required minlength="10" rows="7" maxlength="2400" placeholder="先看了什么 → 哪些证据 → 排除什么 → 根因 → 怎样修复与复验"></textarea>
          <div class="hint">请区分亲历事实、推测和事后验证；不要填写密钥、个人信息或无权公开的内部资料。</div>
        </div>
        <details>
          <summary>选填：报错原文 / 时间线 / 经验 / 标签</summary>
          <div class="field"><label for="submission-error">关键报错原文</label><textarea id="submission-error" v-model="form.keyError" rows="3" maxlength="600"></textarea></div>
          <div class="field"><label for="submission-timeline">时间线</label><input id="submission-timeline" v-model="form.timeline" maxlength="300" /></div>
          <div class="field">
            <label>经验教训（最多 3 条）</label>
            <div v-for="(_, i) in form.lessons" :key="i" class="lesson-input"><input v-model="form.lessons[i]" :aria-label="'经验教训' + (i + 1)" maxlength="80" /></div>
            <button class="btn btn--ghost" type="button" :disabled="form.lessons.length === 3" @click="form.lessons.push('')">＋ 加一条</button>
          </div>
          <div class="field"><label for="submission-tags">技术栈标签（最多 6 个）</label><input id="submission-tags" v-model="form.stackTags" placeholder="Nginx, CDN, TLS（逗号分隔）" /></div>
          <div class="field"><label for="submission-domain">所属层（可猜）</label>
            <select id="submission-domain" v-model="form.domainHint"><option value="">不确定</option><option value="network">网络/接入</option><option value="data">数据/缓存</option><option value="build">构建/依赖</option><option value="runtime">运行时</option><option value="deploy">部署</option><option value="concurrency">并发</option></select>
          </div>
        </details>
      </fieldset>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="btn" type="submit" :disabled="busy">{{ busy ? '提交中…' : '提交投稿' }}</button>
    </form>
  </div>
</template>

<style scoped>
fieldset { padding: 0; margin: 0; border: 0; min-width: 0; }
.error { color: var(--red); font-size: 13px; }
.receipt { overflow-wrap: anywhere; }
.similar-button { padding: 8px 16px; font-size: 13px; }
.similar { margin: 14px 0 22px; padding: 0 14px; background: var(--well); border-radius: 12px; }
.similar article { padding: 14px 0; border-bottom: 1px solid var(--line); }
.similar article:last-child { border: 0; }
.similar a { color: var(--coral-deep); font-weight: 700; }
.similar p { margin-bottom: 0; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
summary { cursor: pointer; margin-bottom: 14px; color: var(--ink2); font-size: 13px; }
.lesson-input { margin-bottom: 8px; }
button:disabled { cursor: default; opacity: .55; }
</style>
