/** 学习提醒（H5）：偏好存 storage，页面打开时 60s 轮询到点发浏览器通知，当日去重。
 *  原生推送等打包 App 后接入（接口保持不变）。 */
const KEY = 'think_reminder_v1'
const KEY_SENT = 'think_reminder_sent_v1'

export interface ReminderPref {
  on: boolean
  hh: number
  mm: number
}

export function getReminder(): ReminderPref {
  const raw = uni.getStorageSync(KEY)
  if (raw == null || (raw as string).length === 0) {
    return { on: false, hh: 21, mm: 30 }
  }
  try {
    const p = JSON.parse(raw as string) as ReminderPref
    return { on: !!p.on, hh: p.hh, mm: p.mm }
  } catch (e) {
    return { on: false, hh: 21, mm: 30 }
  }
}

export function setReminder(p: ReminderPref) {
  uni.setStorageSync(KEY, JSON.stringify(p))
}

export function reminderLabel(): string {
  const p = getReminder()
  if (!p.on) return '关闭'
  const hh = p.hh < 10 ? '0' + p.hh : String(p.hh)
  const mm = p.mm < 10 ? '0' + p.mm : String(p.mm)
  return '每天 ' + hh + ':' + mm
}

/** H5：请求通知权限。返回 'granted' | 'denied' | 'unsupported' */
export function requestNotifyPermission(): string {
  // #ifdef WEB
  const N = (window as any).Notification
  if (!N) return 'unsupported'
  if (N.permission === 'default') N.requestPermission()
  return N.permission as string
  // #endif
  // #ifndef WEB
  return 'unsupported'
  // #endif
}

/** H5：到点发通知（当日去重） */
function fireNotification() {
  // #ifdef WEB
  const N = (window as any).Notification
  if (!N || N.permission !== 'granted') return
  const sentKey = KEY_SENT
  const today = new Date()
  const day = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate()
  if (uni.getStorageSync(sentKey) === day) return
  uni.setStorageSync(sentKey, day)
  new N('好多星', { body: '今天的学习时间到了，来破一案吧 🔍' })
  // #endif
}

/** 启动轮询（profile onShow 时调用，重复调用安全） */
let polling: boolean = false

export function startReminderPolling() {
  // #ifdef WEB
  if (polling) return
  polling = true
  setInterval(() => {
    const p = getReminder()
    if (!p.on) return
    const now = new Date()
    if (now.getHours() === p.hh && now.getMinutes() >= p.mm && now.getMinutes() < p.mm + 1) {
      fireNotification()
    }
  }, 60000)
  // #endif
}
