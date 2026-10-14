<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton } from 'naive-ui'
import { useAuth } from '@/composables/useAuth'

const { user, fetchMe, logout } = useAuth()
const route = useRoute()
const router = useRouter()

onMounted(async () => {
  try {
    await fetchMe()
  } catch {
    // 401 已由 client 清 token，路由守卫会兜底
  }
})

function doLogout() {
  logout()
  router.push('/login')
}
</script>

<template>
  <div class="layout">
    <aside class="side">
      <div class="brand">⭐ 好多星 · 管理端</div>
      <nav class="nav">
        <RouterLink to="/submissions" class="nav__item" :class="{ 'nav__item--active': route.name === 'submissions' }">
          投稿审核
        </RouterLink>
        <RouterLink
          to="/cases"
          class="nav__item"
          :class="{ 'nav__item--active': route.name === 'cases' || route.name === 'case-edit' }"
        >
          Case 管理
        </RouterLink>
        <RouterLink
          v-if="user?.role === 'admin'"
          to="/users"
          class="nav__item"
          :class="{ 'nav__item--active': route.name === 'users' }"
        >
          用户管理
        </RouterLink>
        <RouterLink to="/ai-usage" class="nav__item" :class="{ 'nav__item--active': route.name === 'ai-usage' }">
          AI 用量
        </RouterLink>
      </nav>
      <div class="side__foot">
        <template v-if="user">
          <div class="who">{{ user.name || user.login }}</div>
          <div class="who__role">{{ user.role }}</div>
        </template>
        <NButton quaternary size="tiny" @click="doLogout">退出登录</NButton>
      </div>
    </aside>
    <div class="body">
      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}
.side {
  width: 200px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #eceaf2;
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand {
  font-weight: 800;
  font-size: 15px;
  padding: 0 10px 18px;
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
.nav__item {
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 14px;
  color: #6b6480;
}
.nav__item:hover {
  background: #f5f3f7;
}
.nav__item--active {
  background: #f1e9ff;
  color: #7c5cd6;
  font-weight: 700;
}
.side__foot {
  border-top: 1px solid #eceaf2;
  padding: 12px 10px 0;
  font-size: 13px;
}
.who {
  font-weight: 700;
}
.who__role {
  color: #9c96ad;
  font-size: 12px;
  margin-bottom: 6px;
}
.body {
  flex: 1;
  min-width: 0;
}
.content {
  max-width: 980px;
  margin: 0 auto;
  padding: 26px 28px 80px;
}
</style>
