/** App 端登录态：token/user 存 storage，请求带 Authorization: Bearer。
 *  通道与 Web 的 cookie 互不影响；API_BASE 见 config.ts。 */
import { API_BASE } from '../config'
import { getAvatarPresets } from './remote-assets'

const KEY_TOKEN = 'think_token'
const KEY_USER = 'think_user'
const KEY_LOCAL_AVATAR = 'think_local_avatar'
const KEY_LOCAL_NAME = 'think_local_name'

export interface AppUser {
  id: string
  login: string
  name: string
  avatar: string
  role: string
}

export function getToken(): string {
  const v = uni.getStorageSync(KEY_TOKEN)
  return v == null ? '' : v as string
}

export function getStoredUser(): AppUser | null {
  const raw = uni.getStorageSync(KEY_USER)
  if (raw == null || (raw as string).length === 0) return null
  try {
    return JSON.parse(raw as string) as AppUser
  } catch (e) {
    return null
  }
}

export function isLoggedIn(): boolean {
  return getToken().length > 0
}

/** 头像优先级：后端 avatar URL -> 本地已选 -> 远程头像池首张。
 *  旧版本 storage 里可能残留 /static/ 本地路径（已随包删除），一律忽略。 */
export function getAvatar(): string {
  const u = getStoredUser()
  if (u != null && u.avatar.length > 0) return u.avatar
  const local = uni.getStorageSync(KEY_LOCAL_AVATAR)
  if (local != null && typeof local == 'string' && local.length > 0 && !local.startsWith('/static/')) {
    return local
  }
  const presets = getAvatarPresets()
  return presets.length > 0 ? presets[0] : ''
}

/** 昵称优先级：已登录 user.name；未登录本地名；兜底 */
export function getDisplayName(): string {
  const u = getStoredUser()
  if (u != null && u.name.length > 0) return u.name
  const local = uni.getStorageSync(KEY_LOCAL_NAME)
  if (local != null && (local as string).length > 0) return local as string
  return '游客侦探'
}

export function setLocalAvatar(path: string) {
  uni.setStorageSync(KEY_LOCAL_AVATAR, path)
}

/** 保存头像：登录态 PATCH 后端（Bearer）+ 更新本地；未登录仅本地 */
export function updateAvatar(url: string, cb: (r: LoginResult) => void) {
  const u = getStoredUser()
  setLocalAvatar(url)
  if (isLoggedIn() && u != null) {
    uni.request({
      url: API_BASE + '/api/me',
      method: 'PATCH',
      header: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' } as any,
      data: { name: u.name, avatarUrl: url } as any,
      timeout: 8000,
      success: (res) => {
        if (res.statusCode === 200) {
          const nu: AppUser = { id: u.id, login: u.login, name: (res.data as any).name ?? u.name, avatar: (res.data as any).avatar ?? url, role: u.role }
          uni.setStorageSync(KEY_USER, JSON.stringify(nu))
          cb({ error: '', user: nu })
          return
        }
        cb({ error: '头像保存失败' })
      },
      fail: () => cb({ error: '无法连接社区服务' }),
    })
    return
  }
  cb({ error: '', user: u })
}

/** 保存昵称：登录态 PATCH 后端（Bearer）+ 更新本地；未登录仅本地 */
export function updateName(name: string, cb: (r: LoginResult) => void) {
  const u = getStoredUser()
  if (isLoggedIn() && u != null) {
    uni.request({
      url: API_BASE + '/api/me',
      method: 'PATCH',
      header: { Authorization: 'Bearer ' + getToken() } as any,
      data: { name: name } as any,
      timeout: 8000,
      success: (res) => {
        if (res.statusCode !== 200) {
          const detail = (res.data as any)?.detail
          cb({ error: typeof detail === 'string' ? detail : '保存失败' })
          return
        }
        const d = res.data as any
        u.name = d.name
        uni.setStorageSync(KEY_USER, JSON.stringify(u))
        cb({ error: '' })
      },
      fail: () => {
        cb({ error: '无法连接社区服务' })
      },
    })
    return
  }
  uni.setStorageSync(KEY_LOCAL_NAME, name)
  cb({ error: '' })
}

export interface LoginResult {
  error: string
}

/** 账密登录：成功后 token/user 落 storage。 */
export function login(loginName: string, password: string, cb: (r: LoginResult) => void) {
  uni.request({
    url: API_BASE + '/api/auth/login',
    method: 'POST',
    data: { login: loginName, password: password } as any,
    timeout: 8000,
    success: (res) => {
      if (res.statusCode !== 200) {
        const detail = (res.data as any)?.detail
        cb({ error: typeof detail === 'string' ? detail : '账号或密码错误' })
        return
      }
      const d = res.data as any
      const token = typeof d.token === 'string' ? d.token as string : ''
      if (token.length === 0) {
        cb({ error: '登录响应异常（缺少 token）' })
        return
      }
      uni.setStorageSync(KEY_TOKEN, token)
      uni.setStorageSync(KEY_USER, JSON.stringify({ id: 'pw-' + d.login, login: d.login, name: d.login, avatar: '', role: d.role } as AppUser))
      cb({ error: '' })
    },
    fail: () => {
      cb({ error: '无法连接社区服务' })
    },
  })
}

export function logout() {
  uni.removeStorageSync(KEY_TOKEN)
  uni.removeStorageSync(KEY_USER)
  uni.removeStorageSync('think_last_sync')
}

export interface SmsResult {
  error: string
  devEcho: string
}

/** 发送验证码（dev 通道响应带 devEcho 供自动填入）。 */
export function sendSmsCode(phone: string, cb: (r: SmsResult) => void) {
  uni.request({
    url: API_BASE + '/api/auth/sms/send',
    method: 'POST',
    data: { phone: phone } as any,
    timeout: 8000,
    success: (res) => {
      if (res.statusCode !== 200) {
        const detail = (res.data as any)?.detail
        cb({ error: typeof detail === 'string' ? detail : '发送失败，稍后再试', devEcho: '' })
        return
      }
      const d = res.data as any
      cb({ error: '', devEcho: typeof d.devEcho === 'string' ? d.devEcho as string : '' })
    },
    fail: () => {
      cb({ error: '无法连接社区服务', devEcho: '' })
    },
  })
}

/** 手机验证码登录：新手机号自动建号（与 Web 注册互通）。 */
export function smsLogin(phone: string, code: string, cb: (r: LoginResult) => void) {
  uni.request({
    url: API_BASE + '/api/auth/login/phone',
    method: 'POST',
    data: { phone: phone, code: code } as any,
    timeout: 8000,
    success: (res) => {
      if (res.statusCode !== 200) {
        const detail = (res.data as any)?.detail
        cb({ error: typeof detail === 'string' ? detail : '验证码错误' })
        return
      }
      const d = res.data as any
      const token = typeof d.token === 'string' ? d.token as string : ''
      if (token.length === 0) {
        cb({ error: '登录响应异常（缺少 token）' })
        return
      }
      uni.setStorageSync(KEY_TOKEN, token)
      const realName = typeof d.name === 'string' && (d.name as string).length > 0 ? d.name as string : d.login
      uni.setStorageSync(KEY_USER, JSON.stringify({ id: typeof d.userId === 'string' ? d.userId : 'ph', login: d.login, name: realName, avatar: '', role: d.role } as AppUser))
      cb({ error: '' })
    },
    fail: () => {
      cb({ error: '无法连接社区服务' })
    },
  })
}
