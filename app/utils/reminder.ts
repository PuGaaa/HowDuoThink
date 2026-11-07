/** 学习提醒：偏好存 storage，当日去重。
 *  H5 = 浏览器通知（授权后；无授权降级应用内弹窗），60s 轮询驱动。
 *  App = 系统本地通知（uni_modules/hduo-reminder，UNUserNotificationCenter
 *  每日日程重复触发，app 被杀/重启/断网系统都按时弹，零第三方依赖）。
 *  本文件轮询仅服务 H5；App 端设置提醒时即向系统注册调度，无需轮询。 */
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

/** 提醒通道：browser = 浏览器通知（需授权）；inapp = App 端应用内模态（无需系统权限） */
export function notifyChannel(): string {
  // #ifdef WEB
  const N = (window as any).Notification
  return N ? 'browser' : 'none'
  // #endif
  // #ifndef WEB
  return 'inapp'
  // #endif
}

/** H5：等待浏览器通知权限结果。 */
export function requestNotifyPermission(): Promise<string> {
  // #ifdef WEB
  const N = (window as any).Notification
  if (!N) return Promise.resolve('unsupported')
  if (N.permission === 'default') return N.requestPermission() as Promise<string>
  return Promise.resolve(N.permission as string)
  // #endif
  // #ifndef WEB
  return Promise.resolve('granted')
  // #endif
}

/** 到点提醒（当日去重，仅 H5）：浏览器通知；未授权降级应用内弹窗。
 *  App 端到点弹系统通知由 uni_modules/hduo-reminder 的系统调度负责。 */
function fireReminder() {
  const today = new Date()
  const day = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate()
  if (uni.getStorageSync(KEY_SENT) === day) return
  uni.setStorageSync(KEY_SENT, day)
  // #ifdef WEB
  const N = (window as any).Notification
  if (N && N.permission === 'granted') {
    new N('好多星', { body: '今天的学习时间到了，来破一案吧 🔍' })
    return
  }
  uni.showModal({
    title: '学习提醒',
    content: '今天的学习时间到了，来破一案吧 🔍',
    confirmText: '去学习',
    cancelText: '知道了',
    success: (res) => {
      if (res.confirm) uni.switchTab({ url: '/pages/index/index' })
    },
  })
  // #endif
}

/** 启动轮询（profile onShow 时调用，重复调用安全；仅 H5，App 由系统调度无需轮询） */
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
      fireReminder()
    }
  }, 60000)
  // #endif
}
