<script setup lang="ts">
import type { ChatMessage } from '~/composables/useAiChat'

/** 右侧对话区：空态建议、消息气泡（含出处）、思考态。
 * 视觉沿用原单栏版；滚动逻辑随列表走——消息增删或思考态切换都滚到底。 */
const props = defineProps<{
  messages: ChatMessage[]
  thinking: boolean
}>()
const emit = defineEmits<{
  suggest: [text: string]
}>()

const listEl = ref<HTMLElement | null>(null)

const suggestions = [
  '连接池耗尽怎么排查？',
  '缓存和数据库不一致是什么原因？',
  '发布后部分用户还是旧版本，可能是什么？',
]

function scrollBottom() {
  nextTick(() => {
    const el = listEl.value
    if (!el) return
    // 瞬时滚动 + rAF 兜底：smooth 在 WebKit 下会被后续布局变化打断
    el.scrollTo({ top: el.scrollHeight })
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }))
  })
}

watch(
  () => [props.messages.length, props.thinking] as const,
  () => scrollBottom(),
  { immediate: true },
)
</script>

<template>
  <div ref="listEl" class="list">
    <!-- 思考态不与空态同屏：发送在途时点「新对话」，旧应答丢弃后只留干净空态 -->
    <div v-if="props.messages.length === 0 && !props.thinking" class="empty">
      <div class="empty__star" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="30" height="30">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" />
        </svg>
      </div>
      <h2 class="empty__hello">遇到的故障，讲给我听</h2>
      <p class="empty__hello-sub">回答来自案例库的真实检索结果——可能原因、检查步骤和出处都会给全；案例没覆盖的内容，我会明说。</p>
      <div class="empty__sugs">
        <button v-for="s in suggestions" :key="s" class="empty__sug" :disabled="props.thinking" @click="emit('suggest', s)">
          <svg class="empty__sug-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z" fill="currentColor" opacity="0.85" />
            <path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor" opacity="0.45" />
          </svg>
          {{ s }}
        </button>
      </div>
    </div>

    <div v-for="(m, i) in props.messages" :key="i" :class="m.role === 'user' ? 'row row--user' : 'row'">
      <div v-if="m.role === 'assistant'" class="row__avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" />
        </svg>
      </div>
      <div :class="['bubble', m.role === 'user' ? 'bubble--user' : 'bubble--bot', { 'bubble--err': m.error }]">
        <p v-if="m.role === 'assistant' && !m.error" class="bubble__text bubble__text--md" v-html="renderMarkdownLite(m.text)"></p>
        <p v-else class="bubble__text">{{ m.text }}</p>
        <div v-if="m.sources && m.sources.length > 0" class="bubble__sources">
          <span class="bubble__sources-label">出处</span>
          <NuxtLink v-for="s in m.sources" :key="s.caseId" :to="'/solutions/' + s.caseId" class="bubble__source">
            {{ s.title }}
          </NuxtLink>
        </div>
      </div>
    </div>

    <div v-if="props.thinking" class="row">
      <div class="row__avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" />
        </svg>
      </div>
      <div class="bubble bubble--bot bubble--typing">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        <span class="typing-label">检索案例库中…</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 6px 4px 18px;
  overflow-y: auto;
}
.list::-webkit-scrollbar {
  width: 6px;
}
.list::-webkit-scrollbar-thumb {
  background: var(--edge-cream);
  border-radius: 999px;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.row--user {
  justify-content: flex-end;
}
.row__avatar {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--lemon-soft);
  color: var(--coral);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 0 var(--edge-cream);
}
.row__avatar svg {
  margin-top: 1px;
}

/* ---- 气泡 ---- */
.bubble {
  max-width: 82%;
  padding: 11px 15px;
  font-size: 14.5px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}
.bubble--user {
  background: linear-gradient(135deg, var(--coral), #f97043);
  color: #fff;
  border-radius: 18px 18px 4px 18px;
  box-shadow: 0 4px 14px rgba(255, 122, 80, 0.25);
}
.bubble--bot {
  background: var(--card);
  color: var(--ink);
  border-radius: 4px 18px 18px 18px;
  box-shadow: 0 4px 0 var(--edge-cream);
}
.bubble--err {
  background: var(--red-soft);
  box-shadow: none;
  border: 1px solid #f3c8c8;
}
.bubble--err .bubble__text {
  color: #b04a3a;
}
.bubble__text {
  margin: 0;
}
.bubble__text--md {
  white-space: normal;
}
.bubble__text--md p {
  margin: 0 0 10px;
}
.bubble__text--md p:last-child {
  margin-bottom: 0;
}
.bubble__text--md ol,
.bubble__text--md ul {
  margin: 0 0 10px;
  padding-left: 22px;
}
.bubble__text--md li {
  margin: 3px 0;
}
.bubble__text--md code {
  background: var(--well);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.bubble__sources {
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed var(--line);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.bubble__sources-label {
  font-size: 12px;
  color: var(--ink3);
}
.bubble__source {
  font-size: 12.5px;
  color: var(--mint-deep);
  background: var(--mint-soft);
  text-decoration: none;
  border-radius: 999px;
  padding: 3px 12px;
  transition: filter 0.15s;
}
.bubble__source:hover {
  filter: brightness(0.95);
}

/* ---- 思考态 ---- */
.bubble--typing {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 14px 16px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--coral);
  opacity: 0.4;
  animation: dot-bounce 1.2s infinite ease-in-out;
}
.dot:nth-child(2) {
  animation-delay: 0.15s;
}
.dot:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes dot-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}
.typing-label {
  margin-left: 6px;
  font-size: 12.5px;
  color: var(--ink3);
}

/* ---- 空状态 ---- */
.empty {
  margin: auto;
  text-align: center;
  padding: 24px 12px;
}
.empty__star {
  width: 62px;
  height: 62px;
  margin: 0 auto 16px;
  border-radius: 20px;
  background: var(--lemon-soft);
  color: var(--coral);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 5px 0 var(--edge-cream);
}
.empty__hello {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--ink);
}
.empty__hello-sub {
  margin: 10px auto 0;
  max-width: 430px;
  color: var(--ink2);
  font-size: 13.5px;
  line-height: 1.9;
}
.empty__sugs {
  margin: 26px auto 0;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.empty__sug {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  background: var(--card);
  border: 1.5px solid var(--line);
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 14px;
  color: var(--ink);
  cursor: pointer;
  box-shadow: 0 3px 0 var(--edge-cream);
  transition: border-color 0.15s, transform 0.15s, color 0.15s;
}
.empty__sug:hover {
  border-color: var(--coral);
  color: var(--coral);
  transform: translateY(-1px);
}
.empty__sug:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.empty__sug-icon {
  flex: none;
  color: var(--coral);
}

@media (max-width: 560px) {
  .bubble {
    max-width: 88%;
  }
}
</style>
