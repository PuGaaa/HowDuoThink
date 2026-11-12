<script setup lang="ts">
// 子目录组件沿用项目显式导入惯例（与 me.vue 的 SubmissionCard 一致）
import ProblemSection from '~/components/solutions/ProblemSection.vue'
import RootCauseCard from '~/components/solutions/RootCauseCard.vue'

const route = useRoute()
const api = useApi()
const { data: a } = await useFetch<any>('/api/solutions/' + route.params.id, { baseURL: api.base })
const caseId = String(route.params.id).replace(/^a-/, '')
const { data: contributors } = await useFetch<{ items: Array<{ author: string; role: string }> }>(
  '/api/submissions/contributors/' + caseId,
  { baseURL: api.base },
)
</script>

<template>
  <div v-if="a" class="detail">
    <article class="detail__main">
      <NuxtLink to="/solutions" class="muted detail__back">← 返回列表</NuxtLink>
      <h1 class="detail__title">{{ a.title }}</h1>

      <section v-if="a.problem" class="section">
        <h2 class="section__title">问题</h2>
        <ProblemSection :problem="a.problem" />
      </section>

      <section class="section">
        <h2 class="section__title">解决方案</h2>
        <div v-for="s in a.steps" :key="s.no" class="step">
          <span class="step__no">{{ s.no }}</span>
          <div style="margin-top: 8px">
            <div style="font-weight: 700; color: var(--ink)">观察：{{ s.observe }}</div>
            <div class="muted" style="margin-top: 4px">动作：{{ s.act }}</div>
            <div style="margin-top: 4px">发现：{{ s.found }}</div>
          </div>
        </div>
        <RootCauseCard v-if="a.root_cause" :root-cause="a.root_cause" :principles="a.principles" />
      </section>

      <section class="section">
        <h2 class="section__title">带走的经验</h2>
        <div v-for="l in a.lessons" :key="l" class="lesson">{{ l }}</div>
      </section>
    </article>

    <aside class="detail__side">
      <div class="card detail__meta">
        <div class="detail__chips">
          <span class="chip">{{ a.domain }}</span>
          <span class="chip">{{ a.layer }}</span>
        </div>
        <div class="detail__chips">
          <span class="chip">作者 {{ a.author }}</span>
          <span class="chip">{{ a.published_at?.slice(0, 10) }}</span>
        </div>
        <div v-if="contributors?.items?.length" class="contributors">
          <span class="muted">贡献者</span>
          <span v-for="person in contributors.items" :key="person.author + person.role" class="chip">
            {{ person.author }} · {{ person.role === 'source' ? '投稿来源' : '补证贡献' }}
          </span>
        </div>
      </div>
    </aside>
  </div>
  <p v-else class="muted">加载中……</p>
</template>

<style scoped>
/* 正文列 ≤760px + 右侧信息栏；≤900px 信息栏移到正文上方（grid-template-areas 换序） */
.detail {
  display: grid;
  grid-template-columns: minmax(0, 760px) minmax(260px, 1fr);
  grid-template-areas: 'main side';
  gap: 28px;
  align-items: start;
}
.detail__main {
  grid-area: main;
}
.detail__side {
  grid-area: side;
  position: sticky;
  top: 88px;
}
.detail__back {
  display: inline-block;
  text-decoration: none;
  margin-bottom: 12px;
}
.detail__title {
  font-size: 24px;
  margin: 0 0 16px;
  line-height: 1.4;
}
.detail__meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
}
.detail__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.detail__chips .chip {
  margin-right: 0;
  /* layer 等字段可能存长文案（列表页截断显示，详情页全量）：
     右栏固定宽，chip 必须允许任意断行才能不撑出卡片 */
  max-width: 100%;
  overflow-wrap: anywhere;
}
.contributors {
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.contributors .muted {
  display: block;
  margin-bottom: 6px;
}
.section { margin-top: 26px; }
.section__title {
  font-size: 17px;
  margin: 0 0 14px;
}
@media (max-width: 900px) {
  .detail {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'side' 'main';
    gap: 18px;
  }
  .detail__side {
    position: static;
  }
}
</style>
