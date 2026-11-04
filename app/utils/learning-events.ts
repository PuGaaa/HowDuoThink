const KEY_EVENTS = 'think_learning_events_v1_'
const KEY_ANONYMOUS_ID = 'think_learning_anonymous_id_v1'
const KEY_TEST_MODE = 'think_learning_test_mode_v1'
import { API_BASE } from '../config'
import { getToken, isLoggedIn } from './auth'

export interface LearningEventRecord {
  eventId: string
  kind: string
  sessionId: string
  caseId: string
  source: string
  contentRevision: number
  anonymousId: string
  occurredAt: string
}

export function getLearningAnonymousId(): string {
  const current = uni.getStorageSync(KEY_ANONYMOUS_ID)
  if (current != null && (current as string).length > 0) return current as string
  const id = 'anon-' + String(Date.now()) + '-' + String(Math.random())
  uni.setStorageSync(KEY_ANONYMOUS_ID, id)
  return id
}

function eventsKey(): string {
  return KEY_EVENTS + getLearningAnonymousId()
}

export function setLearningTestMode(enabled: boolean): void {
  uni.setStorageSync(KEY_TEST_MODE, enabled ? '1' : '0')
}

export function isLearningTestMode(): boolean {
  return uni.getStorageSync(KEY_TEST_MODE) === '1'
}

export function trackLearningEvent(kind: string, sessionId: string, caseId: string, source: string, contentRevision: number = 0): void {
  if (isLearningTestMode()) return
  const raw = uni.getStorageSync(eventsKey())
  const events: LearningEventRecord[] = raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as LearningEventRecord[]
  events.push({ eventId: 'event-' + String(Date.now()) + '-' + String(Math.random()), kind: kind, sessionId: sessionId, caseId: caseId, source: source, contentRevision: contentRevision, anonymousId: getLearningAnonymousId(), occurredAt: new Date().toISOString() })
  uni.setStorageSync(eventsKey(), JSON.stringify(events))
  if (isLoggedIn()) {
    sendLearningEvent(events[events.length - 1])
  }
}

export function flushLearningEvents(): void {
  if (!isLoggedIn()) return
  const events = learningEvents()
  for (const event of events) sendLearningEvent(event)
}

export function claimLearningEvents(): void {
  if (!isLoggedIn()) return
  uni.request({
    url: API_BASE + '/api/me/learning-events/claim',
    method: 'POST',
    header: { Authorization: 'Bearer ' + getToken() } as any,
    data: { anonymousId: getLearningAnonymousId() } as any,
    timeout: 8000,
  })
}

function sendLearningEvent(event: LearningEventRecord): void {
  uni.request({
    url: (isLoggedIn() ? API_BASE + '/api/me/learning-events' : API_BASE + '/api/learning-events'),
    method: 'POST',
    header: isLoggedIn() ? { Authorization: 'Bearer ' + getToken() } as any : {} as any,
    data: event as any,
    timeout: 8000,
    success: (response) => {
      if (response.statusCode !== 204) return
      const events = learningEvents().filter((item) => item.eventId !== event.eventId)
      uni.setStorageSync(eventsKey(), JSON.stringify(events))
    },
  })
}

export function learningEvents(): LearningEventRecord[] {
  const raw = uni.getStorageSync(eventsKey())
  return raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as LearningEventRecord[]
}
