import type { Ref } from 'vue'

/** 公开头像池（GET /api/app-resources 的 avatars）；
 * 懒加载一次并缓存在 useState，失败按池空处理（不重试、不写库）。 */
export function useAvatarPool(): { avatars: Ref<string[]>; load: () => Promise<void> } {
  const avatars = useState<string[]>('avatar-pool', () => [])
  const loaded = useState<boolean>('avatar-pool-loaded', () => false)
  const api = useApi()

  async function load(): Promise<void> {
    if (loaded.value) return
    loaded.value = true // 先置位，避免并发触发重复请求
    try {
      const res = await api.get<{ avatars?: unknown }>('/api/app-resources')
      avatars.value = Array.isArray(res?.avatars) ? (res.avatars as string[]) : []
    } catch {
      avatars.value = []
    }
  }

  return { avatars, load }
}
