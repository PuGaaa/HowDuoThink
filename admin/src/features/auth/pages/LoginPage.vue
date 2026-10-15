<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NInput } from 'naive-ui'
import { api } from '@/api/client'
import { useAuth } from '@/composables/useAuth'

const { login } = useAuth()
const route = useRoute()
const router = useRouter()

// needsBootstrap = 系统还没有任何管理员 → 展示初始化向导（用后即闭）
const mode = ref<'login' | 'bootstrap'>('login')

const loginName = ref('')
const password = ref('')
const err = ref('')
const busy = ref(false)

const bootForm = ref({ login: '', password: '', confirm: '' })
const bootErr = ref('')
const bootBusy = ref(false)

onMounted(async () => {
  try {
    const r = await api.get('/api/auth/bootstrap')
    if (r.needsBootstrap) mode.value = 'bootstrap'
  } catch {
    // 探测失败保持登录表单
  }
})

async function submit() {
  err.value = ''
  busy.value = true
  try {
    await login(loginName.value.trim(), password.value)
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(target)
  } catch (e: any) {
    err.value = e?.message || '登录失败'
  } finally {
    busy.value = false
  }
}

async function submitBootstrap() {
  bootErr.value = ''
  const { login: name, password: pw, confirm } = bootForm.value
  if (pw.length < 6) {
    bootErr.value = '密码至少 6 位'
    return
  }
  if (pw !== confirm) {
    bootErr.value = '两次输入的密码不一致'
    return
  }
  bootBusy.value = true
  try {
    await api.post('/api/auth/bootstrap', { login: name.trim(), password: pw })
    await login(name.trim(), pw)
    router.push('/')
  } catch (e: any) {
    bootErr.value = e?.message || '初始化失败'
  } finally {
    bootBusy.value = false
  }
}
</script>

<template>
  <div class="wrap">
    <div class="card">
      <div class="logo">⭐</div>
      <h1 class="title">好多星 · 管理端</h1>

      <template v-if="mode === 'bootstrap'">
        <p class="hint-line">系统还没有管理员账号，请设置初始管理员（创建后此向导自动关闭）</p>
        <div class="field">
          <label>管理员账号</label>
          <NInput v-model:value="bootForm.login" placeholder="2-40 位账号" @keyup.enter="submitBootstrap" />
        </div>
        <div class="field">
          <label>密码（≥6 位）</label>
          <NInput
            v-model:value="bootForm.password"
            type="password"
            show-password-on="click"
            placeholder="密码"
            @keyup.enter="submitBootstrap"
          />
        </div>
        <div class="field">
          <label>确认密码</label>
          <NInput
            v-model:value="bootForm.confirm"
            type="password"
            show-password-on="click"
            placeholder="再输一遍"
            @keyup.enter="submitBootstrap"
          />
        </div>
        <p v-if="bootErr" class="err">{{ bootErr }}</p>
        <NButton type="primary" block size="large" :loading="bootBusy" @click="submitBootstrap">
          创建初始管理员并进入
        </NButton>
      </template>
      <template v-else>
        <p class="hint-line">诊断思维训练场 · 内容与运营控制台</p>
        <div class="field">
          <label>账号</label>
          <NInput v-model:value="loginName" placeholder="账号" @keyup.enter="submit" />
        </div>
        <div class="field">
          <label>密码</label>
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="密码"
            @keyup.enter="submit"
          />
        </div>
        <p v-if="err" class="err">{{ err }}</p>
        <NButton type="primary" block size="large" :loading="busy" @click="submit">登录</NButton>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 12% 18%, var(--coral-soft) 0, transparent 34%),
    radial-gradient(circle at 88% 82%, var(--sky-soft) 0, transparent 34%),
    var(--bg);
}

.card {
  width: 380px;
  background: var(--card);
  border: 2px solid var(--line);
  border-radius: 20px;
  padding: 36px 34px;
  box-shadow: 0 8px 0 var(--edge-cream);
}

.logo {
  font-size: 40px;
  text-align: center;
  filter: drop-shadow(0 4px 0 var(--edge-cream));
}

.title {
  font-size: 19px;
  font-weight: 800;
  color: var(--ink);
  margin: 8px 0 4px;
  text-align: center;
}

.hint-line {
  text-align: center;
  color: var(--ink3);
  font-size: 12px;
  margin: 0 0 24px;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink2);
  margin-bottom: 6px;
}

.err {
  color: var(--red-deep);
  font-size: 13px;
  margin: 0 0 10px;
}
</style>
