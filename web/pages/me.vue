<script setup lang="ts">
import SubmissionCard from '~/components/submissions/SubmissionCard.vue'
// components/<dir>/ 下的自动注册名带目录前缀（LayoutCardGrid），裸名解析不到——沿用项目显式导入惯例
import CardGrid from '~/components/layout/CardGrid.vue'
import UserAvatar from '~/components/account/UserAvatar.vue'
import type { Submission } from '~/components/submissions/types'

/** 我的投稿：登录态复用 useCurrentUser 共享单例（app.vue 挂载时已 ensure），
 * 页面不再自拉 /api/me；未登录时 user 为 null，登录引导走 useLoginPrompt 弹窗。 */
const api = useApi()
const { user, ensure } = useCurrentUser()
const { open: openLogin } = useLoginPrompt()
const subs = ref<Submission[]>([])
const loaded = ref(false)
const error = ref('')

async function loadSubmissions() {
  try {
    subs.value = await api.get<Submission[]>('/api/me/submissions')
    error.value = ''
  } catch { error.value = '暂时无法读取投稿状态，请刷新重试。' }
}

// 登录态就绪即加载投稿：mount 时已登录（含 ensure 补拉成功）、
// 以及停留本页时在外壳弹窗内完成登录，都从同一入口进入。
// 以用户 id 为触发键：共享层会用权威资料整体替换 user 对象（app.vue 与本页各 ensure
// 一次、set 后还会回读），按对象引用监听会在同一用户上重复触发投稿请求
watch(() => user.value?.id, async (id) => {
  if (!id) return
  await loadSubmissions()
  loaded.value = true
}, { immediate: true })

onMounted(async () => {
  await ensure()
  // 未登录（或权威资料拉取失败）：停止加载态，展示登录引导卡
  if (!user.value) loaded.value = true
})
</script>

<template>
  <div>
    <h1 class="page-title">我的投稿</h1>
    <div v-if="!loaded" class="muted">加载中……</div>
    <div v-else-if="!user" class="card">
      <p style="margin-top: 0">登录后可查看投稿进度、补充事实和确认脱敏素材。</p>
      <button type="button" class="btn" @click="openLogin">去登录</button>
    </div>
    <template v-else>
      <div class="card profile">
        <UserAvatar :name="user.name || user.login" :avatar="user.avatar" :size="48" />
        <div><strong>{{ user.name }}</strong><p class="muted">@{{ user.login }}</p></div>
        <NuxtLink to="/submit" class="btn btn--ghost">新投稿</NuxtLink>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p class="muted me-note">已收到 → 待补充 / 制作中 → 已发布或未采用。请以每份投稿的反馈为准，收到或制作中不承诺发表。</p>
      <CardGrid v-if="subs.length">
        <SubmissionCard v-for="s in subs" :key="s.id" :submission="s" @refreshed="loadSubmissions" />
      </CardGrid>
      <p v-if="!error && subs.length === 0" class="muted">还没有投稿。<NuxtLink to="/submit">去投稿 →</NuxtLink></p>
    </template>
  </div>
</template>

<style scoped>
.page-title {
  font-size: 22px;
  margin: 0 0 16px;
}
.profile { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
.profile p { margin: 5px 0 0; }
.profile .btn { margin-left: auto; }
.me-note { margin: 0 0 14px; }
.error { color: var(--red); }
</style>
