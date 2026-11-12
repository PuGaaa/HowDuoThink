<script setup lang="ts">
import BaseModal from '../layout/BaseModal.vue'
import type { User } from '~/composables/useCurrentUser'

/** 头像选择器：公开图库网格单选 + 本地文件上传（POST /api/me/avatar，multipart）。
 * 图库选定即 PATCH /api/me 生效；上传接口成功本身返回全量资料——两者都经 set() 立即入登录态。
 * 上传不设 Content-Type，交给浏览器带 multipart boundary。 */
const props = defineProps<{
  /** 随头像一并 PATCH 的昵称（取编辑中的值，避免覆盖未保存的昵称改动） */
  name: string
}>()
const emit = defineEmits<{ (e: 'close'): void }>()
const api = useApi()
const { user, set } = useCurrentUser()
const { avatars, load } = useAvatarPool()

const err = ref('')
const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => { void load() })

const currentAvatar = computed(() => user.value?.avatar || '')

async function applyAvatar(url: string) {
  err.value = ''
  busy.value = true
  try {
    set(await api.patch('/api/me', { name: props.name, avatarUrl: url }) as User)
  } catch (e: any) {
    err.value = e?.data?.detail || '头像保存失败'
  } finally {
    busy.value = false
  }
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  err.value = ''
  busy.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await $fetch<User>(api.base + '/api/me/avatar', { method: 'POST', credentials: 'include', body: fd })
    set(res)
  } catch (e: any) {
    // 503 OSS 未配置 / 502 OSS 不可用 → 统一给用户可懂的文案；其余透出后端 detail
    const status = Number(e?.status ?? e?.statusCode ?? 0)
    err.value = status === 503 || status === 502 ? '头像上传暂不可用' : (e?.data?.detail || '上传失败')
  } finally {
    busy.value = false
    input.value = '' // 允许再次选择同一文件
  }
}
</script>

<template>
  <BaseModal title="选择头像" @close="emit('close')">
    <div class="avatargrid">
      <button
        v-for="url in avatars"
        :key="url"
        type="button"
        class="avatargrid__item"
        :class="{ 'avatargrid__item--active': url === currentAvatar }"
        :disabled="busy"
        @click="applyAvatar(url)"
      >
        <img :src="url" alt="" />
      </button>
    </div>
    <p v-if="!avatars.length" class="hint avatargrid__empty">图库暂不可用，可直接上传本地图片</p>
    <button type="button" class="avatargrid__upload" :disabled="busy" @click="fileInput?.click()">
      {{ busy ? '处理中…' : '上传本地图片' }}
    </button>
    <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onFileChange" />
    <p class="hint avatargrid__hint">支持 PNG / JPG / WebP，不超过 2MB</p>
    <p v-if="err" class="avatargrid__err">{{ err }}</p>
    <button class="lmodal__back" @click="emit('close')">完成</button>
  </BaseModal>
</template>

<style scoped>
.avatargrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
.avatargrid__item { padding: 0; border: 2px solid transparent; border-radius: 16px; background: none; cursor: pointer; overflow: hidden; aspect-ratio: 1; }
.avatargrid__item:disabled { cursor: wait; opacity: .6; }
.avatargrid__item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.avatargrid__item--active { border-color: var(--coral); }
.avatargrid__empty { margin: 0 0 12px; }
.avatargrid__upload { width: 100%; border: 2px dashed var(--line); border-radius: 12px; background: var(--well); color: var(--ink); padding: 11px 0; font-size: 14px; cursor: pointer; }
.avatargrid__upload:disabled { cursor: wait; opacity: .6; }
.avatargrid__hint { margin-top: 8px; }
.avatargrid__err { color: var(--red); font-size: 13px; margin: 8px 0 0; }
</style>
