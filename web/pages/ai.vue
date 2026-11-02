<script setup lang="ts">
interface ChatSource {
  caseId: string
  title: string
}
interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  sources?: ChatSource[]
  error?: boolean
}

const { post } = useApi()

const messages = ref<ChatMessage[]>([])
const input = ref('')
const thinking = ref(false)
const listEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)

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

function push(cls: ChatMessage) {
  messages.value.push(cls)
  scrollBottom()
}

async function send(preset?: string) {
  const q = (preset ?? input.value).trim()
  if (q.length < 2 || thinking.value) return
  input.value = ''
  resizeInput()
  push({ role: 'user', text: q })
  thinking.value = true
  scrollBottom()
  try {
    const r: any = await post('/api/ai/chat', { question: q })
    if (r.answer) {
      push({ role: 'assistant', text: r.answer, sources: r.sources ?? [] })
    } else {
      push({ role: 'assistant', text: r.error ?? '服务暂时不可用，稍后再试', error: true })
    }
  } catch (e: any) {
    push({ role: 'assistant', text: '无法连接服务：' + (e?.message ?? '未知错误'), error: true })
  } finally {
    thinking.value = false
  }
}

function clearChat() {
  messages.value = []
}

function resizeInput() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 132) + 'px'
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

onMounted(() => inputEl.value?.focus())

useHead({ title: 'AI 排错 · 好多星社区' })
</script>

<template>
  <div class="ai">
    <header class="ai__head">
      <div>
        <h1 class="ai__title">AI 排错</h1>
        <p class="ai__sub">基于 132 个真实故障案例 · 可能原因 / 排查步骤 / 出处引用</p>
      </div>
      <button v-if="messages.length > 0" class="ai__clear" @click="clearChat">清空对话</button>
    </header>

    <div ref="listEl" class="ai__list">
      <div v-if="messages.length === 0" class="ai__empty">
        <div class="ai__star" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" />
          </svg>
        </div>
        <h2 class="ai__hello">遇到的故障，讲给我听</h2>
        <p class="ai__hello-sub">回答来自案例库的真实检索结果——可能原因、检查步骤和出处都会给全；案例没覆盖的内容，我会明说。</p>
        <div class="ai__sugs">
          <button v-for="s in suggestions" :key="s" class="ai__sug" :disabled="thinking" @click="send(s)">
            <svg class="ai__sug-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z" fill="currentColor" opacity="0.85" />
              <path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor" opacity="0.45" />
            </svg>
            {{ s }}
          </button>
        </div>
      </div>

      <div v-for="(m, i) in messages" :key="i" :class="m.role === 'user' ? 'row row--user' : 'row'">
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

      <div v-if="thinking" class="row">
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

    <div class="ai__composer">
      <textarea
        ref="inputEl"
        v-model="input"
        rows="1"
        class="ai__input"
        :disabled="thinking"
        placeholder="描述你的故障现象…"
        maxlength="500"
        @keydown="onKeydown"
        @input="resizeInput"
      ></textarea>
      <button class="ai__send" :disabled="thinking || input.trim().length < 2" aria-label="发送" @click="send()">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
    <p class="ai__hint">Enter 发送 · Shift + Enter 换行 · 回答基于案例库检索，请以出处为准</p>
  </div>
</template>

<style scoped>
.ai {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 210px);
  min-height: 480px;
}
.ai__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 12px;
}
.ai__title {
  font-size: 25px;
  font-weight: 800;
  margin: 0;
}
.ai__sub {
  margin: 5px 0 0;
  color: var(--ink2);
  font-size: 13.5px;
}
.ai__clear {
  flex-shrink: 0;
  white-space: nowrap;
  border: 1.5px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 6px 16px;
  font-size: 13px;
  color: var(--ink2);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.ai__clear:hover {
  color: var(--coral);
  border-color: var(--coral);
}

/* ---- 消息区 ---- */
.ai__list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 6px 4px 18px;
  overflow-y: auto;
}
.ai__list::-webkit-scrollbar {
  width: 6px;
}
.ai__list::-webkit-scrollbar-thumb {
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
.ai__empty {
  margin: auto;
  text-align: center;
  padding: 24px 12px;
}
.ai__star {
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
.ai__hello {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--ink);
}
.ai__hello-sub {
  margin: 10px auto 0;
  max-width: 430px;
  color: var(--ink2);
  font-size: 13.5px;
  line-height: 1.9;
}
.ai__sugs {
  margin: 26px auto 0;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai__sug {
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
.ai__sug:hover {
  border-color: var(--coral);
  color: var(--coral);
  transform: translateY(-1px);
}
.ai__sug:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ai__sug-icon {
  flex: none;
  color: var(--coral);
}

/* ---- 输入区 ---- */
.ai__composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 14px;
  background: var(--card);
  border: 2px solid var(--line);
  border-radius: 18px;
  padding: 10px 10px 10px 18px;
  box-shadow: 0 5px 0 var(--edge-cream);
  transition: border-color 0.15s;
}
.ai__composer:focus-within {
  border-color: var(--coral);
}
.ai__input {
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
.ai__input::placeholder {
  color: var(--ink3);
}
.ai__input:disabled {
  opacity: 0.6;
}
.ai__send {
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
.ai__send:hover:not(:disabled) {
  filter: brightness(1.06);
}
.ai__send:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--coral-deep);
}
.ai__send:disabled {
  background: #ddd3c5;
  box-shadow: none;
  cursor: not-allowed;
}
.ai__hint {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--ink3);
}

@media (max-width: 560px) {
  .ai {
    height: calc(100vh - 180px);
  }
  .bubble {
    max-width: 88%;
  }
}
</style>
