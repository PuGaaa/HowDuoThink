<script setup lang="ts">
import BaseModal from '../layout/BaseModal.vue'
import { normalizeLoginResponse } from '~/composables/useCurrentUser'

/** 登录弹窗：手机验证码 / 账号密码两模式（逻辑自 app.vue 原样迁移）。
 * 开关走 useLoginPrompt 全局单例——顶栏登录按钮与其它页面共用同一入口，
 * 本组件自接线 visible，app.vue 只负责挂载。 */
const api = useApi()
const { set } = useCurrentUser()
const { visible, close } = useLoginPrompt()

const loginMode = ref<'phone' | 'password'>('phone')
const loginForm = reactive({ login: '', password: '' })
const phoneForm = reactive({ phone: '', code: '' })
const loginErr = ref('')
const smsSent = ref(false)
const loginBusy = ref(false)

// 每次打开重置错误与验证码已发状态（表单内容保留，与原行为一致）
watch(visible, (v) => {
  if (!v) return
  loginErr.value = ''
  smsSent.value = false
})

async function sendSmsCode() {
  loginErr.value = ''
  try {
    await api.post('/api/auth/sms/send', { phone: phoneForm.phone })
    smsSent.value = true
  } catch (e: any) {
    loginErr.value = e?.data?.detail || '验证码发送失败'
  }
}

async function phoneLogin() {
  loginErr.value = ''
  loginBusy.value = true
  try {
    // 登录响应是 userId 线格式（手机登录连 avatar 都不含），必须归一化，禁止 as User 直断言
    set(normalizeLoginResponse(await api.post('/api/auth/login/phone', phoneForm)))
    close()
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
    set(normalizeLoginResponse(await api.post('/api/auth/login', { login: loginForm.login, password: loginForm.password })))
    close()
  } catch (e: any) {
    loginErr.value = e?.data?.detail || '登录失败'
  } finally {
    loginBusy.value = false
  }
}
</script>

<template>
  <BaseModal v-if="visible" title="登录" @close="close">
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
    <p v-if="loginErr" class="loginmodal__err">{{ loginErr }}</p>
    <button class="btn loginmodal__submit" :disabled="loginBusy" @click="loginMode === 'phone' ? phoneLogin() : passwordLogin()">{{ loginBusy ? '登录中…' : '登录' }}</button>
    <p class="hint loginmodal__hint">手机号首次登录会自动建立账号；已有账号也可继续用密码登录</p>
  </BaseModal>
</template>

<style scoped>
.loginmodes { display: flex; gap: 8px; margin: -4px 0 18px; }
.loginmodes button { flex: 1; border: 0; border-bottom: 2px solid var(--line); background: none; color: var(--ink3); padding: 8px 0; cursor: pointer; }
.loginmodes__active { border-bottom-color: var(--coral) !important; color: var(--coral) !important; font-weight: 700; }
.codefield { display: flex; gap: 8px; }
.codefield input { min-width: 0; flex: 1; }
.codefield__send { border: 1px solid var(--line); border-radius: 10px; padding: 0 12px; background: var(--well); color: var(--ink); white-space: nowrap; cursor: pointer; }
.codefield__send:disabled { cursor: not-allowed; opacity: .55; }
.loginmodal__err { color: var(--red); font-size: 13px; margin: 0 0 10px; }
.loginmodal__submit { width: 100%; }
.loginmodal__hint { margin-top: 10px; }
</style>
