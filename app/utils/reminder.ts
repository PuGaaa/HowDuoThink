/** 学习提醒：偏好存 storage，页面打开时 60s 轮询，当日去重。
 *  H5 = 浏览器通知（授权后）；App = 系统本地通知 uni.createPushMessage
 *  （需 manifest 启用 Push 模块 + DCloud 开通 uniPush；打包需自定义基座，
 *  标准基座不含 push 模块。app 进程被杀掉后不到点不弹——每日定时触发
 *  的系统级方案 UNUserNotificationCenter 待后续接入）。 */
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

/** 到点提醒（当日去重）：H5 走浏览器通知；App 走系统本地通知 */
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
  // #ifndef WEB
  // App：系统本地通知（前台展示由 onPushMessage 呈现）
  uni.createPushMessage({
    title: '好多星',
    content: '今天的学习时间到了，来破一案吧 🔍',
    cover: true,
  })
  // #endif
}

/** 启动轮询（profile onShow 时调用，重复调用安全；App/H5 都生效） */
let polling: boolean = false

export function startReminderPolling() {
  if (polling) return
  polling = true
  // #ifndef WEB
  // 前台收到本地通知：iOS 前台默认不展示横幅，用应用内 toast 呈现
  uni.onPushMessage((res) => {
    if (res.type === 'receive') {
      uni.showToast({ title: '今天的学习时间到了，来破一案吧 🔍', icon: 'none' })
    }
  })
  // #endif
  setInterval(() => {
    const p = getReminder()
    if (!p.on) return
    const now = new Date()
    if (now.getHours() === p.hh && now.getMinutes() >= p.mm && now.getMinutes() < p.mm + 1) {
      fireReminder()
    }
  }, 60000)
}
