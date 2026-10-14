<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { NButton, NCard, NTag } from 'naive-ui'
import { opsApi, type OpsHealth } from '../api/ops'

const message = useMessage()
const data = ref<OpsHealth | null>(null)
const loading = ref(true)
let timer: number | undefined

async function load() {
  try {
    data.value = await opsApi.health()
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  timer = window.setInterval(load, 30_000)
})
onUnmounted(() => window.clearInterval(timer))

const recentReversed = computed(() => [...(data.value?.recent ?? [])].reverse())
const maxReq = computed(() => Math.max(1, ...recentReversed.value.map((r) => r.requests)))
const refresh = () => load()
</script>

<template>
  <div>
    <div class="toolbar">
      <span class="auto">每 30 秒自动刷新</span>
      <span class="spacer" />
      <NButton size="small" quaternary @click="refresh">刷新</NButton>
    </div>

    <div class="stats">
      <div class="statbox">
        <div class="statbox__dot" :class="data?.db.ok ? 'ok' : 'bad'" />
        <div class="statbox__k">数据库（{{ data?.db.provider }}）</div>
        <div class="statbox__s">casepack v{{ data?.db.casepackVersion ?? '—' }}</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ data ? (data.process.rssMb / 1024).toFixed(2) : '—' }}</div>
        <div class="statbox__k">进程内存（GB，峰值 RSS）</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ data ? (data.diskFreeMb / 1024).toFixed(1) : '—' }}</div>
        <div class="statbox__k">磁盘可用（GB）</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ data?.process.uptimeMin ?? '—' }}</div>
        <div class="statbox__k">运行时长（分钟）</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ data?.process.avgMs ?? '—' }}</div>
        <div class="statbox__k">本次窗口均耗（ms）</div>
      </div>
    </div>

    <NCard size="small" title="近期快照（每 5 分钟一格）" class="section">
      <p v-if="recentReversed.length === 0 && !loading" class="empty">
        暂无快照——服务启动后第一个快照周期（5 分钟）后出现。
      </p>
      <div v-for="r in recentReversed" :key="r.ts" class="barrow">
        <span class="barrow__label">{{ r.ts.slice(11, 16) }}</span>
        <div class="barrow__bar">
          <div class="barrow__fill" :style="{ width: (r.requests / maxReq) * 100 + '%' }" />
        </div>
        <span class="barrow__meta">
          {{ r.requests }} 请求<template v-if="r.errors"> · <b class="err">{{ r.errors }} 错误</b></template>
          · {{ r.rssMb }}MB
        </span>
      </div>
    </NCard>

    <NCard size="small" title="外部集成" class="section">
      <div class="chips">
        <NTag :type="data?.integrations.sentry ? 'success' : 'default'" size="small">
          Sentry 错误追踪：{{ data?.integrations.sentry ? '已启用' : '未配置（SENTRY_DSN）' }}
        </NTag>
        <NTag size="small" ghost>外部拨测：UptimeRobot 监控 /api/health（部署文档有接入步骤）</NTag>
        <NTag size="small" ghost>快照间隔 {{ data?.integrations.snapshotIntervalSec ?? '—' }}s</NTag>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
}
.auto {
  color: #9c96ad;
  font-size: 12px;
}
.spacer {
  flex: 1;
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
.statbox__dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  margin: 2px auto 6px;
}
.statbox__dot.ok {
  background: #2e7d5b;
}
.statbox__dot.bad {
  background: #d6455d;
}
.statbox__n {
  font-size: 22px;
  font-weight: 800;
  color: #4a4458;
}
.statbox__k {
  font-size: 12px;
  color: #9c96ad;
  margin-top: 2px;
}
.statbox__s {
  font-size: 11px;
  color: #c5c0d0;
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
  width: 40px;
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
  background: linear-gradient(90deg, #4a6fd6, #7fa1ec);
  border-radius: 5px;
}
.barrow__meta {
  width: 260px;
  text-align: right;
  color: #9c96ad;
  flex-shrink: 0;
}
.err {
  color: #d6455d;
}
.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.empty {
  color: #9c96ad;
  text-align: center;
  padding: 20px 0;
}
</style>
