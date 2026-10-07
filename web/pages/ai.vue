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

const { get, post } = useApi()

const messages = ref<ChatMessage[]>([])
const input = ref('')
const thinking = ref(false)
const listEl = ref<HTMLElement | null>(null)

function push(cls: ChatMessage) {
  messages.value.push(cls)
  nextTick(() => {
    listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' })
  })
}

async function send() {
  const q = input.value.trim()
  if (q.length < 2 || thinking.value) return
  input.value = ''
  push({ role: 'user', text: q })
  thinking.value = true
  push({ role: 'assistant', text: '…' })
  try {
    const r: any = await post('/api/ai/chat', { question: q })
    // 弹出的最后一条"…"替换为真实回答
    const last = messages.value[messages.value.length - 1]
    if (r.answer) {
      last.text = r.answer
      last.sources = r.sources ?? []
    } else {
      last.text = r.error ?? '服务暂时不可用，稍后再试'
      last.error = true
    }
  } catch (e: any) {
    const last = messages.value[messages.value - 0 - 1]
    last.text = '无法连接服务：' + (e?.message ?? '未知错误')
    last.error = true
  } finally {
    thinking.value = false
  }
}

function clearChat() {
  messages.value = []
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

useHead({ title: 'AI 排错 · 好多星社区' })
</script>

<template>
  <div class="ai">
    <div class="ai__head">
      <div>
        <h1 class="ai__title">AI 排错</h1>
        <p class="ai__sub">基于 132 个真实故障案例的回答——可能原因、排查步骤、出处引用</p>
      </div>
      <button v-if="messages.length > 0" class="ai__clear" @click="clearChat">清空对话</button>
    </div>

    <div ref="listEl" class="ai__list">
      <div v-if="messages.length === 0" class="ai__empty">
        <p>试着问一个真实故障问题，比如：</p>
        <ul>
          <li>连接池耗尽怎么排查？</li>
          <li>缓存和数据库不一致是什么原因？</li>
          <li>发布后部分用户还是旧版本，可能是什么？</li>
        </ul>
        <p class="ai__empty-note">回答基于案例库检索（可能原因 / 检查单步骤 / 出处），未覆盖的内容会明说。</p>
      </div>

      <div v-for="(m, i) in messages" :key="i" :class="'bubble bubble--' + m.role">
        <p :class="m.error ? 'bubble__text bubble__text--err' : 'bubble__text'">{{ m.text }}</p>
        <div v-if="m.sources && m.sources.length > 0" class="bubble__sources">
          <span class="bubble__sources-label">出处：</span>
          <NuxtLink v-for="s in m.sources" :key="s.caseId" :to="'/solutions/' + s.caseId" class="bubble__source">
            {{ s.title }}
          </NuxtLink>
        </div>
      </div>

      <div v-if="thinking" class="ai__thinking">正在检索案例库并组织回答…</div>
    </div>

    <div class="ai__inputrow">
      <input
        v-model="input"
        class="ai__input"
        :disabled="thinking"
        placeholder="描述你的故障现象…（Enter 发送）"
        maxlength="500"
        @keydown="onKeydown"
      />
      <button class="ai__send" :disabled="thinking || input.trim().length < 2" @click="send">发送</button>
    </div>
  </div>
</template>

<style scoped>
.ai {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 140px);
}
.ai__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 16px;
}
.ai__title {
  font-size: 26px;
  font-weight: 800;
  margin: 0;
}
.ai__sub {
  margin: 6px 0 0;
  color: #7a7290;
  font-size: 14px;
}
.ai__clear {
  border: 1px solid #d9d2e3;
  background: #fff;
  border-radius: 999px;
  padding: 6px 16px;
  font-size: 13px;
  color: #5a5273;
  cursor: pointer;
}
.ai__list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: #faf6f0;
  border-radius: 16px;
  overflow-y: auto;
  max-height: 62vh;
}
.ai__empty {
  color: #7a7290;
  font-size: 14px;
  line-height: 1.9;
  padding: 12px;
}
.ai__empty ul {
  margin: 8px 0;
  padding-left: 22px;
}
.ai__empty li {
  cursor: pointer;
}
.ai__empty li:hover {
  color: #ff7a50;
}
.ai__empty-note {
  color: #b3acc4;
  font-size: 13px;
}
.bubble {
  max-width: 85%;
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 14.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}
.bubble--user {
  align-self: flex-end;
  background: #ff7a50;
  color: #fff;
}
.bubble--assistant {
  align-self: flex-start;
  background: #fff;
  border: 1px solid #eee6dc;
}
.bubble__text--err {
  color: #b04a3a;
}
.bubble__sources {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #eee6dc;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.bubble__sources-label {
  font-size: 12px;
  color: #b3acc4;
}
.bubble__source {
  font-size: 13px;
  color: #ff7a50;
  text-decoration: none;
  border: 1px solid #ffd6c7;
  border-radius: 999px;
  padding: 2px 12px;
}
.bubble__source:hover {
  background: #fff3ed;
}
.ai__thinking {
  align-self: flex-start;
  color: #b3acc4;
  font-size: 13px;
  padding: 4px 8px;
}
.ai__inputrow {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.ai__input {
  flex: 1;
  border: 1px solid #d9d2e3;
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 15px;
  outline: none;
}
.ai__input:focus {
  border-color: #ff7a50;
}
.ai__send {
  background: #ff7a50;
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 12px 26px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.ai__send:disabled {
  background: #d9cfc2;
  cursor: not-allowed;
}
</style>
