<script setup lang="ts">
const route = useRoute()
const api = useApi()
const layer = ref<string>((route.query.layer as string) || '')
const page = ref(1)
const { data } = await useFetch<any>('/api/solutions', {
  baseURL: 'http://localhost:8000',
  query: { layer, page },
})
const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const layers = ['网络/接入', '数据/缓存', '构建/依赖', '运行时', '部署', '并发']
</script>

<template>
  <div>
    <h1 style="font-size: 22px">解决逻辑</h1>
    <p class="muted">每篇都是一次真实故障的最终解决过程（不含闯关——那在 App 里）。</p>
    <div style="margin: 14px 0">
      <span class="chip" :class="{ } " style="cursor: pointer" @click="layer = ''">全部</span>
      <span v-for="l in layers" :key="l" class="chip" style="cursor: pointer" @click="layer = l">{{ l }}</span>
    </div>
    <div v-for="a in items" :key="a.id" class="card">
      <NuxtLink :to="'/solutions/' + a.id" style="text-decoration: none">
        <div style="font-weight: 700; color: var(--ink); margin-bottom: 6px">{{ a.title }}</div>
      </NuxtLink>
      <span class="chip">{{ a.layer.slice(0, 20) }}</span>
      <span class="chip">作者 {{ a.author }}</span>
    </div>
    <p v-if="items.length === 0" class="muted">该层暂无内容。</p>
  </div>
</template>
