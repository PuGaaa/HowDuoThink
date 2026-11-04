<script setup lang="ts">
import SubmissionCard from '~/components/submissions/SubmissionCard.vue'
import type { Submission } from '~/components/submissions/types'
const api = useApi()
const user = ref<any>(null)
const subs = ref<Submission[]>([])
const loaded = ref(false)
const error = ref('')
const signedOut = ref(false)

async function loadSubmissions() {
  try {
    subs.value = await api.get<Submission[]>('/api/me/submissions')
    error.value = ''
  } catch { error.value = '暂时无法读取投稿状态，请刷新重试。' }
}
onMounted(async () => {
  try {
    user.value = await api.get('/api/me')
    await loadSubmissions()
  } catch (e: any) {
    if (e.status === 401) signedOut.value = true
    else error.value = '暂时无法读取个人信息，请刷新重试。'
  } finally { loaded.value = true }
})
</script>

<template>
  <div>
    <h1 style="font-size: 22px">我的投稿</h1>
    <div v-if="!loaded" class="muted">加载中……</div>
    <div v-else-if="signedOut" class="card">
      <p style="margin-top: 0">登录后可查看投稿进度、补充事实和确认脱敏素材。</p>
      <a class="btn" href="/">去首页登录</a>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <template v-if="user">
      <div class="card profile">
        <img :src="user.avatar" alt="我的头像" />
        <div><strong>{{ user.name }}</strong><p class="muted">@{{ user.login }}</p></div>
        <NuxtLink to="/submit" class="btn btn--ghost">新投稿</NuxtLink>
      </div>
      <p class="muted">已收到 → 待补充 / 制作中 → 已发布或未采用。请以每份投稿的反馈为准，收到或制作中不承诺发表。</p>
      <SubmissionCard v-for="s in subs" :key="s.id" :submission="s" @refreshed="loadSubmissions" />
      <p v-if="!error && subs.length === 0" class="muted">还没有投稿。<NuxtLink to="/submit">去投稿 →</NuxtLink></p>
    </template>
  </div>
</template>

<style scoped>
.profile { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
.profile img { width: 48px; height: 48px; border-radius: 50%; }
.profile p { margin: 5px 0 0; }
.profile .btn { margin-left: auto; }
.error { color: var(--red); }
</style>
