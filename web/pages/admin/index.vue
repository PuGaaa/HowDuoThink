<script setup lang="ts">
const api = useApi()
const user = ref<any>(null)
const subs = ref<any[]>([])
const cases = ref<any[]>([])
const tab = ref<'submissions' | 'cases'>('submissions')
const loaded = ref(false)
const denied = ref(false)

onMounted(async () => {
  try {
    user.value = await api.get('/api/me')
    if (!['editor', 'admin'].includes(user.value.role)) {
      denied.value = true
      loaded.value = true
      return
    }
    subs.value = await api.get('/api/admin/submissions')
    cases.value = await api.get('/api/admin/cases')
  } catch (e: any) {
    denied.value = true
  }
  loaded.value = true
})

const pendingCount = computed(() => subs.value.filter((s) => s.status === 'pending').length)
const draftCount = computed(() => cases.value.filter((c) => c.status === 'draft').length)
const pubCount = computed(() => cases.value.filter((c) => c.status === 'published').length)

async function makeDraft(sid: string) {
  const r = await api.post('/api/admin/submissions/' + sid + '/draft', {})
  await navigateTo('/admin/cases/' + r.caseId)
}
</script>

<template>
  <div>
    <h1 style="font-size: 22px">管理端</h1>
    <div v-if="!loaded" class="muted">加载中……</div>
    <div v-else-if="denied" class="card">需要 editor/admin 权限（本地开发可用 /api/dev/login?login=admin 登录）。</div>
    <template v-else>
      <div style="display: flex; gap: 12px; margin-bottom: 20px">
        <div class="statbox"><div class="statbox__n">{{ pendingCount }}</div><div class="statbox__k">待审投稿</div></div>
        <div class="statbox"><div class="statbox__n">{{ draftCount }}</div><div class="statbox__k">Case 草稿</div></div>
        <div class="statbox"><div class="statbox__n">{{ pubCount }}</div><div class="statbox__k">已上线</div></div>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 16px">
        <button class="btn btn--ghost" :style="tab === 'submissions' ? '' : 'opacity: .6'" @click="tab = 'submissions'">投稿（{{ subs.length }}）</button>
        <button class="btn btn--ghost" :style="tab === 'cases' ? '' : 'opacity: .6'" @click="tab = 'cases'">Case（{{ cases.length }}）</button>
      </div>

      <div v-if="tab === 'submissions'">
        <div v-for="s in subs" :key="s.id" class="card">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <div style="font-weight: 700">{{ s.title }}</div>
            <span class="chip">{{ s.status }}</span>
          </div>
          <div class="muted" style="margin: 6px 0">作者 @{{ s.author }} · {{ s.createdAt }} · 标签 {{ s.stackTags.join('/') || '无' }}</div>
          <details>
            <summary class="muted" style="cursor: pointer">展开全文</summary>
            <p><b>现象：</b>{{ s.symptom }}</p>
            <p v-if="s.keyError"><b>报错：</b><code>{{ s.keyError }}</code></p>
            <p v-if="s.timeline"><b>时间线：</b>{{ s.timeline }}</p>
            <p><b>解决过程：</b>{{ s.resolution }}</p>
            <p v-if="s.lessons.length"><b>经验：</b>{{ s.lessons.join(' / ') }}</p>
          </details>
          <div style="margin-top: 12px; display: flex; gap: 10px">
            <button v-if="s.status === 'pending'" class="btn" style="padding: 8px 18px; font-size: 13px" @click="makeDraft(s.id)">通过并生成 Case 草稿</button>
            <button v-if="s.status === 'pending'" class="btn btn--ghost" style="padding: 8px 18px; font-size: 13px"
              @click="api.post('/api/admin/submissions/' + s.id + '/status', { status: 'rejected', reviewNote: '暂不采用' }).then(() => s.status = 'rejected')">
              驳回
            </button>
            <NuxtLink v-if="s.status === 'accepted'" :to="'/admin/cases/' + s.id.replace('s-', 'c-')" class="btn btn--ghost" style="padding: 8px 18px; font-size: 13px">编辑 Case</NuxtLink>
          </div>
        </div>
        <p v-if="subs.length === 0" class="muted">暂无投稿。</p>
      </div>

      <div v-else>
        <div v-for="c in cases" :key="c.id" class="card">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <NuxtLink :to="'/admin/cases/' + c.id" style="font-weight: 700; color: var(--ink); text-decoration: none">{{ c.title || c.id }}</NuxtLink>
            <span class="chip">{{ c.status }}{{ c.version ? ' · v' + c.version : '' }}</span>
          </div>
          <div class="muted" style="margin-top: 6px">{{ c.id }} · {{ c.domain || '—' }} · {{ c.layer || '层契约待补' }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.statbox { flex: 1; background: #fff; border-radius: 14px; box-shadow: 0 4px 0 var(--edge-cream); padding: 16px; text-align: center; }
.statbox__n { font-size: 26px; font-weight: 800; color: var(--coral); }
.statbox__k { font-size: 12px; color: var(--ink3); margin-top: 4px; }
</style>
