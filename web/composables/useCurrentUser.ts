import type { Ref } from 'vue'

/** 当前登录用户资料（GET /api/me 与 PATCH /api/me 的返回形态）。
 * 登录接口的返回不含 hasPassword，故声明为可选。 */
export interface User {
  id: string
  login: string
  name: string
  avatar: string
  role: string
  hasPassword?: boolean
}

/** 全局登录态单例：app.vue 顶栏与后续拆分的登录/资料弹窗共用同一份。 */
export function useCurrentUser(): {
  user: Ref<User | null>
  ensure: () => Promise<void>
  set: (u: User | null) => void
} {
  const user = useState<User | null>('current-user', () => null)
  // 默认头像「只随机一次」的会话内守卫：同一用户只尝试一次随机落库
  const defaultAvatarTried = useState<Record<string, boolean>>('default-avatar-tried', () => ({}))
  const api = useApi()

  /** 默认头像规则：头像为空且池非空 → 随机取一张 PATCH 落库；
   * 池空 / 已尝试过 / PATCH 失败 → 保持空（由 UserAvatar 落首字占位），不写库。 */
  async function assignDefaultAvatar(u: User): Promise<User> {
    if (u.avatar || defaultAvatarTried.value[u.id]) return u
    defaultAvatarTried.value[u.id] = true
    const { avatars, load } = useAvatarPool()
    await load()
    if (!avatars.value.length) return u
    const pick = avatars.value[Math.floor(Math.random() * avatars.value.length)]
    try {
      return (await api.patch('/api/me', { name: u.name, avatarUrl: pick })) as User
    } catch {
      return u
    }
  }

  /** 未加载则拉取 /api/me 并应用默认头像规则；未登录（401 等）保持 null。 */
  async function ensure(): Promise<void> {
    if (user.value) return
    try {
      user.value = await assignDefaultAvatar(await api.get<User>('/api/me'))
    } catch {
      user.value = null
    }
  }

  /** 登录成功 / 资料更新后写入登录态；头像为空时后台补一次默认头像落库。 */
  function set(u: User | null): void {
    user.value = u
    if (!u) return
    assignDefaultAvatar(u).then((fresh) => {
      // 期间用户已退出或换号则丢弃回写
      if (user.value && user.value.id === u.id) user.value = fresh
    })
  }

  return { user, ensure, set }
}
