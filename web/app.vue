<script setup lang="ts">
import UserAvatar from '~/components/account/UserAvatar.vue'
import type { User } from '~/composables/useCurrentUser'

const api = useApi()
const { user, ensure, set } = useCurrentUser()
const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

// 登录弹窗（开关状态由 useLoginPrompt 全局承载，弹窗本体下一任务拆出）
const { visible: showLogin, open: openLoginPrompt, close: closeLoginPrompt } = useLoginPrompt()
const loginMode = ref<'phone' | 'password'>('phone')
const loginForm = reactive({ login: '', password: '' })
const phoneForm = reactive({ phone: '', code: '' })
const loginErr = ref('')
const smsSent = ref(false)
const loginBusy = ref(false)

// 个人信息编辑
const editOpen = ref(false)
const editName = ref('')
const editAvatar = ref('')
const editErr = ref('')
const editBusy = ref(false)
const pwOpen = ref(false)
const pwForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const pwErr = ref('')
const pwBusy = ref(false)
const pwOk = ref(false)

onMounted(() => {
  void ensure()
  document.addEventListener('click', onDocClick)
})
onUnmounted(() => document.removeEventListener('click', onDocClick))
function onDocClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) menuOpen.value = false
}

function openLogin() {
  loginErr.value = ''
  smsSent.value = false
  openLoginPrompt()
}

async function sendSmsCode() {
  loginErr.value = ''
  await api.post('/api/auth/sms/send', { phone: phoneForm.phone })
  smsSent.value = true
}

async function phoneLogin() {
  loginErr.value = ''
  loginBusy.value = true
  try {
    set(await api.post('/api/auth/login/phone', phoneForm) as User)
    closeLoginPrompt()
  } catch (e: any) {
    loginErr.value = e?.data?.detail || '登录失败'
  } finally {
    loginBusy.value = false
  }
}

async function passwordLogin() {
  loginErr.value = ''
  loginBusy.value = true
  try {
    set(await api.post('/api/auth/login', { login: loginForm.login, password: loginForm.password }) as User)
    closeLoginPrompt()
  } catch (e: any) {
    loginErr.value = e?.data?.detail || '登录失败'
  } finally {
    loginBusy.value = false
  }
}

async function logout() {
  // 服务端 302 到 WEB_ORIGIN，跨域重定向 fetch 无法跟随读取 → 必然 reject；
  // 会话 cookie 已随该响应清除，本地态照常清空
  await api.post('/api/auth/logout', null).catch(() => {})
  set(null)
  menuOpen.value = false
  await navigateTo('/')
}

function openEdit() {
  menuOpen.value = false
  pwOpen.value = false
  editName.value = user.value?.name || ''
  editAvatar.value = user.value?.avatar || ''
  editErr.value = ''
  editOpen.value = true
}

const avatarPreview = computed(() => editAvatar.value || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22%3E%3Crect fill=%22%23E9F7F1%22 width=%2264%22 height=%2264%22 rx=%2232%22/%3E%3C/svg%3E')

async function saveProfile() {
  editErr.value = ''
  editBusy.value = true
  try {
    set(await api.patch('/api/me', { name: editName.value, avatarUrl: editAvatar.value }) as User)
    editOpen.value = false
  } catch (e: any) {
    editErr.value = e?.data?.detail || '保存失败'
  } finally {
    editBusy.value = false
  }
}

function openPassword() {
  menuOpen.value = false
  editOpen.value = false
  pwForm.oldPassword = ''
  pwForm.newPassword = ''
  pwForm.confirm = ''
  pwErr.value = ''
  pwOk.value = false
  pwOpen.value = true
}

async function savePassword() {
  pwErr.value = ''
  if (pwForm.newPassword !== pwForm.confirm) {
    pwErr.value = '两次输入的新密码不一致'
    return
  }
  pwBusy.value = true
  try {
    await api.post('/api/me/password', { oldPassword: pwForm.oldPassword, newPassword: pwForm.newPassword })
    pwOk.value = true
    setTimeout(() => { pwOpen.value = false }, 1200)
  } catch (e: any) {
    pwErr.value = e?.data?.detail || '修改失败'
  } finally {
    pwBusy.value = false
  }
}
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <NuxtLink to="/" class="topbar__brand">
        <span class="topbar__brand-full">好多星 HowDuoThink · 社区</span>
        <span class="topbar__brand-short">好多星 · 社区</span>
      </NuxtLink>
      <nav class="topbar__nav">
        <NuxtLink to="/ai" class="topbar__link topbar__link--ai">AI 排错</NuxtLink>
        <NuxtLink to="/solutions" class="topbar__link">解决逻辑</NuxtLink>
        <NuxtLink to="/submit" class="topbar__link">投稿</NuxtLink>
        <div ref="menuRef" class="usermenu">
          <template v-if="user">
            <button class="usermenu__trigger" @click="menuOpen = !menuOpen">
              <UserAvatar class="topbar__avatar" :name="user.name || user.login" :avatar="user.avatar" :size="32" />
            </button>
            <div v-if="menuOpen" class="usermenu__drop">
              <div class="usermenu__who">
                <div class="usermenu__name">{{ user.name }}</div>
                <div class="usermenu__login">@{{ user.login }} · {{ user.role }}</div>
              </div>
              <button class="usermenu__item" @click="openEdit">个人信息</button>
              <NuxtLink to="/me" class="usermenu__item" @click="menuOpen = false">我的投稿</NuxtLink>
              <button class="usermenu__item usermenu__item--logout" @click="logout">退出登录</button>
            </div>
          </template>
          <button v-else class="topbar__link topbar__loginbtn" @click="openLogin">登录</button>
        </div>
      </nav>
    </header>
    <main class="main"><NuxtPage /></main>
    <footer class="footer">好多星 HowDuoThink · 多想，多星。—— Web 社区（投稿与解决逻辑展示，闯关在 App）· <NuxtLink to="/privacy" class="footer__link">隐私政策</NuxtLink></footer>

    <!-- 登录弹窗 -->
    <div v-if="showLogin" class="lmask" @click="closeLoginPrompt"></div>
    <div v-if="showLogin" class="lmodal">
      <h2 class="lmodal__title">登录</h2>

      <div class="loginmodes">
        <button :class="{ 'loginmodes__active': loginMode === 'phone' }" @click="loginMode = 'phone'">手机验证码</button>
        <button :class="{ 'loginmodes__active': loginMode === 'password' }" @click="loginMode = 'password'">账号密码</button>
      </div>
      <template v-if="loginMode === 'phone'">
        <div class="field">
          <label>手机号</label>
          <input v-model="phoneForm.phone" inputmode="numeric" autocomplete="tel" placeholder="手机号" />
        </div>
        <div class="field">
          <label>验证码</label>
          <div class="codefield">
            <input v-model="phoneForm.code" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位验证码" @keyup.enter="phoneLogin" />
            <button class="codefield__send" :disabled="!phoneForm.phone || smsSent" @click="sendSmsCode">{{ smsSent ? '已发送' : '获取验证码' }}</button>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="field">
          <label>账号或手机号</label>
          <input v-model="loginForm.login" autocomplete="username" placeholder="账号或手机号" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="loginForm.password" type="password" autocomplete="current-password" placeholder="密码" @keyup.enter="passwordLogin" />
        </div>
      </template>
      <p v-if="loginErr" style="color: var(--red); font-size: 13px; margin: 0 0 10px">{{ loginErr }}</p>
      <button class="btn" style="width: 100%" :disabled="loginBusy" @click="loginMode === 'phone' ? phoneLogin() : passwordLogin()">{{ loginBusy ? '登录中…' : '登录' }}</button>
      <p class="hint" style="margin-top: 10px">手机号首次登录会自动建立账号；已有账号也可继续用密码登录</p>
    </div>

    <!-- 个人信息编辑弹窗 -->
    <div v-if="editOpen" class="lmask" @click="editOpen = false"></div>
    <div v-if="editOpen" class="lmodal">
      <h2 class="lmodal__title">个人信息</h2>
      <div class="field avatarfield">
        <label>头像</label>
        <img :src="avatarPreview" class="avatarfield__preview" />
        <input v-model="editAvatar" placeholder="头像图片 URL（留空恢复默认）" />
      </div>
      <div class="field">
        <label>昵称</label>
        <input v-model="editName" maxlength="40" @keyup.enter="saveProfile" />
      </div>
        <div class="field">
          <label>登录方式</label>
          <div class="muted">账号密码 · @{{ user?.login }}</div>
        </div>
      <p v-if="editErr" style="color: var(--red); font-size: 13px; margin: 0 0 10px">{{ editErr }}</p>
      <button class="btn" style="width: 100%" :disabled="editBusy" @click="saveProfile">{{ editBusy ? '保存中…' : '保存' }}</button>
      <button class="lmodal__back" @click="editOpen = false">取消</button>
      <button class="lmodal__back lmodal__back--accent" @click="openPassword">修改密码 →</button>
    </div>

    <!-- 密码修改弹窗 -->
    <div v-if="pwOpen" class="lmask" @click="pwOpen = false"></div>
    <div v-if="pwOpen" class="lmodal">
      <h2 class="lmodal__title">修改密码</h2>
      <template v-if="!pwOk">
        <div class="field">
          <label>当前密码</label>
          <input v-model="pwForm.oldPassword" type="password" autocomplete="current-password" />
        </div>
        <div class="field">
          <label>新密码（≥6 位）</label>
          <input v-model="pwForm.newPassword" type="password" autocomplete="new-password" />
        </div>
        <div class="field">
          <label>确认新密码</label>
          <input v-model="pwForm.confirm" type="password" autocomplete="new-password" />
        </div>
        <p v-if="pwErr" style="color: var(--red); font-size: 13px; margin: 0 0 10px">{{ pwErr }}</p>
        <button class="btn" style="width: 100%" :disabled="pwBusy" @click="savePassword">{{ pwBusy ? '保存中…' : '保存新密码' }}</button>
        <button class="lmodal__back" @click="pwOpen = false; editOpen = true">← 返回个人信息</button>
      </template>
      <template v-else>
        <p style="text-align: center; font-weight: 700; color: var(--mint-deep)">✓ 密码已更新</p>
      </template>
    </div>
  </div>
</template>

<style>
@import '~/assets/css/main.css';
.topbar__avatar { width: 32px; height: 32px; border-radius: 50%; }
.topbar__loginbtn { background: var(--coral); color: #fff !important; border-radius: 999px; padding: 6px 18px; font-weight: 700; }
.usermenu { position: relative; }
.usermenu__trigger { background: none; border: 0; padding: 0; cursor: pointer; display: block; }
.usermenu__drop {
  position: absolute; right: 0; top: 42px; min-width: 200px;
  background: #fff; border-radius: 14px; box-shadow: 0 6px 0 var(--edge-cream); padding: 8px;
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
.avatarfield { display: flex; flex-direction: column; }
.avatarfield__preview { width: 64px; height: 64px; border-radius: 50%; border: 2px solid var(--line); margin-bottom: 10px; object-fit: cover; }
.lmask { position: fixed; inset: 0; background: rgba(42, 39, 51, 0.45); backdrop-filter: blur(3px); z-index: 98; }
.lmodal__back--accent { color: var(--coral); font-weight: 700; }
.lmodal {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: calc(100% - 40px); max-width: 440px; margin: 0;
  background: var(--bg); border-radius: 18px; padding: 26px 28px;
  max-height: 86vh; overflow-y: auto;
  box-shadow: 0 24px 64px rgba(42, 39, 51, 0.28);
  z-index: 99;
}
.lmodal__title { font-size: 19px; margin: 0 0 20px; text-align: center; font-weight: 800; }
.lmodal__back { display: block; margin: 14px auto 0; background: none; border: 0; color: var(--ink3); font-size: 13px; cursor: pointer; }
.loginmodes { display: flex; gap: 8px; margin: -4px 0 18px; }
.loginmodes button { flex: 1; border: 0; border-bottom: 2px solid var(--line); background: none; color: var(--ink3); padding: 8px 0; cursor: pointer; }
.loginmodes__active { border-bottom-color: var(--coral) !important; color: var(--coral) !important; font-weight: 700; }
.codefield { display: flex; gap: 8px; }
.codefield input { min-width: 0; flex: 1; }
.codefield__send { border: 1px solid var(--line); border-radius: 10px; padding: 0 12px; background: var(--well); color: var(--ink); white-space: nowrap; cursor: pointer; }
.codefield__send:disabled { cursor: not-allowed; opacity: .55; }
</style>
