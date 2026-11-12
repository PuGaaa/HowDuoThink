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
      <!-- 助手气泡走玻璃材质（任务 13）；错误气泡不上玻璃，保持既有错误态视觉 -->
      <div
        :class="[
          'bubble',
          m.role === 'user' ? 'bubble--user' : 'bubble--bot',
          { glass: m.role !== 'user' && !m.error, 'bubble--err': m.error },
        ]"
      >
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
      <div class="bubble bubble--bot bubble--typing glass">
        <!-- 液滴流动思考态（任务 13）：三滴交错相位沿轨道滑行并拉伸变形 -->
        <span class="flow" aria-hidden="true">
          <span class="flow__drop"></span>
          <span class="flow__drop"></span>
          <span class="flow__drop"></span>
        </span>
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
/* 助手气泡玻璃材质（任务 13）：背景/边框/阴影交给 .glass，阴影体系冲突以 .glass 为准；
 * 错误气泡不上 glass，其红底/红边在 .bubble--err 里保持原样 */
.bubble--bot {
  color: var(--ink);
  border-radius: 4px 18px 18px 18px;
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
  color: var(--ink2); /* 玻璃底可读性（任务 13） */
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

/* ---- 思考态：液滴流动（任务 13）---- */
.bubble--typing {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}
/* 三滴沿 64px 轨道左→右滑行，途中非均匀缩放模拟液滴拉伸/表面张力，
 * 交错 1/3 周期相位形成连续液流；只动画 transform/opacity（合成器路径），不动画 filter */
.flow {
  position: relative;
  flex: none;
  width: 64px;
  height: 12px;
}
.flow::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 4px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: rgba(224, 107, 56, 0.16);
}
.flow__drop {
  position: absolute;
  top: 50%;
  left: 0;
  width: 9px;
  height: 9px;
  margin-top: -4.5px;
  border-radius: 50%;
  /* --coral-deep 玻璃底 3.3:1，满足非文本图形 ≥3:1；--coral 仅 2.3:1 不用 */
  background: var(--coral-deep);
  opacity: 0;
  animation: droplet-flow 1.6s infinite cubic-bezier(0.45, 0.05, 0.55, 0.95);
}
.flow__drop:nth-child(2) {
  animation-delay: 0.53s;
}
.flow__drop:nth-child(3) {
  animation-delay: 1.06s;
}
@keyframes droplet-flow {
  0% { transform: translateX(0) scale(0.55, 0.55); opacity: 0; }
  12% { opacity: 1; }
  50% { transform: translateX(27.5px) scale(1.35, 0.75); opacity: 1; }
  88% { opacity: 1; }
  100% { transform: translateX(55px) scale(0.55, 0.55); opacity: 0; }
}
/* reduced-motion：液滴静止，等距停在轨道上（退化为静态点） */
@media (prefers-reduced-motion: reduce) {
  .flow__drop {
    animation: none;
    opacity: 1;
    transform: scale(0.8);
  }
  .flow__drop:nth-child(1) { transform: translateX(9px) scale(0.8); }
  .flow__drop:nth-child(2) { transform: translateX(23px) scale(0.8); }
  .flow__drop:nth-child(3) { transform: translateX(37px) scale(0.8); }
}
.typing-label {
  font-size: 12.5px;
  color: var(--ink2); /* 玻璃底可读性（任务 13） */
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
