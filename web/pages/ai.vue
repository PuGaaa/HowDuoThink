<script setup lang="ts">
import ConversationList from '~/components/ai/ConversationList.vue'
import ChatMessages from '~/components/ai/ChatMessages.vue'
import ChatComposer from '~/components/ai/ChatComposer.vue'

/** AI 排错页：双栏会话编排。左栏会话列表（服务端持久化），右栏对话区；
 * <900px 左栏收进抽屉，顶栏「会话」按钮开合。气泡/出处/空态视觉在子组件内沿用原版。
 * 登录门禁：未登录只渲染引导面板并弹登录弹窗，绝不请求会话列表（与 /me 页同一模式）。 */
const { user, ensure } = useCurrentUser()
const { open: openLogin } = useLoginPrompt()
const {
  messages,
  thinking,
  conversationId,
  conversations,
  send,
  loadConversations,
  openConversation,
  removeConversation,
  newConversation,
} = useAiChat()

const loaded = ref(false)
const drawerOpen = ref(false)
const draft = ref('')

// 登录态就绪即拉会话列表：以用户 id 为触发键（与 /me 页一致），
// 未登录时本 watch 不触发，列表请求一次都不会发出
watch(
  () => user.value?.id,
  (id) => {
    if (!id) return
    loaded.value = true
    void loadConversations()
  },
  { immediate: true },
)

onMounted(async () => {
  await ensure()
  // 未登录（或权威资料拉取失败）：停止加载态，展示登录引导面板
  if (!user.value) loaded.value = true
})

function onSend() {
  const q = draft.value
  draft.value = ''
  void send(q)
}

function onSuggest(s: string) {
  void send(s)
}

function onSelect(id: string) {
  drawerOpen.value = false
  void openConversation(id)
}

function onRemove(id: string) {
  void removeConversation(id)
}

function onCreate() {
  drawerOpen.value = false
  newConversation()
}

useHead({ title: 'AI 排错 · 好多星社区' })
</script>

<template>
  <div class="ai">
    <header class="ai__head">
      <div>
        <h1 class="ai__title">AI 排错</h1>
        <p class="ai__sub">基于 132 个真实故障案例 · 可能原因 / 排查步骤 / 出处引用</p>
      </div>
      <button class="ai__sessions" @click="drawerOpen = true">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        会话
      </button>
    </header>

    <div v-if="!loaded" class="ai__loading muted">加载中……</div>
    <div v-else-if="!user" class="card ai__gate">
      <p class="ai__gate-title">登录后开始提问</p>
      <p class="ai__gate-sub">与 AI 排错助手多轮对话，历史会话自动保存，随时回看。</p>
      <button class="btn" @click="openLogin">去登录</button>
    </div>

    <div v-else class="ai__layout">
      <div v-if="drawerOpen" class="ai__mask" @click="drawerOpen = false"></div>
      <aside :class="['ai__side', { 'ai__side--open': drawerOpen }]">
        <ConversationList
          :items="conversations"
          :active-id="conversationId"
          @select="onSelect"
          @remove="onRemove"
          @create="onCreate"
        />
      </aside>
      <section class="ai__chat">
        <ChatMessages :messages="messages" :thinking="thinking" @suggest="onSuggest" />
        <ChatComposer v-model="draft" :thinking="thinking" @send="onSend" />
      </section>
    </div>
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
.ai__sessions {
  display: none;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
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
.ai__sessions:hover {
  color: var(--coral);
  border-color: var(--coral);
}
.ai__loading {
  padding: 40px 0;
  text-align: center;
}

/* ---- 登录引导 ---- */
.ai__gate {
  text-align: center;
  padding: 40px 20px;
}
.ai__gate-title {
  margin: 0;
  font-size: 19px;
  font-weight: 800;
}
.ai__gate-sub {
  margin: 10px auto 20px;
  max-width: 360px;
  color: var(--ink2);
  font-size: 13.5px;
  line-height: 1.9;
}

/* ---- 双栏编排 ---- */
.ai__layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}
.ai__side {
  flex: none;
  width: 260px;
  min-height: 0;
  background: var(--card);
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 5px 0 var(--edge-cream);
}
.ai__chat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

@media (max-width: 899px) {
  .ai__sessions {
    display: inline-flex;
  }
  .ai__mask {
    position: fixed;
    inset: 0;
    background: rgba(74, 68, 88, 0.4);
    z-index: 40;
  }
  .ai__side {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: 280px;
    max-width: 84vw;
    z-index: 50;
    border-radius: 0 16px 16px 0;
    padding: 16px 12px;
    overflow-y: auto;
    transform: translateX(-105%);
    transition: transform 0.2s ease;
  }
  .ai__side--open {
    transform: translateX(0);
    box-shadow: 8px 0 24px rgba(74, 68, 88, 0.18);
  }
}
@media (max-width: 560px) {
  .ai {
    height: calc(100vh - 180px);
  }
}
</style>
