<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { NButton, NDataTable, NInput, NPagination, NSelect, NTag } from 'naive-ui'
import type { DataTableColumns, SelectOption } from 'naive-ui'
import { usersApi, type AdminUserRow } from '../api/users'
import { useAuth } from '@/composables/useAuth'

const message = useMessage()
const { user: me } = useAuth()

const items = ref<AdminUserRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const query = ref('')
const queryInput = ref('')
const loading = ref(false)

const ROLE_OPTIONS: (SelectOption & { value: string })[] = [
  { label: '用户', value: 'user' },
  { label: '编辑', value: 'editor' },
  { label: '管理员', value: 'admin' },
]

async function load() {
  loading.value = true
  try {
    const r = await usersApi.list(query.value, page.value, pageSize.value)
    items.value = r.items
    total.value = r.total
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function search() {
  query.value = queryInput.value.trim()
  page.value = 1
  load()
}

function isSelf(row: AdminUserRow): boolean {
  return !!me.value && me.value.id === row.id
}

async function changeRole(row: AdminUserRow, role: string) {
  try {
    await usersApi.updateRole(row.id, role)
    row.role = role
    message.success(`已将 ${row.login} 角色改为 ${role}`)
  } catch (e: any) {
    message.error(e?.message || '修改失败')
    await load()
  }
}

async function toggleBan(row: AdminUserRow) {
  const target = row.status === 'banned' ? 'active' : 'banned'
  try {
    await usersApi.updateStatus(row.id, target)
    row.status = target
    message.success(target === 'banned' ? `已封禁 ${row.login}` : `已解封 ${row.login}`)
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

const columns: DataTableColumns<AdminUserRow> = [
  {
    title: '账号',
    key: 'login',
    render(row) {
      return h('div', [
        h('div', { style: 'font-weight:700' }, row.login),
        h('div', { style: 'font-size:12px;color:#9c96ad' }, row.name || ''),
      ])
    },
  },
  {
    title: '角色',
    key: 'role',
    width: 130,
    render(row) {
      if (isSelf(row)) {
        return h(NTag, { size: 'small', type: 'info' }, { default: () => `${row.role}（我）` })
      }
      return h(NSelect, {
        value: row.role,
        options: ROLE_OPTIONS,
        size: 'small',
        style: 'width:110px',
        onUpdateValue: (v: string) => changeRole(row, v),
      })
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render(row) {
      return h(
        NTag,
        { size: 'small', type: row.status === 'banned' ? 'error' : 'success' },
        { default: () => (row.status === 'banned' ? '已封禁' : '正常') },
      )
    },
  },
  { title: '注册时间', key: 'created_at', width: 170 },
  {
    title: '操作',
    key: 'actions',
    width: 110,
    render(row) {
      if (isSelf(row)) return h('span', { style: 'color:#c5c0d0;font-size:12px' }, '不能操作自己')
      return h(
        NButton,
        {
          size: 'small',
          quaternary: true,
          type: row.status === 'banned' ? 'success' : 'error',
          onClick: () => toggleBan(row),
        },
        { default: () => (row.status === 'banned' ? '解封' : '封禁') },
      )
    },
  },
]
</script>

<template>
  <div>
    <div class="toolbar">
      <NInput
        v-model:value="queryInput"
        placeholder="搜索账号 / 昵称，回车确认"
        clearable
        style="width: 260px"
        @keyup.enter="search"
        @clear="search"
      />
      <NButton size="small" @click="search">搜索</NButton>
      <span class="spacer" />
      <span class="total">共 {{ total }} 人</span>
    </div>

    <NDataTable :columns="columns" :data="items" :loading="loading" :bordered="false" size="small" />
    <div class="pager">
      <NPagination
        v-model:page="page"
        :page-size="pageSize"
        :item-count="total"
        @update:page="load"
      />
    </div>
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
.total {
  color: #9c96ad;
  font-size: 13px;
}
.pager {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}
</style>
