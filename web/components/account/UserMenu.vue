<script setup lang="ts">
import UserAvatar from './UserAvatar.vue'

/** 顶栏用户菜单：头像触发下拉（逻辑自 app.vue 原样迁移）。
 * 密码入口文案随 user.hasPassword——登录响应不含该字段，以 /api/me 权威资料为准。 */
const emit = defineEmits<{
  (e: 'open-profile'): void
  (e: 'open-password', mode: 'set' | 'change'): void
}>()
const api = useApi()
const { user, set } = useCurrentUser()
const { open: openLogin } = useLoginPrompt()

const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
function onDocClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) menuOpen.value = false
}

function closeMenu() {
  menuOpen.value = false
}
function openProfile() {
  closeMenu()
  emit('open-profile')
}
function openPassword() {
  closeMenu()
  // hasPassword 仅资料接口返回：true → 修改；false 或尚未拉到 → 按未设置走「设置密码」
  emit('open-password', user.value?.hasPassword ? 'change' : 'set')
}

async function logout() {
  // 服务端 302 到 WEB_ORIGIN，跨域重定向 fetch 无法跟随读取 → 必然 reject；
  // 会话 cookie 已随该响应清除，本地态照常清空
  await api.post('/api/auth/logout', null).catch(() => {})
  set(null)
  closeMenu()
  await navigateTo('/')
}
</script>

<template>
  <div ref="menuRef" class="usermenu">
    <template v-if="user">
      <button class="usermenu__trigger" @click="menuOpen = !menuOpen">
        <UserAvatar class="usermenu__avatar" :name="user.name || user.login" :avatar="user.avatar" :size="32" />
      </button>
      <div v-if="menuOpen" class="usermenu__drop glass glass-pop">
        <div class="usermenu__who">
          <div class="usermenu__name">{{ user.name }}</div>
          <div class="usermenu__login">@{{ user.login }} · {{ user.role }}</div>
        </div>
        <button class="usermenu__item" @click="openProfile">个人信息</button>
        <button class="usermenu__item" @click="openPassword">{{ user.hasPassword ? '修改密码' : '设置密码' }}</button>
        <NuxtLink to="/me" class="usermenu__item" @click="closeMenu">我的投稿</NuxtLink>
        <button class="usermenu__item usermenu__item--logout" @click="logout">退出登录</button>
      </div>
    </template>
    <button v-else class="usermenu__loginbtn" @click="openLogin">登录</button>
  </div>
</template>

<style scoped>
.usermenu { position: relative; }
.usermenu__avatar { width: 32px; height: 32px; border-radius: 50%; }
.usermenu__trigger { background: none; border: 0; padding: 0; cursor: pointer; display: block; }
.usermenu__drop {
  position: absolute; right: 0; top: 42px; min-width: 200px;
  border-radius: 14px; padding: 8px;
  transform-origin: top right; /* 下拉从触发头像一侧展开 */
  z-index: 50;
}
.usermenu__who { padding: 10px 12px 12px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.usermenu__name { font-weight: 800; font-size: 14px; color: var(--ink); }
.usermenu__login { font-size: 12px; color: var(--ink3); margin-top: 2px; }
.usermenu__item {
  display: block; width: 100%; text-align: left; background: none; border: 0;
  padding: 9px 12px; border-radius: 8px; font-size: 13.5px; color: var(--ink);
  cursor: pointer; text-decoration: none;
}
.usermenu__item:hover { background: var(--well); }
.usermenu__item--logout { color: var(--red); }
.usermenu__loginbtn { background: var(--coral); color: #fff; border: 0; border-radius: 999px; padding: 6px 18px; font-weight: 700; font-size: 14px; cursor: pointer; }
</style>
