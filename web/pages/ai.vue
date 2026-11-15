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
    <!-- 「会话」触发器：≥900px 侧栏常驻隐藏；<900px 侧栏为抽屉，左上浮动按钮开合 -->
    <button class="ai__sessions" aria-label="打开会话列表" @click="drawerOpen = true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    </button>

    <div v-if="!loaded" class="ai__loading muted">加载中……</div>
    <div v-else-if="!user" class="card ai__gate">
      <p class="ai__gate-title">登录后开始提问</p>
      <p class="ai__gate-sub">与 AI 排错助手多轮对话，历史会话自动保存，随时回看。</p>
      <button class="btn" @click="openLogin">去登录</button>
    </div>

    <div v-else class="ai__layout">
      <div v-if="drawerOpen" class="ai__mask" @click="drawerOpen = false"></div>
      <aside :class="['ai__side', 'glass', { 'ai__side--open': drawerOpen }]">
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
        <div class="composer-col">
          <ChatComposer v-model="draft" :thinking="thinking" @send="onSend" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 全屏化布局：.ai 撑满 .main（其高度由本页非 scoped :has 规则钉死为视口余量），
 * 页面级 chrome 只剩全站顶栏——页头/页脚/壳层内边距全部退场 */
.ai {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.ai__sessions {
  display: none;
}
.ai__loading {
  padding: 40px 0;
  text-align: center;
}

/* ---- 登录引导 ---- */
.ai__gate {
  margin: auto;
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

/* ---- 双栏编排：侧栏贴左全高，聊天区撑满余量；内容列（消息/输入框）居中限宽 ---- */
.ai__layout {
  flex: 1;
  min-height: 0;
  display: flex;
}
/* 侧栏玻璃材质：背景/边框/阴影交给全局 .glass（glass.css）；
 * 贴左全高直角面板（GPT 侧栏同构）。滚动容器上移进顶栏区（margin 负值技巧），
 * 列表文字滚过 0~69px 时透过顶栏磨砂可见，而不是被容器边缘硬裁；
 * 「新对话」按钮 sticky 钉在顶栏下缘（ConversationList 内） */
.ai__side {
  flex: none;
  width: 260px;
  min-height: 0;
  border-radius: 0;
  padding: 0 12px;
  /* 贴边面板不要 .glass 的悬浮外阴影（0 24px 64px）——直角贴边形态下投影只会糊在内容区上；
   * 仅保留玻璃底与 blur。<900px 抽屉态的方向性投影另在媒体块保留（浮层层级需要） */
  box-shadow: none;
}
.ai__chat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* 顶部让位由 .list 的负 margin + padding 承担（滚动容器顶到视口顶，内容穿顶栏磨砂）；
   * 右侧 padding 收窄到 8px：滚动条贴窗口右缘；内容列本身居中，与滚动条天然有距离 */
  padding: 0 8px 0 20px;
}
.composer-col {
  flex: none;
  max-width: 52rem;
  width: 100%;
  margin: 14px auto 14px;
}

@media (max-width: 899px) {
  /* 抽屉触发器：<900px 侧栏收进抽屉，左上浮动钮开合（桌面侧栏常驻不显示）；
   * z-index 低于抽屉遮罩(40)：抽屉开着时点遮罩关闭，按钮不截胡 */
  .ai__sessions {
    display: inline-flex;
    position: fixed;
    top: 82px;
    left: 14px;
    z-index: 30;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1.5px solid var(--line);
    background: var(--card);
    border-radius: 10px;
    color: var(--ink2);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .ai__sessions:hover {
    color: var(--coral);
    border-color: var(--coral);
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
    /* 抽屉推开时的方向性投影 + 玻璃内高光（覆盖 .glass 外阴影，内高光保留材质感） */
    box-shadow: 8px 0 24px rgba(74, 68, 88, 0.18), var(--glass-inset);
  }
  .ai__chat {
    /* 移动端顶栏同样悬浮：消息区避开 69px 顶垫，滚过时被磨砂透出 */
    padding: 69px 16px 0 14px;
  }
}
</style>

<!-- 非 scoped：/ai 全屏化需穿透壳层（.shell/.main/.footer 不带本页 data-v 属性）。
     69px 为顶栏实高（顶栏高度变化时同步所有出现处）。内容上移 69px 钻到顶栏底下：
     顶栏是 backdrop-filter 磨砂玻璃，列表/消息滚过时被模糊透出（ChatGPT 同款），
     故 shell 从视口顶开始占满 100dvh，顶栏悬浮其上。 -->
<style>
.shell:has(.ai) {
  max-width: none;
  padding: 0;
  margin-top: -69px;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}
.shell:has(.ai) .main {
  padding: 0;
  flex: 1;
  min-height: 0;
}
.shell:has(.ai) .footer {
  display: none;
}
/* AI 页顶栏更透（全局 0.58 太实，透出感弱）：本页内容穿过顶栏的磨砂阅读感是布局的一部分，
   兄弟 :has 仅命中 AI 页，不影响其他页面的顶栏 */
.topbar--full:has(~ .shell .ai) {
  background: rgba(255, 255, 255, 0.32);
}
</style>
