<script setup lang="ts">
const api = useApi()
const user = ref<any>(null)
const subs = ref<any[]>([])
const loaded = ref(false)

onMounted(async () => {
  try {
    user.value = await api.get('/api/me')
    subs.value = await api.get('/api/me/submissions')
  } catch { user.value = null }
  loaded.value = true
})
</script>

<template>
  <div>
    <h1 style="font-size: 22px">我的</h1>
    <div v-if="!loaded" class="muted">加载中……</div>
    <div v-else-if="!user" class="card">
      <p style="margin-top: 0">未登录。</p>
      <a class="btn" :href="api.base + '/api/oauth/github/login'">GitHub 登录</a>
    </div>
    <template v-else>
      <div class="card">
        <img :src="user.avatar" style="width: 56px; height: 56px; border-radius: 50%" />
        <div style="font-weight: 800; margin-top: 8px">{{ user.name }}</div>
        <div class="muted">@{{ user.login }} · 角色 {{ user.role }}</div>
      </div>
      <h2 style="font-size: 17px">我的投稿</h2>
      <div v-for="s in subs" :key="s.id" class="card">
        <div style="font-weight: 700">{{ s.title }}</div>
        <span class="chip">{{ s.status }}</span>
        <span class="muted">{{ s.createdAt }}</span>
        <p v-if="s.reviewNote" class="muted" style="margin-bottom: 0">审核备注：{{ s.reviewNote }}</p>
      </div>
      <p v-if="subs.length === 0" class="muted">还没有投稿。<NuxtLink to="/submit">去投稿 →</NuxtLink></p>
    </template>
  </div>
</template>
