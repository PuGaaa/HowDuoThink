<script setup lang="ts">
import BaseModal from '../layout/BaseModal.vue'
import UserAvatar from './UserAvatar.vue'
import AvatarPicker from './AvatarPicker.vue'
import type { User } from '~/composables/useCurrentUser'

/** 个人信息弹窗：昵称编辑 + 点头像开 AvatarPicker（本组件挂载）。
 * 刻意「无」头像 URL 输入框、「无」登录方式行；
 * 底部密码入口按 hasPassword 只渲染「设置密码」或「修改密码」其一。 */
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-password', mode: 'set' | 'change'): void
}>()
const api = useApi()
const { user, set } = useCurrentUser()

const editName = ref(user.value?.name || '')
const editErr = ref('')
const editBusy = ref(false)
const pickerOpen = ref(false)

const pwLabel = computed(() => (user.value?.hasPassword ? '修改密码' : '设置密码'))

async function saveProfile() {
  editErr.value = ''
  editBusy.value = true
  try {
    // PATCH 返回全量资料（含 hasPassword），可直接入登录态
    set(await api.patch('/api/me', { name: editName.value }) as User)
    emit('close')
  } catch (e: any) {
    editErr.value = e?.data?.detail || '保存失败'
  } finally {
    editBusy.value = false
  }
}

function openPassword() {
  emit('open-password', user.value?.hasPassword ? 'change' : 'set')
}
</script>

<template>
  <BaseModal title="个人信息" @close="emit('close')">
    <div class="field avatarfield">
      <label>头像</label>
      <button type="button" class="avatarfield__trigger" title="点击更换头像" @click="pickerOpen = true">
        <UserAvatar :name="editName || user?.name || ''" :avatar="user?.avatar" :size="64" />
      </button>
      <span class="avatarfield__hint">点击头像，从图库选择或上传本地图片</span>
    </div>
    <div class="field">
      <label>昵称</label>
      <input v-model="editName" maxlength="40" @keyup.enter="saveProfile" />
    </div>
    <p v-if="editErr" class="profilemodal__err">{{ editErr }}</p>
    <button class="btn profilemodal__submit" :disabled="editBusy" @click="saveProfile">{{ editBusy ? '保存中…' : '保存' }}</button>
    <button class="lmodal__back" @click="emit('close')">取消</button>
    <button class="lmodal__back lmodal__back--accent" @click="openPassword">{{ pwLabel }} →</button>

    <AvatarPicker v-if="pickerOpen" :name="editName || user?.name || ''" @close="pickerOpen = false" />
  </BaseModal>
</template>

<style scoped>
.avatarfield { display: flex; flex-direction: column; align-items: flex-start; }
.avatarfield__trigger { background: none; border: 0; padding: 0; cursor: pointer; border-radius: 50%; }
.avatarfield__hint { color: var(--ink3); font-size: 12px; margin-top: 6px; }
.profilemodal__err { color: var(--red); font-size: 13px; margin: 0 0 10px; }
.profilemodal__submit { width: 100%; }
</style>
