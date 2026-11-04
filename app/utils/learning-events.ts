const KEY_EVENTS = 'think_learning_events_v1'
const KEY_ANONYMOUS_ID = 'think_learning_anonymous_id_v1'
const KEY_TEST_MODE = 'think_learning_test_mode_v1'

export interface LearningEventRecord {
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

export function setLearningTestMode(enabled: boolean): void {
  uni.setStorageSync(KEY_TEST_MODE, enabled ? '1' : '0')
}

export function isLearningTestMode(): boolean {
  return uni.getStorageSync(KEY_TEST_MODE) === '1'
}

export function trackLearningEvent(kind: string, sessionId: string, caseId: string, source: string, contentRevision: number = 0): void {
  if (isLearningTestMode()) return
  const raw = uni.getStorageSync(KEY_EVENTS)
  const events: LearningEventRecord[] = raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as LearningEventRecord[]
  events.push({ kind: kind, sessionId: sessionId, caseId: caseId, source: source, contentRevision: contentRevision, anonymousId: getLearningAnonymousId(), occurredAt: new Date().toISOString() })
  uni.setStorageSync(KEY_EVENTS, JSON.stringify(events))
}

export function learningEvents(): LearningEventRecord[] {
  const raw = uni.getStorageSync(KEY_EVENTS)
  return raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as LearningEventRecord[]
}
