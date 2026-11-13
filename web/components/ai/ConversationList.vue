<script setup lang="ts">
import type { ConversationSummary } from '~/composables/useAiChat'

/** 左栏会话列表：标题 + 相对时间，条目可点开回看、可删除；顶部「新对话」。
 * 纯展示组件：选择/删除/新建只上报事件，数据操作由页面层的 useAiChat 承担。 */
const props = defineProps<{
  items: ConversationSummary[]
  activeId: string | null
}>()
const emit = defineEmits<{
  select: [id: string]
  remove: [id: string]
  create: []
}>()

/** 服务端时间为 UTC 的 "YYYY-MM-DD HH:mm:ss"（SQLite datetime('now')），
 * 无时区标记时补 T 与 Z 再解析；展示只求粗粒度：刚刚/N 分钟前/N 小时前/昨天/日期。 */
function parseServerTime(s: string): number {
  const iso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z'
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

function relTime(iso: string): string {
  const t = parseServerTime(iso)
  if (!t) return ''
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} 小时前`
  if (hours < 48) return '昨天'
  const d = new Date(t)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const now = new Date()
  return d.getFullYear() === now.getFullYear() ? `${mm}-${dd}` : `${d.getFullYear()}-${mm}-${dd}`
}
</script>

<template>
  <div class="conv">
    <button class="conv__new" @click="emit('create')">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      新对话
    </button>
    <div class="conv__scroll">
      <p v-if="props.items.length === 0" class="conv__empty">还没有历史会话，提问后自动保存</p>
      <div
        v-for="c in props.items"
        :key="c.id"
        :class="['conv__item', { 'conv__item--active': c.id === props.activeId }]"
      >
        <button class="conv__main" :title="c.title" @click="emit('select', c.id)">
          <span class="conv__title">{{ c.title }}</span>
          <span class="conv__time">{{ relTime(c.updatedAt) }}</span>
        </button>
        <button class="conv__del" aria-label="删除会话" @click.stop="emit('remove', c.id)">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conv {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.conv__new {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: none;
  border: 1.5px solid var(--line);
  background: var(--well);
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 13.5px;
  font-weight: 700;
  /* 玻璃侧栏上的文字（任务 13）：--coral 仅 2.3:1，用任务 11 验证过的 --coral-ink（≥4.79:1） */
  color: var(--coral-ink);
  cursor: pointer;
  box-shadow: 0 3px 0 var(--edge-cream);
  transition: border-color 0.15s, transform 0.1s;
}
.conv__new:hover {
  border-color: var(--coral);
}
.conv__new:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--edge-cream);
}
.conv__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 12px;
  padding-right: 2px;
}
.conv__scroll::-webkit-scrollbar {
  width: 6px;
}
.conv__scroll::-webkit-scrollbar-thumb {
  background: var(--edge-cream);
  border-radius: 999px;
}
.conv__empty {
  margin: 18px 4px;
  font-size: 12.5px;
  color: var(--ink2); /* 玻璃底上 --ink3 仅 2.3:1，次级文字统一 --ink2（4.5:1） */
  text-align: center;
  line-height: 1.8;
}
.conv__item {
  display: flex;
  align-items: center;
  border-radius: 12px;
  margin-bottom: 4px;
  background: transparent;
  transition: background 0.15s;
}
.conv__item:hover {
  background: var(--well);
}
.conv__item--active {
  background: var(--coral-soft);
}
.conv__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: none;
  background: transparent;
  text-align: left;
  padding: 9px 6px 9px 10px;
  cursor: pointer;
}
.conv__title {
  width: 100%;
  font-size: 13.5px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.conv__item--active .conv__title {
  /* --coral-deep 在玻璃上 3.3:1 不达标，同任务 11 收紧到 --coral-ink */
  color: var(--coral-ink);
  font-weight: 700;
}
.conv__time {
  font-size: 11.5px;
  color: var(--ink2); /* 玻璃底可读性（任务 13） */
}
.conv__del {
  flex: none;
  width: 26px;
  height: 26px;
  margin-right: 4px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ink2); /* 玻璃底图形对比（非文本 3:1） */
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: color 0.15s, background 0.15s, opacity 0.15s;
}
.conv__item:hover .conv__del,
.conv__item--active .conv__del {
  opacity: 1;
}
.conv__del:hover {
  color: var(--red);
  background: var(--red-soft);
}
/* 触屏没有 hover：始终显示删除按钮 */
@media (hover: none) {
  .conv__del {
    opacity: 1;
  }
}
</style>
