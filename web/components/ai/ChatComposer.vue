<script setup lang="ts">
/** 输入区：v-model 文本 + 发送/Enter 逻辑（原单栏版迁移）。
 * 只负责编辑与触发：文本合法性守卫后上报 send 事件，真正发问在 useAiChat.send。 */
const props = defineProps<{
  modelValue: string
  thinking: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: []
}>()

const inputEl = ref<HTMLTextAreaElement | null>(null)

const text = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
})
const canSend = computed(() => !props.thinking && text.value.trim().length >= 2)

function resizeInput() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 132) + 'px'
}

function trySend() {
  if (!canSend.value) return
  emit('send')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    trySend()
  }
}

onMounted(() => inputEl.value?.focus())
</script>

<template>
  <div class="composer glass">
    <textarea
      ref="inputEl"
      v-model="text"
      rows="1"
      class="composer__input"
      :disabled="props.thinking"
      placeholder="描述你的故障现象…"
      maxlength="500"
      @keydown="onKeydown"
      @input="resizeInput"
    ></textarea>
    <button class="composer__send" :disabled="!canSend" aria-label="发送" @click="trySend">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  </div>
  <p class="composer__hint">Enter 发送 · Shift + Enter 换行 · 回答基于案例库检索，请以出处为准</p>
</template>

<style scoped>
/* 输入框玻璃材质（任务 13）：背景/边框/阴影交给 .glass；聚焦态保留珊瑚描边提示 */
.composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 14px;
  border-radius: 18px;
  padding: 10px 10px 10px 18px;
  transition: border-color 0.15s;
}
.composer:focus-within {
  border-color: var(--coral);
}
.composer__input {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.6;
  color: var(--ink);
  padding: 6px 0;
  max-height: 132px;
}
.composer__input::placeholder {
  color: var(--ink2); /* 玻璃底可读性（任务 13） */
}
.composer__input:disabled {
  opacity: 0.6;
}
.composer__send {
  flex: none;
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 50%;
  background: var(--coral);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 0 var(--coral-deep);
  transition: filter 0.15s, transform 0.1s;
}
.composer__send:hover:not(:disabled) {
  filter: brightness(1.06);
}
.composer__send:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--coral-deep);
}
.composer__send:disabled {
  background: #ddd3c5;
  box-shadow: none;
  cursor: not-allowed;
}
.composer__hint {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--ink3);
}
</style>
