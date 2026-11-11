<script setup lang="ts">
defineProps<{ problem: Record<string, any> }>()

// log / error / code 用等宽块呈现，text 走普通段落
const isMono = (type: string) => ['log', 'error', 'code'].includes(type)
</script>

<template>
  <div class="prob">
    <p class="prob__intro">{{ problem.intro }}</p>

    <div class="prob__scene">
      <div class="prob__scene-item">
        <span class="prob__label">角色</span>
        <p class="prob__scene-text">{{ problem.role }}</p>
      </div>
      <div class="prob__scene-item">
        <span class="prob__label">架构</span>
        <p class="prob__scene-text">{{ problem.architecture }}</p>
      </div>
    </div>

    <div class="prob__symptoms">
      <div class="prob__label">症状证据</div>
      <div v-for="(s, i) in problem.symptoms" :key="i" class="symptom">
        <span class="chip" :class="'tag-' + s.type">{{ s.title }}</span>
        <pre v-if="isMono(s.type)" class="symptom__pre">{{ s.text }}</pre>
        <p v-else class="symptom__text">{{ s.text }}</p>
      </div>
    </div>

    <div class="prob__meta">
      <div class="prob__meta-item">
        <span class="prob__label">时间线</span>
        <p class="prob__scene-text">{{ problem.timeline }}</p>
      </div>
      <div class="prob__impact">
        <span class="prob__label prob__label--impact">影响面</span>
        <p class="prob__impact-text">{{ problem.impactHint }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prob__intro {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink2);
}
.prob__scene,
.prob__meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}
.prob__scene-item,
.prob__meta-item {
  background: var(--well);
  border-radius: 12px;
  padding: 10px 12px;
}
.prob__label {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink3);
  margin-bottom: 4px;
}
.prob__scene-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink);
}
.prob__symptoms {
  margin-bottom: 14px;
}
.symptom {
  margin-top: 8px;
}
.symptom__pre {
  margin: 6px 0 0;
  padding: 10px 12px;
  background: var(--well);
  border-radius: 10px;
  font-family: 'SF Mono', Menlo, Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink2);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}
.symptom__text {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink);
}
.prob__impact {
  background: var(--coral-soft);
  border-radius: 12px;
  padding: 10px 12px;
}
.prob__label--impact {
  color: var(--coral-deep);
}
.prob__impact-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--coral-deep);
  font-weight: 600;
}
@media (max-width: 600px) {
  .prob__scene,
  .prob__meta {
    grid-template-columns: 1fr;
  }
}
</style>
