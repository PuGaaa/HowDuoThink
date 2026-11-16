<script setup lang="ts">
// components/<dir>/ 下的自动注册名带目录前缀（LayoutCardGrid），裸名解析不到——沿用项目显式导入惯例
import CardGrid from "~/components/layout/CardGrid.vue";

const route = useRoute();
const api = useApi();
/** 分类走 articles.domain（network/data/build/runtime/deploy/concurrency 六枚举）；
 * layer 字段存的是每案例一句的经验文案，只做展示不做过滤。 */
const domain = ref<string>((route.query.domain as string) || "");
/** 分页模型：useFetch 固定拉第 1 页（SSR/SEO + 切分类自动重拉）；
 * 触底后第 2+ 页经 $fetch 增量拉取追加进 extra，展示列表 = 首屏 + extra。
 * loadedPages 记已拉页数（不从 extra.length 反推：追加被去重裁剪时长度不再等于页容量）。 */
const { data, status } = await useFetch<any>("/api/solutions", {
  baseURL: api.base,
  query: { domain, page: 1 },
});
const extra = ref<any[]>([]);
const loadedPages = ref(1);
const items = computed(() => [...(data.value?.items ?? []), ...extra.value]);
const total = computed(() => data.value?.total ?? 0);
const hasMore = computed(() => items.value.length < total.value);

/** 触底加载：防重入 + 到底短路 + 切分类防串（请求前快照 domain，回来不一致即丢弃）
 * + 按 id 去重（首屏重拉与追加页在途重叠时不出现重复卡片）。 */
const loadingMore = ref(false);
const loadError = ref(false);
async function loadMore(): Promise<void> {
  // 首屏 refetch 在途（切分类瞬间）时不动：避免旧首屏与新第二页短暂混排
  if (loadingMore.value || status.value === "pending" || !hasMore.value) return;
  loadingMore.value = true;
  loadError.value = false;
  const snapshotDomain = domain.value;
  try {
    const r: any = await $fetch("/api/solutions", {
      baseURL: api.base,
      query: { domain: snapshotDomain, page: loadedPages.value + 1 },
    });
    if (domain.value !== snapshotDomain) return; // 分类已切走，响应作废
    const seen = new Set(items.value.map((i) => i.id));
    const fresh = (r.items ?? []).filter((i: any) => !seen.has(i.id));
    extra.value.push(...fresh);
    loadedPages.value += 1;
  } catch (e) {
    console.warn("[solutions] 加载更多失败", e);
    loadError.value = true; // 哨兵仍在，继续滚动即可重试
  } finally {
    loadingMore.value = false;
  }
}

/** 切分类：追加页与页码作废（首屏由 useFetch 对 domain 的响应式监听自动重拉） */
watch(domain, () => {
  extra.value = [];
  loadedPages.value = 1;
  loadError.value = false;
});

/** 触底哨兵：列表尾部的空 div 进入视口（含 160px 预读余量）即加载下一页；
 * 加载完成后若哨兵仍在视口内会继续触发，直到到底守卫短路。 */
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    },
    { rootMargin: "160px" },
  );
  if (sentinel.value) observer.observe(sentinel.value);
});
onBeforeUnmount(() => observer?.disconnect());

const domains = [
  { value: "network", label: "网络/接入" },
  { value: "data", label: "数据/缓存" },
  { value: "build", label: "构建/依赖" },
  { value: "runtime", label: "运行时" },
  { value: "deploy", label: "部署" },
  { value: "concurrency", label: "并发" },
];
</script>

<template>
  <div>
    <h1 class="page-title">解决逻辑</h1>
    <div class="filters">
      <span
        class="chip chip--btn"
        :class="{ 'chip--on': domain === '' }"
        @click="domain = ''"
        >全部</span
      >
      <span
        v-for="d in domains"
        :key="d.value"
        class="chip chip--btn"
        :class="{ 'chip--on': domain === d.value }"
        @click="domain = d.value"
        >{{ d.label }}</span
      >
    </div>
    <CardGrid v-if="items.length">
      <article v-for="a in items" :key="a.id" class="card solution-card">
        <NuxtLink :to="'/solutions/' + a.id" class="solution-card__title-link">
          <div class="solution-card__title">{{ a.title }}</div>
        </NuxtLink>
        <p v-if="a.problem?.intro" class="muted solution-card__intro">
          {{ a.problem.intro }}
        </p>
        <div class="solution-card__tags">
          <span class="chip">{{ a.layer.slice(0, 20) }}</span>
          <span class="chip">作者 {{ a.author }}</span>
        </div>
      </article>
    </CardGrid>
    <p v-if="items.length === 0" class="muted">该层暂无内容。</p>
    <template v-else>
      <div ref="sentinel" class="more-sentinel" aria-hidden="true"></div>
      <p v-if="loadingMore" class="muted more-status">加载中……</p>
      <p v-else-if="loadError" class="muted more-status">加载失败，滚动可重试</p>
      <p v-else-if="!hasMore" class="muted more-status">
        已显示全部 {{ total }} 条
      </p>
    </template>
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
.chip--btn {
  cursor: pointer;
}
.chip--on {
  /* 激活态：浅珊瑚底 + coral-ink 文字（coral-deep 在浅底上仅 ~2.8:1，不达 4.5:1）；
   * 描边用 inset shadow，不加 border 触发 chip 尺寸跳动 */
  background: var(--coral-soft);
  color: var(--coral-ink);
  box-shadow: inset 0 0 0 1.5px var(--coral);
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
.more-sentinel {
  height: 1px;
}
.more-status {
  text-align: center;
  padding: 4px 0 18px;
}
</style>
