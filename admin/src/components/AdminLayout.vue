<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NInput, NModal } from 'naive-ui'
import { api } from '@/api/client'
import { useAuth } from '@/composables/useAuth'

const { user, fetchMe, logout } = useAuth()
const route = useRoute()
const router = useRouter()

const NAV = [
  { to: '/overview', name: 'overview', icon: '📊', label: '数据概览' },
  { to: '/submissions', name: 'submissions', icon: '📥', label: '投稿审核' },
  { to: '/cases', name: 'cases', icon: '🧩', label: 'Case 管理', match: ['cases', 'case-edit'] },
  { to: '/users', name: 'users', icon: '👥', label: '用户管理', adminOnly: true },
  { to: '/ai-usage', name: 'ai-usage', icon: '🤖', label: 'AI 用量' },
  { to: '/ops', name: 'ops', icon: '💚', label: '服务健康' },
  { to: '/settings', name: 'settings', icon: '⚙️', label: '系统设置', adminOnly: true },
]

const navItems = computed(() => NAV.filter((n) => !n.adminOnly || user.value?.role === 'admin'))
const pageTitle = computed(() => (route.meta.title as string) || '管理端')

// 修改密码弹窗
const pwOpen = ref(false)
const pwForm = ref({ oldPassword: '', newPassword: '', confirm: '' })
const pwErr = ref('')
const pwBusy = ref(false)

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

function isActive(item: (typeof NAV)[number]) {
  return (item.match ?? [item.name]).includes(route.name as string)
}

async function submitPassword() {
  pwErr.value = ''
  const { oldPassword, newPassword, confirm } = pwForm.value
  if (newPassword.length < 6) {
    pwErr.value = '新密码至少 6 位'
    return
  }
  if (newPassword !== confirm) {
    pwErr.value = '两次输入的新密码不一致'
    return
  }
  pwBusy.value = true
  try {
    await api.post('/api/me/password', { oldPassword, newPassword })
    pwOpen.value = false
    pwForm.value = { oldPassword: '', newPassword: '', confirm: '' }
  } catch (e: any) {
    pwErr.value = e?.message || '修改失败'
  } finally {
    pwBusy.value = false
  }
}
</script>

<template>
  <div class="layout">
    <aside class="side">
      <div class="brand">
        <span class="brand__star">⭐</span>
        <div class="brand__text">
          <div class="brand__name">好多星</div>
          <div class="brand__sub">HowDuoThink · 管理端</div>
        </div>
      </div>

      <nav class="nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav__item"
          :class="{ 'nav__item--active': isActive(item) }"
        >
          <span class="nav__icon">{{ item.icon }}</span>
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="side__foot" v-if="user">
        <div class="foot__who">
          <div class="foot__avatar">{{ (user.name || user.login || '?').slice(0, 1).toUpperCase() }}</div>
          <div class="foot__meta">
            <div class="foot__name">{{ user.name || user.login }}</div>
            <div class="foot__role">{{ user.role === 'admin' ? '管理员' : '编辑' }}</div>
          </div>
        </div>
        <div class="foot__actions">
          <NButton size="tiny" quaternary @click="pwOpen = true">修改密码</NButton>
          <NButton size="tiny" quaternary @click="doLogout">退出登录</NButton>
        </div>
      </div>
    </aside>

    <NModal
      v-model:show="pwOpen"
      preset="dialog"
      title="修改密码"
      positive-text="保存新密码"
      negative-text="取消"
      :loading="pwBusy"
      @positive-click="submitPassword"
      @negative-click="pwOpen = false"
      @close="pwOpen = false"
    >
      <div class="pwfield">
        <label>当前密码</label>
        <NInput v-model:value="pwForm.oldPassword" type="password" show-password-on="click" placeholder="当前密码" />
      </div>
      <div class="pwfield">
        <label>新密码（≥6 位）</label>
        <NInput v-model:value="pwForm.newPassword" type="password" show-password-on="click" placeholder="新密码" />
      </div>
      <div class="pwfield">
        <label>确认新密码</label>
        <NInput v-model:value="pwForm.confirm" type="password" show-password-on="click" placeholder="再输一遍" />
      </div>
      <p v-if="pwErr" class="pwerr">{{ pwErr }}</p>
    </NModal>

    <div class="body">
      <header class="pagehead">
        <h1 class="pagehead__title">{{ pageTitle }}</h1>
      </header>
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
  width: 216px;
  flex-shrink: 0;
  background: var(--card);
  border-right: 2px solid var(--line);
  display: flex;
  flex-direction: column;
  padding: 22px 14px 18px;
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 8px 20px;
}

.brand__star {
  font-size: 26px;
  filter: drop-shadow(0 3px 0 var(--edge-cream));
}

.brand__name {
  font-weight: 800;
  font-size: 17px;
  color: var(--ink);
  line-height: 1.2;
}

.brand__sub {
  font-size: 11px;
  color: var(--ink3);
  margin-top: 1px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink2);
  transition: background 0.12s, color 0.12s;
}

.nav__item:hover {
  background: var(--well);
  color: var(--ink);
}

.nav__item--active {
  background: var(--coral-soft);
  color: var(--coral-deep);
  box-shadow: inset 0 0 0 2px #FFD3BC;
}

.nav__icon {
  font-size: 16px;
}

.side__foot {
  border-top: 2px solid var(--well);
  padding: 14px 8px 0;
}

.foot__actions {
  display: flex;
  gap: 4px;
}

.pwfield {
  margin-bottom: 12px;
}

.pwfield label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink2);
  margin-bottom: 5px;
}

.pwerr {
  color: var(--red-deep);
  font-size: 13px;
  margin: 0;
}

.foot__who {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 8px;
}

.foot__avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--coral);
  color: #fff;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 0 var(--coral-deep);
}

.foot__name {
  font-weight: 700;
  font-size: 13px;
  color: var(--ink);
}

.foot__role {
  font-size: 11px;
  color: var(--ink3);
}

.body {
  flex: 1;
  min-width: 0;
}

.pagehead {
  padding: 24px 32px 0;
}

.pagehead__title {
  font-size: 22px;
  font-weight: 800;
  color: var(--ink);
  margin: 0;
}

.content {
  max-width: 1020px;
  margin: 0 auto;
  padding: 18px 32px 80px;
}
</style>
