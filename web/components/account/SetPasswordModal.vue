<script setup lang="ts">
import BaseModal from '../layout/BaseModal.vue'
import type { User } from '~/composables/useCurrentUser'

/** 设置密码弹窗（无密码用户入口）：新密码 + 确认 → POST /api/me/password（oldPassword 空串）。
 * 成功后重拉权威资料刷新 user.hasPassword，菜单/资料页入口随之变「修改密码」。 */
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'back'): void
}>()
const api = useApi()
const { user, set } = useCurrentUser()

const newPassword = ref('')
const confirm = ref('')
const err = ref('')
const busy = ref(false)
const ok = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | undefined
onUnmounted(() => clearTimeout(closeTimer))

async function refreshUser() {
  if (!user.value) return
  try {
    // hasPassword 只在 /api/me 权威资料里，成功后必须重拉，不能信本地推测
    set(await api.get<User>('/api/me'))
  } catch {
    // 重拉失败保留现态：下次进资料页仍会以服务端为准
  }
}

async function save() {
  err.value = ''
  if (newPassword.value !== confirm.value) {
    err.value = '两次输入的新密码不一致'
    return
  }
  busy.value = true
  try {
    // 无密码用户：oldPassword 传空串即直接设置（后端约定）
    await api.post('/api/me/password', { oldPassword: '', newPassword: newPassword.value })
    await refreshUser()
    ok.value = true
    closeTimer = setTimeout(() => emit('close'), 1200)
  } catch (e: any) {
    err.value = e?.data?.detail || '设置失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal title="设置密码" @close="emit('close')">
    <template v-if="!ok">
      <div class="field">
        <label>新密码（≥6 位）</label>
        <input v-model="newPassword" type="password" autocomplete="new-password" />
      </div>
      <div class="field">
        <label>确认新密码</label>
        <input v-model="confirm" type="password" autocomplete="new-password" @keyup.enter="save" />
      </div>
      <p v-if="err" class="pwmodal__err">{{ err }}</p>
      <button class="btn pwmodal__submit" :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存新密码' }}</button>
      <button class="lmodal__back" @click="emit('back')">← 返回个人信息</button>
    </template>
    <template v-else>
      <p class="pwmodal__ok">✓ 密码已设置</p>
    </template>
  </BaseModal>
</template>

<style scoped>
.pwmodal__err { color: var(--red); font-size: 13px; margin: 0 0 10px; }
.pwmodal__submit { width: 100%; }
.pwmodal__ok { text-align: center; font-weight: 700; color: var(--mint-deep); }
</style>
