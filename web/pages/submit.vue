<script setup lang="ts">
const api = useApi()
const user = ref<any>(null)
const form = reactive({
  title: '', symptom: '', resolution: '', keyError: '', timeline: '',
  lessons: [] as string[], stackTags: '', domainHint: '',
})
const submitted = ref<any>(null)
const err = ref('')

onMounted(async () => {
  try { user.value = await api.get('/api/me') } catch { user.value = null }
})

function addLesson() {
  if (form.lessons.length < 3) form.lessons.push('')
}
async function submit() {
  err.value = ''
  try {
    const body = {
      title: form.title,
      symptom: form.symptom,
      resolution: form.resolution,
      keyError: form.keyError || null,
      timeline: form.timeline || null,
      lessons: form.lessons.filter((l: string) => l.trim()),
      stackTags: form.stackTags ? form.stackTags.split(/[ ,，]+/).filter(Boolean) : [],
      domainHint: form.domainHint || null,
    }
    submitted.value = await api.post('/api/submissions', body)
  } catch (e: any) {
    err.value = e?.data?.detail?.[0]?.msg || e?.data?.detail || String(e)
  }
}
</script>

<template>
  <div>
    <h1 style="font-size: 22px">投稿你的故障</h1>
    <p class="muted">必填只有 3 项（症状 / 现象 / 最终解决）。审核通过后：Web 展示解决逻辑，并有机会被加工成 App 的可玩关卡。</p>

    <div v-if="!user" class="card">
      <p style="margin-top: 0">投稿需要 GitHub 登录（用于署名与跟踪状态）。</p>
      <a class="btn" href="http://localhost:8000/api/oauth/github/login">使用 GitHub 登录</a>
      <p class="muted" style="margin-top: 10px">本地开发未配置 OAuth？<a :href="'http://localhost:8000/api/dev/login?login=' + (user?.login || 'devuser')">用开发绕行登录</a></p>
    </div>

    <div v-else-if="submitted" class="card">
      <h2 style="margin-top: 0">✓ 已收到</h2>
      <p>凭证：<code>{{ submitted.id }}</code></p>
      <p class="muted">状态：{{ submitted.status }}。审核通过后会出现在解决逻辑列表，并可能被加工成 App 关卡。</p>
      <NuxtLink to="/me" class="btn btn--ghost">查看我的投稿</NuxtLink>
    </div>

    <div v-else class="card">
      <div class="field">
        <label>一句话症状 *</label>
        <input v-model="form.title" maxlength="40" placeholder="例：线上图片全部裂图" />
        <div class="hint">≤40 字，会被用作标题</div>
      </div>
      <div class="field">
        <label>现象描述 *</label>
        <textarea v-model="form.symptom" rows="5" maxlength="1200" placeholder="谁受影响、什么现象、范围多大、有没有规律……"></textarea>
      </div>
      <div class="field">
        <label>最终解决逻辑 *</label>
        <textarea v-model="form.resolution" rows="7" maxlength="2400" placeholder="按步骤叙述：先看了什么 → 发现什么 → 排除什么 → 根因 → 怎么修复/验证修复"></textarea>
        <div class="hint">这是 Web 展示的核心，也会被加工成 App 关卡的专家推理链</div>
      </div>

      <details>
        <summary class="muted" style="cursor: pointer; margin-bottom: 12px">选填：报错原文 / 时间线 / 经验 / 标签</summary>
        <div class="field">
          <label>关键报错原文</label>
          <textarea v-model="form.keyError" rows="3" maxlength="600"></textarea>
        </div>
        <div class="field">
          <label>时间线（何时开始、关联什么变更）</label>
          <input v-model="form.timeline" maxlength="300" />
        </div>
        <div class="field">
          <label>经验教训（≤3 条）</label>
          <div v-for="(l, i) in form.lessons" :key="i" style="margin-bottom: 8px">
            <input v-model="form.lessons[i]" maxlength="80" style="width: 100%" />
          </div>
          <button class="btn btn--ghost" style="padding: 6px 14px; font-size: 13px" @click="addLesson">＋ 加一条</button>
        </div>
        <div class="field">
          <label>技术栈标签</label>
          <input v-model="form.stackTags" placeholder="Nginx, CDN, TLS（逗号分隔）" />
        </div>
        <div class="field">
          <label>所属层（可猜）</label>
          <select v-model="form.domainHint">
            <option value="">不确定</option>
            <option value="network">网络/接入</option>
            <option value="data">数据/缓存</option>
            <option value="build">构建/依赖</option>
            <option value="runtime">运行时</option>
            <option value="deploy">部署</option>
            <option value="concurrency">并发</option>
          </select>
        </div>
      </details>

      <p v-if="err" style="color: var(--red)">{{ err }}</p>
      <button class="btn" @click="submit">提交投稿</button>
    </div>
  </div>
</template>
