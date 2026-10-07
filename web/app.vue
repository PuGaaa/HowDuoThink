<script setup lang="ts">
const api = useApi()
const user = ref<any>(null)
const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

// 登录弹窗
const showLogin = ref(false)
const pwLogin = ref(false)
const loginForm = reactive({ login: '', password: '' })
const loginErr = ref('')
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

onMounted(async () => {
  try { user.value = await api.get('/api/me') } catch { user.value = null }
  document.addEventListener('click', onDocClick)
})
onUnmounted(() => document.removeEventListener('click', onDocClick))
function onDocClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) menuOpen.value = false
}

async function refreshMe() {
  try { user.value = await api.get('/api/me') } catch { user.value = null }
}

function openLogin() {
  showLogin.value = true
  pwLogin.value = false
  loginErr.value = ''
}

async function githubLogin() {
  window.location.href = api.base + '/api/oauth/github/login'
}

async function passwordLogin() {
  loginErr.value = ''
  loginBusy.value = true
  try {
    user.value = await api.post('/api/auth/login', { login: loginForm.login, password: loginForm.password })
    showLogin.value = false
  } catch (e: any) {
    loginErr.value = e?.data?.detail || '登录失败'
  } finally {
    loginBusy.value = false
  }
}

async function logout() {
  await api.post('/api/auth/logout', null)
  user.value = null
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
    user.value = await api.patch('/api/me', { name: editName.value, avatarUrl: editAvatar.value })
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

const isAdmin = computed(() => user.value && ['editor', 'admin'].includes(user.value.role))
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <NuxtLink to="/" class="topbar__brand">好多星 HowDuoThink · 社区</NuxtLink>
      <nav class="topbar__nav">
        <NuxtLink to="/ai" class="topbar__link topbar__link--ai">AI 排错</NuxtLink>
        <NuxtLink to="/solutions" class="topbar__link">解决逻辑</NuxtLink>
        <NuxtLink to="/submit" class="topbar__link">投稿</NuxtLink>
        <div ref="menuRef" class="usermenu">
          <template v-if="user">
            <button class="usermenu__trigger" @click="menuOpen = !menuOpen">
              <img :src="user.avatar || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2228%22 height=%2228%22%3E%3Crect fill=%22%23E9F7F1%22 width=%2228%22 height=%2228%22 rx=%2214%22/%3E%3C/svg%3E'" class="topbar__avatar" :title="user.name || user.login" />
            </button>
            <div v-if="menuOpen" class="usermenu__drop">
              <div class="usermenu__who">
                <div class="usermenu__name">{{ user.name }}</div>
                <div class="usermenu__login">@{{ user.login }} · {{ user.role }}</div>
              </div>
              <button class="usermenu__item" @click="openEdit">个人信息</button>
              <NuxtLink to="/me" class="usermenu__item" @click="menuOpen = false">我的投稿</NuxtLink>
              <NuxtLink v-if="isAdmin" to="/admin" class="usermenu__item usermenu__item--admin" @click="menuOpen = false">管理端</NuxtLink>
              <button class="usermenu__item usermenu__item--logout" @click="logout">退出登录</button>
            </div>
          </template>
          <button v-else class="topbar__link topbar__loginbtn" @click="openLogin">登录</button>
        </div>
      </nav>
    </header>
    <main class="main"><NuxtPage /></main>
    <footer class="footer">好多星 HowDuoThink — 诊断思维训练场 · Web 社区（投稿与解决逻辑展示，闯关在 App）</footer>

    <!-- 登录弹窗 -->
    <div v-if="showLogin" class="lmask" @click="showLogin = false"></div>
    <div v-if="showLogin" class="lmodal">
      <h2 class="lmodal__title">登录</h2>

      <template v-if="!pwLogin">
        <a class="btn ghbtn" :href="api.base + '/api/oauth/github/login'">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>
          使用 GitHub 继续
        </a>
        <div class="lmodal__divider"><span>或用账号密码</span></div>
        <button class="btn btn--ghost lmodal__switch" @click="pwLogin = true">账号密码登录</button>
      </template>

      <template v-else>
        <div class="field">
          <label>账号</label>
          <input v-model="loginForm.login" autocomplete="username" placeholder="账号" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="loginForm.password" type="password" autocomplete="current-password" placeholder="密码" @keyup.enter="passwordLogin" />
        </div>
        <p v-if="loginErr" style="color: var(--red); font-size: 13px; margin: 0 0 10px">{{ loginErr }}</p>
        <button class="btn" style="width: 100%" :disabled="loginBusy" @click="passwordLogin">{{ loginBusy ? '登录中…' : '登录' }}</button>
        <button class="lmodal__back" @click="pwLogin = false">← 其他登录方式</button>
      </template>
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
        <div class="muted">{{ user?.login.startsWith('pw-') ? '账号密码' : 'GitHub · @' + user?.login }}</div>
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
          <div class="hint">GitHub 登录的用户没有初始密码，直接设置即可</div>
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
.usermenu__item--admin { color: var(--coral); font-weight: 700; }
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
.ghbtn { display: flex; align-items: center; justify-content: center; width: 100%; background: var(--ink); box-shadow: 0 5px 0 #37323F; }
.lmodal__divider { text-align: center; color: var(--ink3); font-size: 12px; margin: 18px 0; position: relative; }
.lmodal__divider::before, .lmodal__divider::after { content: ''; position: absolute; top: 50%; width: 40%; height: 1px; background: var(--line); }
.lmodal__divider::before { left: 0; }
.lmodal__divider::after { right: 0; }
.lmodal__switch { width: 100%; }
.lmodal__back { display: block; margin: 14px auto 0; background: none; border: 0; color: var(--ink3); font-size: 13px; cursor: pointer; }
</style>
