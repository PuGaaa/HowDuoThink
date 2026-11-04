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
  const eventId = kind === 'session_end' ? 'event-session-end-' + sessionId : 'event-' + String(Date.now()) + '-' + String(Math.random())
  events.push({ eventId: eventId, kind: kind, sessionId: sessionId, caseId: caseId, source: source, contentRevision: contentRevision, anonymousId: getLearningAnonymousId(), occurredAt: new Date().toISOString() })
  const queueKey = eventsKey()
  uni.setStorageSync(queueKey, JSON.stringify(events))
  sendLearningEvent(events[events.length - 1], queueKey, getToken())
}

export function flushLearningEvents(): void {
  if (!isLoggedIn()) return
  const queueKey = eventsKey()
  const token = getToken()
  const events = readLearningEvents(queueKey)
  for (const event of events) sendLearningEvent(event, queueKey, token)
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

function readLearningEvents(queueKey: string): LearningEventRecord[] {
  const raw = uni.getStorageSync(queueKey)
  return raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as LearningEventRecord[]
}

function sendLearningEvent(event: LearningEventRecord, queueKey: string, token: string): void {
  uni.request({
    url: (token.length > 0 ? API_BASE + '/api/me/learning-events' : API_BASE + '/api/learning-events'),
    method: 'POST',
    header: token.length > 0 ? { Authorization: 'Bearer ' + token } as any : {} as any,
    data: event as any,
    timeout: 8000,
    success: (response) => {
      if (response.statusCode !== 204) return
      if (queueKey !== eventsKey() || (token.length > 0 && token !== getToken())) return
      const events = readLearningEvents(queueKey).filter((item) => item.eventId !== event.eventId)
      uni.setStorageSync(queueKey, JSON.stringify(events))
    },
  })
}

export function learningEvents(): LearningEventRecord[] {
  const raw = uni.getStorageSync(eventsKey())
  return raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as LearningEventRecord[]
}
