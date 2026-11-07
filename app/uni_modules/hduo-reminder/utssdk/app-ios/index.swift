import Foundation
import UserNotifications

let reminderIdentifier = "howduo_daily_reminder"

/**
 * 申请通知授权，并注册每日重复的本地通知。
 * 调度由 iOS 系统托管：app 被杀掉/重启/断网，到点系统均会弹出。
 * 换时间：直接再次调用（内部先移除旧的待发通知再注册新的）。
 */
export function scheduleDailyReminder(hour: Int, minute: Int, title: String, body: String) {
    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
        guard granted else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        let comps = DateComponents()
        comps.hour = Int(hour)
        comps.minute = Int(minute)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)
        let request = UNNotificationRequest(identifier: reminderIdentifier, content: content, trigger: trigger)
        center.removePendingNotificationRequests(withIdentifiers: [reminderIdentifier])
        center.add(request)
    }
}

/**
 * 取消已注册的每日提醒（开关关闭时调用）。
 */
export function cancelDailyReminder() {
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [reminderIdentifier])
}
