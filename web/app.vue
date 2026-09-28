<script setup lang="ts">
const api = useApi()
const user = ref<any>(null)
onMounted(async () => {
  try { user.value = await api.get('/api/me') } catch { user.value = null }
})
async function logout() {
  await $fetch('http://localhost:8000/api/auth/logout', { method: 'POST', credentials: 'include' })
  user.value = null
  await navigateTo('/')
}
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <NuxtLink to="/" class="topbar__brand">排错推理训练场 · 社区</NuxtLink>
      <nav class="topbar__nav">
        <NuxtLink to="/solutions" class="topbar__link">解决逻辑</NuxtLink>
        <NuxtLink to="/submit" class="topbar__link">投稿</NuxtLink>
        <NuxtLink to="/me" class="topbar__link">我的</NuxtLink>
        <template v-if="user">
          <img :src="user.avatar" class="topbar__avatar" :title="user.name" />
          <button class="topbar__logout" @click="logout">退出</button>
        </template>
        <a v-else href="http://localhost:8000/api/oauth/github/login" class="topbar__link">GitHub 登录</a>
      </nav>
    </header>
    <main class="main"><NuxtPage /></main>
    <footer class="footer">给 agent 时代程序员的排错推理训练场 · Web 社区（投稿与解决逻辑展示，闯关在 App）</footer>
  </div>
</template>

<style>
@import '~/assets/css/main.css';
.topbar__avatar { width: 28px; height: 28px; border-radius: 50%; }
.topbar__logout { background: none; border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; font-size: 12px; color: var(--ink2); cursor: pointer; }
.topbar__logout:hover { color: var(--red); border-color: var(--red); }
</style>
