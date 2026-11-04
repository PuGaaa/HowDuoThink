/** 每日一题：按日期确定性选题（同一天全员同题），完成后当日去重。 */
import { getEffectiveCases } from '../data/cases'
import { isCasePlayable } from '../data/chapters'
import { DiagnosisCase } from '../types/case'

import { notifyProgressDirty, progressStorageGet, progressStorageSet } from './storage'

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

/** 今日一题：日期 hash 对当前可玩官方池取模；游客与登录用户按各自资格选题。 */
export function dailyCase(): DiagnosisCase {
  const h = hashStr('daily-' + todayKey())
  const cases = getEffectiveCases()
  const playable: DiagnosisCase[] = []
  for (let i = 0; i < cases.length; i++) {
    if (isCasePlayable(cases[i].id)) playable.push(cases[i])
  }
  return playable[h % playable.length]
}

export function isDailyCase(caseId: string): boolean {
  return dailyCase().id === caseId
}

/** 今日题是否已完成（storage 记最近完成日期） */
export function dailyDone(): boolean {
  const raw = progressStorageGet(KEY_DONE)
  return raw != null && (raw as string) === todayKey()
}

export function markDailyDone(sessionId: string, caseId: string) {
  if (dailyDone()) return
  const day = todayKey()
  progressStorageSet(KEY_DONE, day)
  const raw = progressStorageGet('think_progress_ops_v1')
  const ops = raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as any[]
  ops.push({ opId: 'daily-' + day, kind: 'daily_done', occurredAt: new Date().toISOString(), payload: { day: day, sessionId: sessionId, caseId: caseId } })
  progressStorageSet('think_progress_ops_v1', JSON.stringify(ops))
  notifyProgressDirty()
}

// sync v2: cache-bust
