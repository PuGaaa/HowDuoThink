<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { NButton, NCard, NInputNumber, NSelect, NTag } from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import { settingsApi, type SettingItem } from '../api/settings'

const message = useMessage()
const items = ref<SettingItem[]>([])
const edit = reactive<Record<string, number | string>>({})
const saving = ref(false)

const GROUPS = [
  { key: 'gate', title: '运营门禁', desc: '游客留存门禁：未登录可试玩的章与关数，保存后 App 下次拉取配置即生效' },
  { key: 'ai', title: 'AI', desc: '对话限流与成本单价（AI 用量看板按此估算成本），保存后即时生效' },
  { key: 'security', title: '安全频控', desc: '短信验证码与登录防爆破阈值，保存后即时生效' },
  { key: 'assets', title: '资源', desc: '素材 CDN 前缀与远程素材开关：随 app-config 下发，App 端远程加载失败自动回退内置资源' },
] as const

// 游客免费章候选：学徒篇四章（游客试玩只应落在新手章）
const CHAPTER_OPTIONS: (SelectOption & { value: string })[] = [
  { label: '读懂报错', value: 'error-reading' },
  { label: '接入层之夜', value: 'access' },
  { label: '构建与依赖', value: 'build' },
  { label: '联调之夜', value: 'integration' },
]

const SOURCE_TAG: Record<SettingItem['source'], { text: string; type: 'warning' | 'info' | 'default' }> = {
  db: { text: '已自定义', type: 'warning' },
  env: { text: '环境变量', type: 'info' },
  default: { text: '内置默认', type: 'default' },
}

function groupItems(group: string): SettingItem[] {
  return items.value.filter((i) => i.group === group)
}

function toNumber(v: number | string): number {
  return typeof v === 'number' ? v : Number(v) || 0
}

async function load() {
  try {
    const r = await settingsApi.fetch()
    items.value = r.items
    for (const i of r.items) {
      edit[i.key] = i.key === 'guest_gate.chapter_id' ? String(i.value) : toNumber(i.value)
    }
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  }
}

onMounted(load)

const dirty = computed(() => items.value.some((i) => String(edit[i.key]) !== String(i.value)))

async function save() {
  saving.value = true
  try {
    const values: Record<string, number | string> = {}
    for (const i of items.value) values[i.key] = edit[i.key]
    await settingsApi.save(values)
    message.success('已保存，配置即时生效')
    await load()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div class="toolbar">
      <span class="hint">改动即时生效，无需重启；环境变量仍作未自定义时的部署默认值。</span>
      <span class="spacer" />
      <NButton size="small" type="primary" :loading="saving" :disabled="!dirty" @click="save">保存全部</NButton>
    </div>

    <NCard v-for="g in GROUPS" :key="g.key" size="small" :title="g.title" class="group">
      <template #header-extra>
        <span class="group-desc">{{ g.desc }}</span>
      </template>
      <div v-for="item in groupItems(g.key)" :key="item.key" class="row">
        <div class="row__meta">
          <div class="row__label">
            {{ item.label }}
            <NTag size="tiny" :type="SOURCE_TAG[item.source].type" :bordered="false">
              {{ SOURCE_TAG[item.source].text }}
            </NTag>
          </div>
          <div class="row__hint">{{ item.key }}<template v-if="item.unit"> · {{ item.unit }}</template>
            <template v-if="item.min != null || item.max != null">
              · 允许 {{ item.min ?? '−∞' }} ~ {{ item.max ?? '∞' }}
            </template>
          </div>
        </div>
        <div class="row__ctl">
          <NSelect
            v-if="item.key === 'guest_gate.chapter_id'"
            v-model:value="(edit[item.key] as string)"
            :options="CHAPTER_OPTIONS"
            size="small"
            style="width: 180px"
          />
          <NInputNumber
            v-else
            v-model:value="(edit[item.key] as number)"
            size="small"
            style="width: 160px"
            :min="item.min ?? undefined"
            :max="item.max ?? undefined"
          />
        </div>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.hint {
  color: var(--ink3);
  font-size: 13px;
}
.group {
  margin-top: 14px;
}
.group-desc {
  font-size: 12px;
  color: var(--ink3);
  font-weight: 400;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--line, #eee);
}
.row:last-child {
  border-bottom: none;
}
.row__label {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.row__hint {
  font-size: 12px;
  color: var(--ink3);
  margin-top: 2px;
}
</style>
