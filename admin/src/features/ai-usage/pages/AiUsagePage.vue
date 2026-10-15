<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { NButton, NCard, NDataTable, NSelect } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { usageApi, type UsageDay, type UsageUser } from '../api/usage'

const message = useMessage()
const days = ref(30)
const daysOptions = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
]

const summary = ref<UsageDay[]>([])
const total = ref({ prompt_tokens: 0, completion_tokens: 0, cost: 0 })
const users = ref<UsageUser[]>([])
const loading = ref(true)

const maxTokens = computed(() => Math.max(1, ...summary.value.map((d) => d.prompt_tokens + d.completion_tokens)))

const userColumns: DataTableColumns<UsageUser> = [
  { title: '用户', key: 'login', render: (row) => row.login || row.uid },
  { title: '调用次数', key: 'calls', width: 100 },
  { title: '输入 tokens', key: 'prompt_tokens', width: 120 },
  { title: '输出 tokens', key: 'completion_tokens', width: 120 },
  {
    title: '估算成本（元）',
    key: 'cost',
    width: 130,
    render: (row) => row.cost.toFixed(4),
  },
]

async function load() {
  loading.value = true
  try {
    const [s, u] = await Promise.all([usageApi.summary(days.value), usageApi.topUsers(days.value)])
    summary.value = s.days
    total.value = s.total
    users.value = u.items
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="toolbar">
      <NSelect v-model:value="days" :options="daysOptions" size="small" style="width: 130px" @update:value="load" />
      <NButton size="small" quaternary @click="load">刷新</NButton>
    </div>

    <div class="stat-row">
      <div class="statbox">
        <div class="statbox__n">{{ total.cost.toFixed(4) }}</div>
        <div class="statbox__k">估算成本（元）</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ total.prompt_tokens.toLocaleString() }}</div>
        <div class="statbox__k">输入 tokens</div>
      </div>
      <div class="statbox">
        <div class="statbox__n">{{ total.completion_tokens.toLocaleString() }}</div>
        <div class="statbox__k">输出 tokens</div>
      </div>
    </div>

    <NCard size="small" title="按日用量" class="section">
      <p v-if="summary.length === 0 && !loading" class="empty">窗口内暂无 AI 调用。</p>
      <div v-for="d in summary" :key="d.day" class="barrow">
        <span class="barrow__label">{{ d.day }}</span>
        <div class="barrow__bar">
          <div class="barrow__fill" :style="{ width: ((d.prompt_tokens + d.completion_tokens) / maxTokens) * 100 + '%' }" />
        </div>
        <span class="barrow__meta">
          对话 {{ d.chats }} · 起草 {{ d.drafts }} · {{ (d.prompt_tokens + d.completion_tokens).toLocaleString() }} tk ·
          {{ d.cost.toFixed(4) }} 元<template v-if="d.avg_ms != null"> · 均耗 {{ d.avg_ms }}ms</template>
        </span>
      </div>
    </NCard>

    <NCard size="small" title="按用户 TOP 20" class="section">
      <NDataTable :columns="userColumns" :data="users" size="small" :bordered="false" />
      <p v-if="users.length === 0 && !loading" class="empty">窗口内暂无用户调用。</p>
    </NCard>

    <p class="hint">成本按 DeepSeek 单价估算（可用环境变量 DEEPSEEK_PRICE_IN/OUT 校准）；embed 调用为本地模型不计费。</p>
  </div>
</template>

<style scoped>
.section {
  margin-bottom: 16px;
}
.dayrow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
}
.dayrow__day {
  width: 88px;
  color: var(--ink2);
  flex-shrink: 0;
}
.dayrow__bar {
  flex: 1;
  height: 10px;
  background: var(--well);
  border-radius: 5px;
  overflow: hidden;
}
.dayrow__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--coral-deep), #a78bfa);
  border-radius: 5px;
}
.dayrow__meta {
  width: 330px;
  color: var(--ink3);
  flex-shrink: 0;
  text-align: right;
}
.empty {
  color: var(--ink3);
  text-align: center;
  padding: 20px 0;
}
.hint {
  font-size: 12px;
  color: var(--ink3);
  text-align: center;
}
</style>
