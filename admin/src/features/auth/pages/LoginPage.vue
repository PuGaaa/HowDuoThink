<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NInput } from 'naive-ui'
import { useAuth } from '@/composables/useAuth'

const { login } = useAuth()
const route = useRoute()
const router = useRouter()

const loginName = ref('')
const password = ref('')
const err = ref('')
const busy = ref(false)

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
      <h1 class="title">⭐ 好多星 · 管理端</h1>
      <p class="hint">仅 editor / admin 角色可登录</p>
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
      <NButton type="primary" block :loading="busy" @click="submit">登录</NButton>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card {
  width: 360px;
  background: #fff;
  border-radius: 16px;
  padding: 32px 30px;
  box-shadow: 0 12px 40px rgba(42, 39, 51, 0.08);
}
.title {
  font-size: 18px;
  margin: 0 0 4px;
  text-align: center;
}
.hint {
  text-align: center;
  color: #9c96ad;
  font-size: 12px;
  margin: 0 0 22px;
}
.field {
  margin-bottom: 14px;
}
.field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #7a7290;
  margin-bottom: 5px;
}
.err {
  color: #d6455d;
  font-size: 13px;
  margin: 0 0 10px;
}
</style>
