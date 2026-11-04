const KEY_EVENTS = 'think_learning_events_v1_'
const KEY_ANONYMOUS_ID = 'think_learning_anonymous_id_v1'
const KEY_TEST_MODE = 'think_learning_test_mode_v1'
const KEY_OWNER = 'think_learning_owner_v1_'
const KEY_CLAIMED = 'think_learning_claimed_v1_'
import { API_BASE } from '../config'
import { getToken, getStoredUser } from './auth'

const inFlight = new Set<string>()

export interface LearningEventRecord {
  eventId: string
  kind: string
  sessionId: string
  caseId: string
  source: string
  contentRevision: number
  anonymousId: string
  occurredAt: string
  solved: boolean | null
}

export function getLearningAnonymousId(): string {
  const current = uni.getStorageSync(KEY_ANONYMOUS_ID)
  let id = current == null ? '' : current as string
  const user = getStoredUser()
  const owner = id.length > 0 ? uni.getStorageSync(KEY_OWNER + id) : null
  if (id.length === 0 || (user != null && owner != null && owner !== user.id)) {
    id = 'anon-' + String(Date.now()) + '-' + String(Math.random())
  }
  uni.setStorageSync(KEY_ANONYMOUS_ID, id)
  if (user != null) uni.setStorageSync(KEY_OWNER + id, user.id)
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

export function trackLearningEvent(kind: string, sessionId: string, caseId: string, source: string, contentRevision: number = 0, solved: boolean | null = null): void {
  if (isLearningTestMode()) return
  const raw = uni.getStorageSync(eventsKey())
  const events: LearningEventRecord[] = raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as LearningEventRecord[]
  const eventId = kind === 'session_end' ? 'event-session-end-' + sessionId : 'event-' + String(Date.now()) + '-' + String(Math.random())
  events.push({ eventId: eventId, kind: kind, sessionId: sessionId, caseId: caseId, source: source, contentRevision: contentRevision, anonymousId: getLearningAnonymousId(), occurredAt: new Date().toISOString(), solved: solved })
  const queueKey = eventsKey()
  uni.setStorageSync(queueKey, JSON.stringify(events))
  flushLearningEvents()
}

export function flushLearningEvents(): void {
  if (isLearningTestMode()) return
  const anonymousId = getLearningAnonymousId()
  const token = getToken()
  const user = getStoredUser()
  if (user == null) {
    sendQueue(anonymousId, token)
    return
  }
  const keys = uni.getStorageInfoSync().keys
  for (const key of keys) {
    if (!key.startsWith(KEY_OWNER) || uni.getStorageSync(key) !== user.id) continue
    const id = key.substring(KEY_OWNER.length)
    claimQueue(id, token, user.id)
  }
}

export function claimLearningEvents(): void {
  flushLearningEvents()
}

export function trackIdentityLearningEvent(kind: string, source: string, caseId: string = 'account'): void {
  trackLearningEvent(kind, 'identity-' + getLearningAnonymousId(), caseId, source)
}

function claimQueue(anonymousId: string, token: string, uid: string): void {
  if (uni.getStorageSync(KEY_CLAIMED + anonymousId) === uid) {
    sendQueue(anonymousId, token)
    return
  }
  const requestKey = 'claim:' + token + ':' + anonymousId
  if (inFlight.has(requestKey)) return
  inFlight.add(requestKey)
  uni.request({
    url: API_BASE + '/api/me/learning-events/claim',
    method: 'POST',
    header: { Authorization: 'Bearer ' + token } as any,
    data: { anonymousId: anonymousId } as any,
    timeout: 8000,
    success: (response) => {
      if (response.statusCode !== 204 || token !== getToken() || getStoredUser()!.id !== uid) return
      uni.setStorageSync(KEY_CLAIMED + anonymousId, uid)
      sendQueue(anonymousId, token)
    },
    complete: () => { inFlight.delete(requestKey) },
  })
}

function sendQueue(anonymousId: string, token: string): void {
  const queueKey = KEY_EVENTS + anonymousId
  for (const event of readLearningEvents(queueKey)) sendLearningEvent(event, queueKey, token)
}

function readLearningEvents(queueKey: string): LearningEventRecord[] {
  const raw = uni.getStorageSync(queueKey)
  return raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as LearningEventRecord[]
}

function sendLearningEvent(event: LearningEventRecord, queueKey: string, token: string): void {
  const requestKey = token + ':' + event.eventId
  if (inFlight.has(requestKey)) return
  inFlight.add(requestKey)
  uni.request({
    url: (token.length > 0 ? API_BASE + '/api/me/learning-events' : API_BASE + '/api/learning-events'),
    method: 'POST',
    header: token.length > 0 ? { Authorization: 'Bearer ' + token } as any : {} as any,
    data: event as any,
    timeout: 8000,
    success: (response) => {
      if (response.statusCode !== 204) return
      if (token !== getToken()) return
      if (token.length === 0 && queueKey !== eventsKey()) return
      const events = readLearningEvents(queueKey).filter((item) => item.eventId !== event.eventId)
      uni.setStorageSync(queueKey, JSON.stringify(events))
    },
    complete: () => { inFlight.delete(requestKey) },
  })
}

export function learningEvents(): LearningEventRecord[] {
  const raw = uni.getStorageSync(eventsKey())
  return raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as LearningEventRecord[]
}
