<script setup lang="ts">
// components/<dir>/ 下的自动注册名带目录前缀（LayoutCardGrid），裸名解析不到——沿用项目显式导入惯例
import CardGrid from '~/components/layout/CardGrid.vue'

const api = useApi()
const { data } = await useFetch<any>('/api/solutions?page=1&size=6', { baseURL: api.base })
const items = computed(() => data.value?.items ?? [])
</script>

<template>
  <div>
    <div class="card hero">
      <h1 class="hero__title">把你的真实故障，变成好多星的下一关</h1>
      <p class="muted hero__intro">
        投稿你踩过的坑（一句话症状 + 现象 + 最终解决逻辑），审核后会被加工成 App 里可破的案件，
        Web 端展示完整解决逻辑。
      </p>
      <div class="hero__actions">
        <NuxtLink to="/submit" class="btn">去投稿</NuxtLink>
        <NuxtLink to="/solutions" class="btn btn--ghost">逛解决逻辑</NuxtLink>
      </div>
    </div>

    <h2 class="section-title">最新解决逻辑</h2>
    <CardGrid v-if="items.length">
      <article v-for="a in items" :key="a.id" class="card solution-card">
        <NuxtLink :to="'/solutions/' + a.id" class="solution-card__title-link">
          <div class="solution-card__title">{{ a.title }}</div>
        </NuxtLink>
        <span class="chip">{{ a.layer.slice(0, 20) }}</span>
        <span class="chip">作者 {{ a.author }}</span>
        <div class="solution-card__more">
          <NuxtLink :to="'/solutions/' + a.id" class="muted">查看解决步骤 →</NuxtLink>
        </div>
      </article>
    </CardGrid>
    <p v-if="items.length === 0" class="muted">还没有内容——来投第一稿。</p>
  </div>
</template>

<style scoped>
.hero {
  padding: 34px 32px;
}
.hero__title {
  margin: 0 0 8px;
  font-size: 26px;
  line-height: 1.4;
}
.hero__intro {
  margin: 0 0 18px;
  line-height: 1.7;
  max-width: 720px;
}
.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.section-title {
  font-size: 18px;
  margin: 26px 0 14px;
}
.solution-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
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
.solution-card__more {
  margin-top: auto;
  padding-top: 12px;
}
</style>
