<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { CaseRevision } from '../api/content'
defineProps<{items:CaseRevision[];readOnly:boolean}>()
const emit=defineEmits<{restore:[payload:Record<string,any>]}>()
</script>
<template>
  <section class="panel glass-panel">
    <h2>已发布修订历史</h2><p class="muted">历史快照保留原样；载入旧稿后发布会产生新的更高修订。</p>
    <p v-if="!items.length" class="muted">尚未正式发布。</p>
    <details v-for="item in items" :key="item.contentRevision" class="revision">
      <summary>内容修订 {{ item.contentRevision }} · {{ item.legacySnapshot ? '存量快照（旧操作者未知）' : item.publishedBy }} · {{ item.publishedAt }}</summary>
      <p class="muted">正文哈希 {{ item.contentHash }}</p><p v-if="item.sourceCommit" class="muted">来源 {{ item.sourceCommit }}</p>
      <NButton v-if="!readOnly" size="small" @click="emit('restore',item.payload)">载入此稿，准备新的修订</NButton>
      <pre>{{ JSON.stringify(item.payload,null,2) }}</pre>
    </details>
  </section>
</template>
<style scoped>
h2{font-size:16px;margin:0 0 16px}.muted{color:var(--ink3);font-size:12px;overflow-wrap:anywhere}.revision{border-top:1px solid var(--line);padding:14px 0}summary{cursor:pointer;font-size:13px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:400px;overflow:auto}
</style>
