<script setup lang="ts">
defineProps<{ rootCause: string; principles: string[] }>()
</script>

<template>
  <div class="rc">
    <div class="rc__card">
      <span class="rc__badge">根因</span>
      <p class="rc__text">{{ rootCause }}</p>
    </div>
    <div v-if="principles.length" class="rc__principles">
      <div class="rc__principles-title">层契约</div>
      <div v-for="(p, i) in principles" :key="i" class="rc__principle">{{ p }}</div>
    </div>
  </div>
</template>

<style scoped>
.rc__card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--coral-soft);
  border-left: 4px solid var(--coral);
  border-radius: 0 12px 12px 0;
  padding: 12px 14px;
  margin: 16px 0;
}
.rc__badge {
  flex-shrink: 0;
  display: inline-block;
  background: var(--coral);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
  padding: 3px 10px;
  margin-top: 2px;
}
.rc__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  font-weight: 600;
  color: var(--ink);
}
.rc__principles {
  margin: 14px 0;
}
.rc__principles-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink3);
  letter-spacing: 2px;
  margin-bottom: 8px;
}
.rc__principle {
  background: var(--sky-soft);
  color: #4A7FB5;
  border-left: 3px solid var(--sky);
  border-radius: 0 10px 10px 0;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 8px;
}
</style>
