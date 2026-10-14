import { ref } from 'vue'
import { api, clearToken, getToken, setToken } from '@/api/client'

export interface AdminUser {
  id: string
  login: string
  name: string | null
  role: string
}

// 模块级单例：布局壳与页面共享同一份登录态
const user = ref<AdminUser | null>(null)

export function useAuth() {
  async function login(loginName: string, password: string): Promise<void> {
    const r = await api.post('/api/auth/login', { login: loginName, password })
    if (!['editor', 'admin'].includes(r.role)) {
      throw new Error('该账号没有 editor/admin 权限')
    }
    setToken(r.token)
    user.value = await fetchMe()
  }

  async function fetchMe(): Promise<AdminUser> {
    const me: AdminUser = await api.get('/api/me')
    user.value = me
    return me
  }

  function logout(): void {
    clearToken()
    user.value = null
  }

  function isLoggedIn(): boolean {
    return !!getToken()
  }

  return { user, login, fetchMe, logout, isLoggedIn }
}
