<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** 昵称：同时用作池内稳定选图种子与首字占位 */
  name: string
  /** 已落库头像 URL；为空时从头像池按昵称稳定取一张 */
  avatar?: string
  /** 边长（px） */
  size?: number
}>(), {
  avatar: '',
  size: 32,
})

const { avatars, load } = useAvatarPool()
const imgFailed = ref(false)

onMounted(() => { void load() })

// 同会话内稳定随机：以昵称字符串 hash 为种子取图，落库前同一用户始终显示同一张
function pickFromPool(): string {
  const pool = avatars.value
  if (!pool.length) return ''
  let h = 0
  for (let i = 0; i < props.name.length; i++) h = ((h * 31 + props.name.charCodeAt(i)) | 0) >>> 0
  return pool[h % pool.length]
}

const src = computed(() => {
  if (imgFailed.value) return ''
  if (props.avatar) return props.avatar
  return pickFromPool()
})

const initial = computed(() => {
  const chars = [...(props.name || '').trim()]
  return chars.length ? chars[0] : '?'
})

function onImgError(): void {
  imgFailed.value = true
}

// 换头像 URL 时允许重新尝试加载
watch(() => props.avatar, () => { imgFailed.value = false })
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="name"
    :title="name"
    class="user-avatar"
    :style="{ width: size + 'px', height: size + 'px' }"
    @error="onImgError"
  />
  <div
    v-else
    class="user-avatar user-avatar--initial"
    :title="name"
    :style="{
      width: size + 'px',
      height: size + 'px',
      fontSize: Math.max(11, Math.round(size * 0.45)) + 'px',
    }"
  >{{ initial }}</div>
</template>

<style scoped>
.user-avatar { border-radius: 50%; object-fit: cover; display: block; flex: none; }
.user-avatar--initial {
  display: flex; align-items: center; justify-content: center;
  background: var(--mint-soft); color: var(--mint-deep);
  font-weight: 800; user-select: none; flex: none;
}
</style>
