<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { NButton, NCard, NInput, NTag } from 'naive-ui'
import { docsApi, type DocInfo } from '../api/docs'

const message = useMessage()
const info = ref<DocInfo | null>(null)
const content = ref('')
const loading = ref(true)
const saving = ref(false)

const dirty = computed(() => info.value !== null && content.value !== info.value.content)

async function load() {
  loading.value = true
  try {
    const r = await docsApi.fetch()
    info.value = r
    content.value = r.content
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!content.value.trim()) {
    message.error('内容不能为空')
    return
  }
  saving.value = true
  try {
    await docsApi.save(content.value)
    message.success('已保存，App 端下次拉取隐私政策即生效')
    await load()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="toolbar">
      <span class="hint">
        App「关于好多星 → 隐私政策」与本页共用同一份文本；保存后客户端下次拉取即生效。
        格式：以「# 」开头的行渲染为标题、「## 」为小节、「- 」为条目，空行分段。
      </span>
      <span class="spacer" />
      <NButton size="small" type="primary" :loading="saving" :disabled="!dirty" @click="save">保存</NButton>
    </div>

    <NCard size="small" class="editor">
      <template #header>
        <div class="cardhead">
          隐私政策
          <NTag size="tiny" :type="info?.customized ? 'warning' : 'default'" :bordered="false">
            {{ info?.customized ? '已自定义' : '内置默认' }}
          </NTag>
          <span v-if="info?.updatedAt" class="meta">更新于 {{ info.updatedAt }} · {{ info.updatedBy }}</span>
        </div>
      </template>
      <NInput
        v-model:value="content"
        type="textarea"
        :autosize="{ minRows: 24, maxRows: 40 }"
        :loading="loading"
        placeholder="隐私政策全文…"
      />
    </NCard>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.hint {
  font-size: 12px;
  color: var(--ink3);
}

.spacer {
  flex: 1;
}

.cardhead {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta {
  font-size: 12px;
  font-weight: 400;
  color: var(--ink3);
}
</style>
