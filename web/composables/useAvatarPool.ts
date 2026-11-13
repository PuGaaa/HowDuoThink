import type { Ref } from 'vue'

/** 公开头像池（GET /api/app-resources 的 avatars）；
 * 懒加载一次并缓存在 useState，失败按池空处理（不写库，允许下次再试）。
 * 并发安全：共享同一个在途 Promise——先到的调用触发请求，后到的等待同一份数据，
 * 绝不在「请求在途但数据未回」的窗口里拿空池做决策（默认头像落库依赖这一点）。 */
// 在途 Promise 存模块级变量：load 只在客户端调用（UserAvatar onMounted / set 流程），
// SSR 不触碰即无跨请求泄漏；客户端模块单例天然全局共享。
let inflight: Promise<void> | null = null

export function useAvatarPool(): { avatars: Ref<string[]>; load: () => Promise<void> } {
  const avatars = useState<string[]>('avatar-pool', () => [])
  const api = useApi()

  function load(): Promise<void> {
    if (avatars.value.length) return Promise.resolve() // 已就绪
    if (!inflight) {
      inflight = api
        .get<{ avatars?: unknown }>('/api/app-resources')
        .then((res) => {
          avatars.value = Array.isArray(res?.avatars) ? (res.avatars as string[]) : []
        })
        .catch(() => {
          avatars.value = []
          inflight = null // 失败不缓存：下次调用可重试
        })
    }
    return inflight
  }

  return { avatars, load }
}
