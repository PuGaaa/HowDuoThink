import type { Ref } from 'vue'

/** 当前登录用户资料（GET /api/me 与 PATCH /api/me 的返回形态）。
 * hasPassword 可选：登录接口响应不含该字段，仅资料接口返回。 */
export interface User {
  id: string
  login: string
  name: string
  avatar: string
  role: string
  hasPassword?: boolean
}

/** 登录接口线格式：两个登录接口都返回 userId（非 id），且手机登录不含 avatar——
 * 不能直接当 User 用，须经 normalizeLoginResponse 归一化后才能入状态。 */
export interface LoginResponse {
  userId: string
  login: string
  name: string
  avatar?: string
  role: string
}

/** 登录响应 → User 归一化：userId→id、avatar 缺省 ''。
 * 入参刻意收 unknown：线格式断言（as）正是覆盖真实头像事故的根因，
 * 归一化必须自己逐字段校验，调用点不允许任何类型断言。
 * 之后所有守卫（防串号、只随机一次）都以这里产出的真实 id 为键。 */
export function normalizeLoginResponse(raw: unknown): User {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('登录响应格式异常：非对象')
  }
  const r = raw as Record<string, unknown>
  const required = (v: unknown, field: string): string => {
    if (typeof v !== 'string' || !v) throw new Error('登录响应格式异常：缺少 ' + field)
    return v
  }
  return {
    id: required(r.userId, 'userId'),
    login: required(r.login, 'login'),
    name: typeof r.name === 'string' ? r.name : '',
    avatar: typeof r.avatar === 'string' ? r.avatar : '',
    role: required(r.role, 'role'),
  }
}

/** 全局登录态单例：app.vue 顶栏与后续拆分的登录/资料弹窗共用同一份。 */
export function useCurrentUser(): {
  user: Ref<User | null>
  ensure: () => Promise<void>
  set: (u: User | null) => void
} {
  const user = useState<User | null>('current-user', () => null)
  // 默认头像「只随机一次」的会话内守卫：键为真实用户 id（来自权威资料）
  const defaultAvatarTried = useState<Record<string, boolean>>('default-avatar-tried', () => ({}))
  const api = useApi()

  /** 默认头像规则：头像为空且池非空 → 随机取一张 PATCH 落库；
   * 池空 / 已尝试过 / PATCH 失败 → 保持空（由 UserAvatar 落首字占位），不写库。
   * 只在权威资料（GET /api/me 或 PATCH 的返回）上调用，绝不信任登录响应的 avatar 字段。 */
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

  /** 未加载则拉取 /api/me（权威资料）并应用默认头像规则；未登录保持 null。 */
  async function ensure(): Promise<void> {
    if (user.value) return
    try {
      user.value = await assignDefaultAvatar(await api.get<User>('/api/me'))
    } catch {
      user.value = null
    }
  }

  /** 登录 / 资料更新后写入登录态（入参须是归一化后的 User 或资料接口的全量返回）。
   * 默认头像规则以 GET /api/me 的权威资料为准应用，不信任登录响应；
   * GET 与最终写回各带一次防串号守卫（PATCH 在途时换号则丢弃）。 */
  function set(u: User | null): void {
    user.value = u
    if (!u) return
    const expectedId = u.id
    void (async () => {
      try {
        const authoritative = await api.get<User>('/api/me')
        if (!user.value || user.value.id !== expectedId) return // 期间已退出/换号
        const settled = await assignDefaultAvatar(authoritative)
        if (!user.value || user.value.id !== expectedId) return // 默认头像 PATCH 在途时已换号
        user.value = settled
      } catch {
        // 权威资料拉取失败（网络等）：保留已归一化的登录态，占位显示
      }
    })()
  }

  return { user, ensure, set }
}
