/**
 * 本地进度存储（v0 无后端）。
 * 存储设计规避 uts 动态索引：每个案例独立 key，动物统计用固定字段。
 */

export interface CaseProgress {
  solved: boolean
  bestGrade: string
  bestCost: number
  plays: number
  /** 失败局数累计（玩过未破：章节地图"未破"标 + 错案重练的数据源） */
  fails: number
  contentRevision: number
  scoringVersion: number
}

/** 五只动物的出场统计（固定字段，便于 JSON 往返） */
export interface MascotStats {
  frog: number
  snail: number
  otter: number
  rabbit: number
  dino: number
}

/** 闯关事件（复盘"心理回放"的数据源） */
export interface SessionEvent {
  kind: string // 'hypothesis' | 'action' | 'identify'
  actionId: string
  gain: string
  cost: number
  /** 展示文本 */
  text: string
  danger: boolean
}

export interface MascotEventRec {
  id: string
  emoji: string
  line: string
  /** 关联的事件序号（插入到第几条事件后） */
  afterEventIndex: number
}

/** 假设板终局状态（open/Down?…：open | down | up | excluded | confirmed） */
export interface HypothesisStateRec {
  id: string
  status: string
}

export interface SessionRecord {
  sessionId: string
  caseId: string
  chapterId: string
  contentRevision: number
  scoringVersion: number
  occurredAt: string
  solved: boolean
  playerCost: number
  expertCost: number
  wrongIdentifies: number
  grade: string
  events: SessionEvent[]
  mascotEvents: MascotEventRec[]
  hStates: HypothesisStateRec[]
}

export interface ProgressOperation {
  opId: string
  kind: string
  occurredAt: string
  payload: any
}

const KEY_SESSION = 'think_session_v1'
const KEY_MASCOTS = 'think_mascots_v1'
const KEY_CASE = 'think_case_'
const KEY_OPS = 'think_progress_ops_v1'
const KEY_PROGRESS_UID = 'think_progress_uid'

export function progressIdentity(): string {
  const value = uni.getStorageSync(KEY_PROGRESS_UID)
  return value == null || (value as string).length === 0 ? 'guest' : value as string
}

export function setProgressIdentity(uid: string): void {
  uni.setStorageSync(KEY_PROGRESS_UID, uid)
}

export function progressStorageKey(key: string): string {
  return 'think_progress_' + progressIdentity() + '_' + key
}

export function progressStorageGet(key: string): any {
  const scoped = uni.getStorageSync(progressStorageKey(key))
  if (scoped == null && progressIdentity() === 'guest') return uni.getStorageSync(key)
  return scoped
}

export function progressStorageSet(key: string, value: any): void {
  uni.setStorageSync(progressStorageKey(key), value)
}

function enqueueOperation(kind: string, payload: any, occurredAt?: string): void {
  const raw = progressStorageGet(KEY_OPS)
  const ops: ProgressOperation[] = raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as ProgressOperation[]
  ops.push({ opId: String(Date.now()) + '-' + String(Math.random()), kind: kind, occurredAt: occurredAt ?? new Date().toISOString(), payload: payload })
  progressStorageSet(KEY_OPS, JSON.stringify(ops))
}

export function pendingProgressOperations(): ProgressOperation[] {
  const raw = progressStorageGet(KEY_OPS)
  return raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as ProgressOperation[]
}

export function confirmProgressOperations(ids: string[]): void {
  const done = new Set(ids)
  const left = pendingProgressOperations().filter((op) => !done.has(op.opId))
  progressStorageSet(KEY_OPS, JSON.stringify(left))
}

export function clearProgressLocal(): void {
  const info = uni.getStorageInfoSync()
  const prefix = 'think_progress_' + progressIdentity() + '_'
  const legacyKeys = ['think_session_v1', 'think_mascots_v1', 'think_streak_v1', 'think_tasks_v1', 'think_progress_ops_v1', 'think_daily_done_v1', 'think_checkuse_v1', 'think_solved_layers_v1', 'think_unlocked_chapters_v1']
  for (let i = 0; i < info.keys.length; i++) {
    const key = info.keys[i]
    if (key.indexOf(prefix) === 0 || (progressIdentity() === 'guest' && (key.indexOf('think_case_') === 0 || legacyKeys.indexOf(key) >= 0))) {
      uni.removeStorageSync(key)
    }
  }
}

function emptyMascotStats(): MascotStats {
  const m: MascotStats = { frog: 0, snail: 0, otter: 0, rabbit: 0, dino: 0 }
  return m
}

// —— 登录态写穿透：任何玩法数据写入 → 通知同步层推后端（监听由 sync-progress 注册）——
let progressListener: (() => void) | null = null

export function setProgressListener(cb: (() => void) | null) {
  progressListener = cb
}

export function notifyProgressDirty() {
  if (progressListener != null) progressListener()
}

/** 全量进度包（与后端 /api/me/progress 的 bundle 结构一一对应） */
export interface ProgressBundle {
  cases: { [id: string]: any }
  streak: any
  mascots: any
  tasks: any
  dailyDone: string
  checkuse: number
  solvedLayers: string[]
  unlockedChapterIds: string[]
}

/** 导出本地全量进度（登录态上传用） */
export function exportProgressBundle(): ProgressBundle {
  const cases: { [id: string]: any } = {}
  const info = uni.getStorageInfoSync()
  for (let i = 0; i < info.keys.length; i++) {
    const k = info.keys[i]
    const prefix = 'think_progress_' + progressIdentity() + '_' + KEY_CASE
    const legacyGuest = progressIdentity() === 'guest' && k.indexOf(KEY_CASE) === 0
    if (k.indexOf(prefix) !== 0 && !legacyGuest) continue
    const raw = uni.getStorageSync(k)
    if (raw == null || (raw as string).length === 0) continue
    try {
      cases[legacyGuest ? k.replace(KEY_CASE, '') : k.replace(prefix, '')] = JSON.parse(raw as string)
    } catch (e) {}
  }
  const b: ProgressBundle = {
    cases: cases,
    streak: getStreak(),
    mascots: getMascotStats(),
    tasks: loadTasks(),
    dailyDone: progressStorageGet('think_daily_done_v1') as string ?? '',
    checkuse: getChecklistUse(),
    solvedLayers: progressStorageGet(KEY_SOLVED_LAYERS) == null ? [] : JSON.parse(progressStorageGet(KEY_SOLVED_LAYERS) as string) as string[],
    unlockedChapterIds: getUnlockedChapterIds(),
  }
  return b
}

/** 导入后端全量进度（登录态拉取用，覆盖本地——后端为唯一事实源） */
export function importProgressBundle(b: ProgressBundle) {
  for (const id in b.cases) {
    progressStorageSet(KEY_CASE + id, JSON.stringify(b.cases[id]))
  }
  if (b.streak != null) progressStorageSet('think_streak_v1', JSON.stringify(b.streak))
  if (b.mascots != null) progressStorageSet('think_mascots_v1', JSON.stringify(b.mascots))
  if (b.tasks != null) progressStorageSet('think_tasks_v1', JSON.stringify(b.tasks))
  progressStorageSet('think_daily_done_v1', b.dailyDone ?? '')
  progressStorageSet('think_checkuse_v1', String(b.checkuse ?? 0))
  progressStorageSet(KEY_SOLVED_LAYERS, JSON.stringify(b.solvedLayers ?? []))
  progressStorageSet(KEY_UNLOCKED_CHAPTERS, JSON.stringify(b.unlockedChapterIds ?? []))
}

export function getCaseProgress(caseId: string): CaseProgress | null {
  const raw = progressStorageGet(KEY_CASE + caseId)
  if (raw == null) {
    return null
  }
  const str = raw as string
  if (str.length === 0) {
    return null
  }
  try {
    return JSON.parse(str) as CaseProgress
  } catch (e) {
    return null
  }
}

export function saveSession(record: SessionRecord): void {
  progressStorageSet(KEY_SESSION, JSON.stringify(record))
  // 连续天数只认破案：失败局不再续活跃
  if (record.solved) {
    touchStreak()
    bumpTask('win', 1)
    bumpTask('casewin7', 1)
  }

  // 合并案例进度
  const key = KEY_CASE + record.caseId
  let bestGrade = record.grade
  let bestCost = record.solved ? record.playerCost : 0
  const prev = getCaseProgress(record.caseId)
  if (prev != null) {
    const sameScoreVersion = prev.contentRevision === record.contentRevision && prev.scoringVersion === record.scoringVersion
    if (sameScoreVersion && (prev.bestGrade === 'S' || (record.grade !== 'S' && gradeRank(prev.bestGrade) <= gradeRank(record.grade)))) {
      bestGrade = prev.bestGrade
    }
    if (sameScoreVersion && prev.solved && (!record.solved || prev.bestCost < bestCost)) {
      bestCost = prev.bestCost
    }
  }
  const prevFails: number = prev != null && prev.fails > 0 ? prev.fails : 0
  const progress: CaseProgress = {
    solved: prev != null ? prev.solved || record.solved : record.solved,
    bestGrade: bestGrade,
    bestCost: bestCost,
    plays: prev != null ? prev.plays + 1 : 1,
    fails: prevFails + (record.solved ? 0 : 1),
    contentRevision: record.contentRevision,
    scoringVersion: record.scoringVersion,
  }
  progressStorageSet(key, JSON.stringify(progress))

  // 错案重练：曾失败的关本次破案 → 任务计数
  if (record.solved && prevFails > 0) {
    bumpTask('retrain', 1)
  }

  // 累加动物出场统计
  const stats = getMascotStats()
  for (let i = 0; i < record.mascotEvents.length; i++) {
    const id = record.mascotEvents[i].id
    if (id === 'frog') {
      stats.frog++
    } else if (id === 'snail') {
      stats.snail++
    } else if (id === 'otter') {
      stats.otter++
    } else if (id === 'rabbit') {
      stats.rabbit++
    } else if (id === 'dino') {
      stats.dino++
    }
  }
  progressStorageSet(KEY_MASCOTS, JSON.stringify(stats))
  enqueueOperation('session_end', {
    sessionId: record.sessionId,
    caseId: record.caseId,
    chapterId: record.chapterId,
    contentRevision: record.contentRevision,
    scoringVersion: record.scoringVersion,
    occurredAt: record.occurredAt,
    solved: record.solved,
    grade: record.grade,
    playerCost: record.playerCost,
    expertCost: record.expertCost,
    mascotEvents: record.mascotEvents,
  }, record.occurredAt)
  notifyProgressDirty()
}

function gradeRank(grade: string): number {
  if (grade === 'S') return 0
  if (grade === 'A') return 1
  if (grade === 'B') return 2
  return 3
}

export function getLastSession(): SessionRecord | null {
  const raw = progressStorageGet(KEY_SESSION)
  if (raw == null) {
    return null
  }
  const str = raw as string
  if (str.length === 0) {
    return null
  }
  try {
    return JSON.parse(str) as SessionRecord
  } catch (e) {
    return null
  }
}

export function getMascotStats(): MascotStats {
  const raw = progressStorageGet(KEY_MASCOTS)
  if (raw == null) {
    return emptyMascotStats()
  }
  const str = raw as string
  if (str.length === 0) {
    return emptyMascotStats()
  }
  try {
    return JSON.parse(str) as MascotStats
  } catch (e) {
    return emptyMascotStats()
  }
}

/** 检查单核对次数（指认前打开核对即计数） */
const KEY_CHECKUSE = 'think_checkuse_v1'

export function bumpChecklistUse(): number {
  const n = getChecklistUse() + 1
  progressStorageSet(KEY_CHECKUSE, String(n))
  enqueueOperation('checklist_use', {})
  notifyProgressDirty()
  return n
}

export function getChecklistUse(): number {
  const v = progressStorageGet(KEY_CHECKUSE)
  return Number(v) || 0
}

/** 连续天数（每次 saveSession 触发） */
export interface StreakData {
  last: string
  count: number
}

const KEY_STREAK = 'think_streak_v1'
const KEY_FIRST = 'think_first_v1'

function dateStr(d: Date): string {
  const m = d.getMonth() + 1
  const day = d.getDate()
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : String(m)) + '-' + (day < 10 ? '0' + day : String(day))
}

export function getStreak(): StreakData {
  const raw = progressStorageGet(KEY_STREAK)
  if (raw == null) {
    const empty: StreakData = { last: '', count: 0 }
    return empty
  }
  const str = raw as string
  if (str.length === 0) {
    const empty: StreakData = { last: '', count: 0 }
    return empty
  }
  try {
    return JSON.parse(str) as StreakData
  } catch (e) {
    const empty: StreakData = { last: '', count: 0 }
    return empty
  }
}

function touchStreak(): StreakData {
  const today = dateStr(new Date())
  const s = getStreak()
  if (s.last === today) {
    return s
  }
  const yest = new Date(Date.now() - 86400000)
  const next: StreakData = { last: today, count: s.last === dateStr(yest) ? s.count + 1 : 1 }
  progressStorageSet(KEY_STREAK, JSON.stringify(next))
  return next
}

/** 首次使用至今的天数（个人中心"第 N 天"） */
export function useDay(): number {
  let first = progressStorageGet(KEY_FIRST) as string
  if (first == null || first.length === 0) {
    first = dateStr(new Date())
    progressStorageSet(KEY_FIRST, first)
  }
  const parts = first.split('-')
  if (parts.length !== 3) return 1
  const firstMs = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime()
  const diff = Math.floor((Date.now() - firstMs) / 86400000) + 1
  return diff > 0 ? diff : 1
}

/** 统计：已破案数 / 已收集检查单数（供首页、手册、我的使用） */
export interface Totals {
  solved: number
  lessons: number
  metMascots: number
}

export function getTotals(allCaseIds: string[], lessonsPerCase: number[]): Totals {
  let solved = 0
  let lessons = 0
  for (let i = 0; i < allCaseIds.length; i++) {
    const p = getCaseProgress(allCaseIds[i])
    if (p != null && p.solved) {
      solved++
      lessons += lessonsPerCase[i]
    }
  }
  const m = getMascotStats()
  let met = 0
  if (m.frog > 0) met++
  if (m.snail > 0) met++
  if (m.otter > 0) met++
  if (m.rabbit > 0) met++
  if (m.dino > 0) met++
  const t: Totals = { solved: solved, lessons: lessons, metMascots: met }
  return t
}

/** 任务进度：每日（date 重置）与每周（weekKey 重置）分开存。
 *  metric 计数由各埋点调用 bumpTask(metric) 累加。 */
export interface TaskProgress {
  day: string
  week: string
  daily: { [key: string]: number }
  weekly: { [key: string]: number }
}

const KEY_TASKS = 'think_tasks_v1'
const KEY_SOLVED_LAYERS = 'think_solved_layers_v1'
const KEY_UNLOCKED_CHAPTERS = 'think_unlocked_chapters_v1'

function dayStr(d: Date): string {
  const m = d.getMonth() + 1
  const day = d.getDate()
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : String(m)) + '-' + (day < 10 ? '0' + day : String(day))
}

function weekStr(d: Date): string {
  // 简化周键：以周一日期为周标识
  const day = d.getDay()
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((day + 6) % 7))
  return dayStr(monday)
}

function emptyProgress(): TaskProgress {
  const now = new Date()
  const t: TaskProgress = { day: '', week: '', daily: {}, weekly: {} }
  t.day = dayStr(now)
  t.week = weekStr(now)
  return t
}

function loadTasks(): TaskProgress {
  const raw = progressStorageGet(KEY_TASKS)
  if (raw == null || (raw as string).length === 0) {
    return emptyProgress()
  }
  try {
    const t = JSON.parse(raw as string) as TaskProgress
    const now = new Date()
    if (t.day !== dayStr(now)) {
      t.day = dayStr(now)
      t.daily = {}
    }
    if (t.week !== weekStr(now)) {
      t.week = weekStr(now)
      t.weekly = {}
    }
    return t
  } catch (e) {
    return emptyProgress()
  }
}

export function bumpTask(metric: string, n: number): void {
  const t = loadTasks()
  if (t.daily[metric] == null) t.daily[metric] = 0
  t.daily[metric] = t.daily[metric] + n
  if (t.weekly[metric] == null) t.weekly[metric] = 0
  t.weekly[metric] = t.weekly[metric] + n
  progressStorageSet(KEY_TASKS, JSON.stringify(t))
  if (metric === 'hypo') enqueueOperation('task_increment', { metric: metric, amount: n })
  notifyProgressDirty()
}

export function recordSolvedLayer(layer: string): boolean {
  const raw = progressStorageGet(KEY_SOLVED_LAYERS)
  const layers: string[] = raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as string[]
  if (layers.indexOf(layer) >= 0) return false
  layers.push(layer)
  progressStorageSet(KEY_SOLVED_LAYERS, JSON.stringify(layers))
  return true
}

export function getUnlockedChapterIds(): string[] {
  const raw = progressStorageGet(KEY_UNLOCKED_CHAPTERS)
  return raw == null || (raw as string).length === 0 ? [] : JSON.parse(raw as string) as string[]
}

export function rememberUnlockedChapterIds(ids: string[]): void {
  const current = getUnlockedChapterIds()
  const added: string[] = []
  for (let i = 0; i < ids.length; i++) {
    if (current.indexOf(ids[i]) < 0) {
      current.push(ids[i])
      added.push(ids[i])
    }
  }
  if (added.length === 0) return
  progressStorageSet(KEY_UNLOCKED_CHAPTERS, JSON.stringify(current))
  enqueueOperation('unlocked_chapters', { chapterIds: added })
  notifyProgressDirty()
}

export function getTaskDaily(metric: string): number {
  return loadTasks().daily[metric] || 0
}

export function getTaskWeekly(metric: string): number {
  return loadTasks().weekly[metric] || 0
}

// sync v2: cache-bust
