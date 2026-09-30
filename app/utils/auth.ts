/** App 端登录态：token/user 存 storage，请求带 Authorization: Bearer。
 *  通道与 Web 的 cookie 互不影响；API_BASE 见 config.ts。 */
import { API_BASE } from '../config'

const KEY_TOKEN = 'think_token'
const KEY_USER = 'think_user'

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
      uni.setStorageSync(KEY_USER, JSON.stringify({ id: typeof d.userId === 'string' ? d.userId : 'ph', login: d.login, name: d.login, avatar: '', role: d.role } as AppUser))
      cb({ error: '' })
    },
    fail: () => {
      cb({ error: '无法连接社区服务' })
    },
  })
}
