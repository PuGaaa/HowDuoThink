import { api } from '@/api/client'

export interface AdminUserRow {
  id: string
  login: string
  name: string | null
  avatar: string | null
  role: string
  status: string
  created_at: string
}

export interface UserListResult {
  total: number
  items: AdminUserRow[]
}

export const usersApi = {
  list: (query: string, page: number, pageSize: number): Promise<UserListResult> => {
    const sp = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (query) sp.set('query', query)
    return api.get('/api/admin/users?' + sp.toString())
  },
  updateRole: (id: string, role: string) => api.patch(`/api/admin/users/${id}/role`, { role }),
  updateStatus: (id: string, status: 'active' | 'banned') => api.patch(`/api/admin/users/${id}/status`, { status }),
}
