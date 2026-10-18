<script setup lang="ts">
const api = useApi()
const { data } = await useFetch<any>('/api/solutions?page=1&size=6', { baseURL: api.base })
const items = computed(() => data.value?.items ?? [])
</script>

<template>
  <div>
    <div class="card hero">
      <h1 style="margin: 0 0 8px">把你的真实故障，变成好多星的下一关</h1>
      <p class="muted" style="margin: 0 0 18px">
        投稿你踩过的坑（一句话症状 + 现象 + 最终解决逻辑），审核后会被加工成 App 里可破的案件，
        Web 端展示完整解决逻辑。
      </p>
      <NuxtLink to="/submit" class="btn">去投稿</NuxtLink>
      <NuxtLink to="/solutions" class="btn btn--ghost" style="margin-left: 12px">逛解决逻辑</NuxtLink>
    </div>

    <h2 style="font-size: 18px">最新解决逻辑</h2>
    <div v-for="a in items" :key="a.id" class="card">
      <NuxtLink :to="'/solutions/' + a.id" style="text-decoration: none">
        <div style="font-weight: 700; color: var(--ink); margin-bottom: 6px">{{ a.title }}</div>
      </NuxtLink>
      <span class="chip">{{ a.layer.slice(0, 20) }}</span>
      <span class="chip">作者 {{ a.author }}</span>
      <div style="margin-top: 10px">
        <NuxtLink :to="'/solutions/' + a.id" class="muted">查看解决步骤 →</NuxtLink>
      </div>
    </div>
    <p v-if="items.length === 0" class="muted">还没有内容——来投第一稿。</p>
  </div>
</template>
