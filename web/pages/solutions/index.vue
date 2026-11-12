<script setup lang="ts">
// components/<dir>/ 下的自动注册名带目录前缀（LayoutCardGrid），裸名解析不到——沿用项目显式导入惯例
import CardGrid from '~/components/layout/CardGrid.vue'

const route = useRoute()
const api = useApi()
const layer = ref<string>((route.query.layer as string) || '')
const page = ref(1)
const { data } = await useFetch<any>('/api/solutions', {
  baseURL: api.base,
  query: { layer, page },
})
const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const layers = ['网络/接入', '数据/缓存', '构建/依赖', '运行时', '部署', '并发']
</script>

<template>
  <div>
    <h1 class="page-title">解决逻辑</h1>
    <p class="muted page-intro">每篇都是一次真实故障的最终解决过程（不含闯关——那在 App 里）。</p>
    <div class="filters">
      <span class="chip" :class="{ } " style="cursor: pointer" @click="layer = ''">全部</span>
      <span v-for="l in layers" :key="l" class="chip" style="cursor: pointer" @click="layer = l">{{ l }}</span>
    </div>
    <CardGrid v-if="items.length">
      <article v-for="a in items" :key="a.id" class="card solution-card">
        <NuxtLink :to="'/solutions/' + a.id" class="solution-card__title-link">
          <div class="solution-card__title">{{ a.title }}</div>
        </NuxtLink>
        <p v-if="a.problem?.intro" class="muted solution-card__intro">{{ a.problem.intro }}</p>
        <div class="solution-card__tags">
          <span class="chip">{{ a.layer.slice(0, 20) }}</span>
          <span class="chip">作者 {{ a.author }}</span>
        </div>
      </article>
    </CardGrid>
    <p v-if="items.length === 0" class="muted">该层暂无内容。</p>
  </div>
</template>

<style scoped>
.page-title {
  font-size: 22px;
  margin: 0 0 6px;
}
.page-intro {
  margin: 0;
}
.filters {
  margin: 14px 0 18px;
}
.filters .chip {
  margin-bottom: 6px;
}
.solution-card {
  display: flex;
  flex-direction: column;
}
.solution-card__title-link {
  text-decoration: none;
}
.solution-card__title {
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 6px;
  line-height: 1.5;
}
.solution-card__title-link:hover .solution-card__title {
  color: var(--coral-deep);
}
.solution-card__intro {
  margin: 0 0 8px;
  line-height: 1.6;
}
.solution-card__tags {
  margin-top: auto;
  padding-top: 10px;
}
</style>
