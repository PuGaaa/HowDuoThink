<script setup lang="ts">
import type { SubmissionMaterial } from './types'
defineProps<{ material: SubmissionMaterial }>()
const domains: Record<string, string> = {
  network: '网络/接入', data: '数据/缓存', build: '构建/依赖',
  runtime: '运行时', deploy: '部署', concurrency: '并发',
}
</script>

<template>
  <dl class="material">
    <dt>标题</dt><dd>{{ material.title }}</dd>
    <dt>现象描述</dt><dd>{{ material.symptom }}</dd>
    <dt>解决逻辑</dt><dd>{{ material.resolution }}</dd>
    <template v-if="material.keyError"><dt>关键报错</dt><dd>{{ material.keyError }}</dd></template>
    <template v-if="material.timeline"><dt>时间线</dt><dd>{{ material.timeline }}</dd></template>
    <template v-if="material.lessons.length"><dt>经验教训</dt><dd><ul><li v-for="lesson in material.lessons" :key="lesson">{{ lesson }}</li></ul></dd></template>
    <template v-if="material.stackTags.length"><dt>技术栈</dt><dd>{{ material.stackTags.join('、') }}</dd></template>
    <dt>所属层</dt><dd>{{ domains[material.domainHint] }}</dd>
  </dl>
</template>

<style scoped>
.material { margin: 14px 0; padding: 16px; border-radius: 12px; background: var(--well); }
dt { margin-top: 12px; font-size: 12px; font-weight: 700; color: var(--ink2); }
dt:first-child { margin-top: 0; }
dd { margin: 5px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.65; }
ul { margin: 0; padding-left: 20px; }
</style>
