<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NInput } from 'naive-ui'
import { api } from '@/api/client'
import { useAuth } from '@/composables/useAuth'

const { login } = useAuth()
const route = useRoute()
const router = useRouter()

// default = 初始账号还在用默认密码 → 登录页给出提示（改过密即消失）
const defaultHint = ref(false)

const loginName = ref('')
const password = ref('')
const err = ref('')
const busy = ref(false)

onMounted(async () => {
  try {
    const r = await api.get('/api/auth/default-account')
    if (r.default) defaultHint.value = true
  } catch {
    // 探测失败不提示
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
</script>

<template>
  <div class="wrap">
    <div class="card">
      <div class="logo">⭐</div>
      <h1 class="title">好多星 · 管理端</h1>
      <p class="hint-line">诊断思维训练场 · 内容与运营控制台</p>

      <div v-if="defaultHint" class="default-tip">
        初始账号：<b>admin / HaoDuo@2026</b>（仅首次引导，登录后请修改密码）
      </div>

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
  margin: 0 0 20px;
}

.default-tip {
  background: var(--lemon-soft);
  color: var(--lemon-deep);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12px;
  margin-bottom: 18px;
  text-align: center;
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
