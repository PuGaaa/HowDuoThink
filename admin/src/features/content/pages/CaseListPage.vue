<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { NButton, NCard, NTag } from 'naive-ui'
import { contentApi, type CaseRow } from '../api/content'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const cases = ref<CaseRow[]>([])
const loading = ref(true)
const filter = ref<'all' | 'draft' | 'published'>('all')
const reindexing = ref(false)

const shown = computed(() =>
  filter.value === 'all' ? cases.value : cases.value.filter((c) => c.status === filter.value),
)

onMounted(load)

async function load() {
  loading.value = true
  try {
    const list = await contentApi.cases()
    // 并发补齐 payload 里的元数据（part/chapterId/typeTags），避免逐个串行等待
    await Promise.all(
      list.map(async (c) => {
        try {
          const d = await contentApi.caseDetail(c.id)
          c.part = d.payload?.part || ''
          c.chapterId = d.payload?.chapterId || ''
          c.typeTags = (d.payload?.typeTags || []).join('/')
          c.submissionId = d.payload?.submissionId || ''
        } catch {
          // 详情拉取失败时列表行仍可见，只是少标签
        }
      }),
    )
    cases.value = list
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function reindex() {
  dialog.warning({
    title: '重建 AI 索引',
    content: '将清除全部案例向量并重嵌所有已上线案例，耗时取决于案例数。继续？',
    positiveText: '重建',
    negativeText: '取消',
    async onPositiveClick() {
      reindexing.value = true
      try {
        const r = await contentApi.reindex()
        if (r.ok) message.success(`索引重建完成：${r.indexed}/${r.total}`)
        else message.warning('未执行：' + (r.reason || '向量供应商未就绪'))
      } catch (e: any) {
        message.error(e?.message || '重建失败')
      } finally {
        reindexing.value = false
      }
    },
  })
}
</script>

<template>
  <div>
    <div class="toolbar">
      <NButton size="small" :type="filter === 'all' ? 'primary' : 'default'" secondary @click="filter = 'all'">
        全部（{{ cases.length }}）
      </NButton>
      <NButton size="small" :type="filter === 'draft' ? 'primary' : 'default'" secondary @click="filter = 'draft'">
        草稿
      </NButton>
      <NButton
        size="small"
        :type="filter === 'published' ? 'primary' : 'default'"
        secondary
        @click="filter = 'published'"
      >
        已上线
      </NButton>
      <span class="spacer" />
      <NButton size="small" type="warning" secondary :loading="reindexing" @click="reindex">重建 AI 索引</NButton>
    </div>

    <NCard v-if="loading" size="small">加载中……</NCard>
    <p v-else-if="shown.length === 0" class="empty">没有符合条件的 Case。</p>

    <NCard v-for="c in shown" :key="c.id" size="small" class="case">
      <div class="case__head">
        <a class="case__title" @click="router.push('/cases/' + c.id)">{{ c.title || c.id }}</a>
        <NTag size="small" :type="c.status === 'published' ? 'success' : 'warning'">
          {{ c.status }}{{ c.version ? ' · v' + c.version : '' }}
        </NTag>
      </div>
      <div class="case__meta">{{ c.id }} · {{ c.domain || '—' }} · {{ c.layer || '层契约待补' }}</div>
      <div class="case__tags">
        <NTag v-if="c.part" size="small" type="error" ghost>{{ c.part }}</NTag>
        <NTag v-if="c.chapterId" size="small" type="info" ghost>{{ c.chapterId }}</NTag>
        <NTag v-if="c.typeTags" size="small">{{ c.typeTags }}</NTag>
        <NTag v-if="c.submissionId" size="small" type="success" ghost>来自投稿</NTag>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}
.spacer {
  flex: 1;
}
.case {
  margin-bottom: 10px;
}
.case__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.case__title {
  font-weight: 700;
  cursor: pointer;
}
.case__title:hover {
  color: #7c5cd6;
}
.case__meta {
  color: #9c96ad;
  font-size: 12px;
  margin: 6px 0;
}
.case__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.empty {
  color: #9c96ad;
  text-align: center;
  padding: 40px 0;
}
</style>
