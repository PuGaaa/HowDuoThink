/** 每日一题：按日期确定性选题（同一天全员同题），完成后当日去重。 */
import { ALL_CASES } from '../data/cases'
import { DiagnosisCase } from '../types/case'

const KEY_DONE = 'think_daily_done_v1'

export function todayKey(): string {
  const d = new Date()
  const mm = d.getMonth() + 1 < 10 ? '0' + (d.getMonth() + 1) : String(d.getMonth() + 1)
  const dd = d.getDate() < 10 ? '0' + d.getDate() : String(d.getDate())
  return d.getFullYear() + '-' + mm + '-' + dd
}

/** 日期字符串 hash（确定性，不依赖 Math.random） */
function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** 今日一题：日期 hash 对案例注册表取模 */
export function dailyCase(): DiagnosisCase {
  const h = hashStr('daily-' + todayKey())
  return ALL_CASES[h % ALL_CASES.length]
}

export function isDailyCase(caseId: string): boolean {
  return dailyCase().id === caseId
}

/** 今日题是否已完成（storage 记最近完成日期） */
export function dailyDone(): boolean {
  const raw = uni.getStorageSync(KEY_DONE)
  return raw != null && (raw as string) === todayKey()
}

export function markDailyDone() {
  uni.setStorageSync(KEY_DONE, todayKey())
}
