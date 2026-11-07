<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NInput, NModal } from 'naive-ui'
import { BarChart3, Bot, FileText, HeartPulse, ImagePlus, Inbox, LayoutGrid, Settings, Users } from 'lucide-vue-next'
import { api } from '@/api/client'
import { useAuth } from '@/composables/useAuth'
import logoMark from '@/assets/logo-sm.png'
import ShaderBackground from '@/components/ShaderBackground.vue'

const { user, fetchMe, logout } = useAuth()
const route = useRoute()
const router = useRouter()

const NAV = [
  { to: '/overview', name: 'overview', icon: BarChart3, label: '数据概览' },
  { to: '/submissions', name: 'submissions', icon: Inbox, label: '投稿审核' },
  { to: '/cases', name: 'cases', icon: LayoutGrid, label: 'Case 管理', match: ['cases', 'case-edit'] },
  { to: '/assets', name: 'assets', icon: ImagePlus, label: '素材管理' },
  { to: '/users', name: 'users', icon: Users, label: '用户管理', adminOnly: true },
  { to: '/ai-usage', name: 'ai-usage', icon: Bot, label: 'AI 用量' },
  { to: '/ops', name: 'ops', icon: HeartPulse, label: '服务健康' },
  { to: '/settings', name: 'settings', icon: Settings, label: '系统设置', adminOnly: true },
  { to: '/privacy-policy', name: 'privacy-policy', icon: FileText, label: '隐私政策', adminOnly: true },
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
    <ShaderBackground />
    <aside class="side">
      <div class="brand">
        <img class="brand__logo" :src="logoMark" alt="好多星" />
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
          <component :is="item.icon" class="nav__icon" :size="18" :stroke-width="1.75" />
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
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border-right: 1px solid var(--glass-border);
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

.brand__logo {
  width: 30px;
  height: 30px;
  display: block;
  border-radius: 8px;
}

.brand__name {
  font-weight: 700;
  font-size: 16px;
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
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink2);
  transition: background 0.12s, color 0.12s;
}

.nav__item:hover {
  background: var(--well);
  color: var(--ink);
}

.nav__item--active {
  background: rgba(255, 138, 92, 0.12);
  color: var(--coral-deep);
  font-weight: 600;
}

.nav__icon {
  flex-shrink: 0;
}

.side__foot {
  border-top: 1px solid var(--glass-border);
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
  background: rgba(255, 138, 92, 0.15);
  color: var(--coral-deep);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.foot__name {
  font-weight: 600;
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
  font-size: 20px;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
}

.content {
  max-width: 1020px;
  margin: 0 auto;
  padding: 18px 32px 80px;
}

@media (max-width: 700px) {
  .layout {
    display: block;
  }

  .side {
    width: auto;
    height: auto;
    padding: 12px;
    position: relative;
  }

  .brand {
    padding-bottom: 10px;
  }

  .nav {
    flex-direction: row;
    flex: none;
    overflow-x: auto;
  }

  .nav__item {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .side__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 10px;
  }

  .foot__who {
    margin-bottom: 0;
  }

  .pagehead {
    padding: 18px 16px 0;
  }

  .content {
    max-width: none;
    padding: 16px 16px 60px;
  }
}
</style>
