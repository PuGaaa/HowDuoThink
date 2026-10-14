<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { NButton, NCard, NSelect, NTag } from 'naive-ui'
import { statsApi, type StatsOverview } from '../api/stats'

const message = useMessage()
const days = ref(30)
const daysOptions = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
]

const data = ref<StatsOverview | null>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    data.value = await statsApi.overview(days.value)
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

const maxActive = computed(() => Math.max(1, ...(data.value?.activeDaily ?? []).map((d) => d.active)))
const maxNew = computed(() => Math.max(1, ...(data.value?.newUsersDaily ?? []).map((d) => d.n)))
const subs = computed(() => data.value?.submissions)
const pct = (v: number | null | undefined) => (v == null ? '—' : (v * 100).toFixed(1) + '%')
</script>

<template>
  <div>
    <div class="toolbar">
      <NSelect v-model:value="days" :options="daysOptions" size="small" style="width: 130px" @update:value="load" />
      <NButton size="small" quaternary @click="load">刷新</NButton>
    </div>

    <div class="stats">
      <div class="statbox">
        <div class="statbox__n">{{ data?.dauToday ?? '—' }}</div>
        <div class="statbox__k">今日活跃（DAU）</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ data?.activeUsersTotal ?? '—' }}</div>
        <div class="statbox__k">窗口内活跃用户</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ data?.newUsers ?? '—' }}</div>
        <div class="statbox__k">新增用户</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ pct(subs?.acceptRate) }}</div>
        <div class="statbox__k">投稿采纳率</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ pct(data?.progress.completionRate) }}</div>
        <div class="statbox__k">完关率（有进度用户）</div>
      </div>
    </div>

    <div class="grid2">
      <NCard size="small" title="活跃趋势（去重人数 / 日）" class="section">
        <p v-if="(data?.activeDaily.length ?? 0) === 0 && !loading" class="empty">窗口内暂无活跃数据。</p>
        <div v-for="d in data?.activeDaily" :key="d.day" class="barrow">
          <span class="barrow__label">{{ d.day.slice(5) }}</span>
          <div class="barrow__bar">
            <div class="barrow__fill" :style="{ width: (d.active / maxActive) * 100 + '%' }" />
          </div>
          <span class="barrow__n">{{ d.active }}</span>
        </div>
      </NCard>

      <NCard size="small" title="新增用户" class="section">
        <p v-if="(data?.newUsersDaily.length ?? 0) === 0 && !loading" class="empty">窗口内暂无新增。</p>
        <div v-for="d in data?.newUsersDaily" :key="d.day" class="barrow">
          <span class="barrow__label">{{ d.day.slice(5) }}</span>
          <div class="barrow__bar">
            <div class="barrow__fill barrow__fill--green" :style="{ width: (d.n / maxNew) * 100 + '%' }" />
          </div>
          <span class="barrow__n">{{ d.n }}</span>
        </div>
      </NCard>
    </div>

    <NCard size="small" title="内容飞轮" class="section">
      <div class="flow" v-if="subs">
        <div class="flow__item">
          <div class="flow__n">{{ subs.pending }}</div>
          <div class="flow__k">待审投稿</div>
        </div>
        <span class="flow__arrow">→</span>
        <div class="flow__item">
          <div class="flow__n">{{ subs.accepted }}</div>
          <div class="flow__k">已采纳</div>
        </div>
        <span class="flow__arrow">→</span>
        <div class="flow__item">
          <div class="flow__n">{{ data?.publishedInWindow ?? '—' }}</div>
          <div class="flow__k">窗口内发布</div>
        </div>
        <span class="flow__arrow">→</span>
        <div class="flow__item">
          <div class="flow__n">{{ data?.publishedTotal ?? '—' }}</div>
          <div class="flow__k">已上线案例</div>
        </div>
        <span class="spacer" />
        <div class="flow__chips">
          <NTag size="small" type="warning" ghost>驳回 {{ subs.rejected }}</NTag>
          <NTag size="small" ghost>投稿总量 {{ subs.total }}</NTag>
          <NTag size="small" type="info" ghost>人均完成 {{ data?.progress.avgSolvedPerUser ?? '—' }} 关</NTag>
        </div>
      </div>
    </NCard>

    <p class="hint">活跃 = 登录或上传进度；完关率 = 有进度用户的 solved 总数 ÷（有进度用户数 × 已上线案例数），App 端进度结构对齐后可细分到章节。</p>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.stats {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.statbox {
  flex: 1;
  min-width: 150px;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  text-align: center;
}
.statbox__n {
  font-size: 24px;
  font-weight: 800;
  color: #e8604c;
}
.statbox__k {
  font-size: 12px;
  color: #9c96ad;
  margin-top: 2px;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.section {
  margin-bottom: 16px;
}
.barrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
}
.barrow__label {
  width: 44px;
  color: #6b6480;
  flex-shrink: 0;
}
.barrow__bar {
  flex: 1;
  height: 10px;
  background: #f0eef5;
  border-radius: 5px;
  overflow: hidden;
}
.barrow__fill {
  height: 100%;
  background: linear-gradient(90deg, #e8604c, #f2917f);
  border-radius: 5px;
}
.barrow__fill--green {
  background: linear-gradient(90deg, #2e7d5b, #5bb894);
}
.barrow__n {
  width: 30px;
  text-align: right;
  color: #9c96ad;
}
.flow {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.flow__item {
  text-align: center;
  min-width: 72px;
}
.flow__n {
  font-size: 20px;
  font-weight: 800;
  color: #4a4458;
}
.flow__k {
  font-size: 12px;
  color: #9c96ad;
}
.flow__arrow {
  color: #c5c0d0;
  font-size: 18px;
}
.flow__chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.spacer {
  flex: 1;
}
.empty {
  color: #9c96ad;
  text-align: center;
  padding: 20px 0;
}
.hint {
  font-size: 12px;
  color: #c5c0d0;
  text-align: center;
}
</style>
