<script setup lang="ts">
const route = useRoute()
const api = useApi()
const { data: a } = await useFetch<any>('/api/solutions/' + route.params.id, { baseURL: api.base })
</script>

<template>
  <div v-if="a">
    <NuxtLink to="/solutions" class="muted">← 返回列表</NuxtLink>
    <h1 style="font-size: 24px">{{ a.title }}</h1>
    <span class="chip">{{ a.layer }}</span>
    <span class="chip">作者 {{ a.author }}</span>
    <span class="chip">{{ a.published_at?.slice(0, 10) }}</span>

    <h2 style="font-size: 17px; margin-top: 26px">解决步骤</h2>
    <div v-for="s in a.steps" :key="s.no" class="step">
      <span class="step__no">{{ s.no }}</span>
      <div style="margin-top: 8px">
        <div style="font-weight: 700; color: var(--ink)">观察：{{ s.observe }}</div>
        <div class="muted" style="margin-top: 4px">动作：{{ s.act }}</div>
        <div style="margin-top: 4px">发现：{{ s.found }}</div>
      </div>
    </div>

    <h2 style="font-size: 17px; margin-top: 26px">带走的经验</h2>
    <div v-for="l in a.lessons" :key="l" class="lesson">{{ l }}</div>
  </div>
  <p v-else class="muted">加载中……</p>
</template>
