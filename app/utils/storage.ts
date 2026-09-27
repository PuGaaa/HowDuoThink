/**
 * 本地进度存储（v0 无后端）。
 * 存储设计规避 uts 动态索引：每个案例独立 key，动物统计用固定字段。
 */

export interface CaseProgress {
  solved: boolean
  bestGrade: string
  bestCost: number
  plays: number
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
  caseId: string
  solved: boolean
  playerCost: number
  expertCost: number
  wrongIdentifies: number
  grade: string
  events: SessionEvent[]
  mascotEvents: MascotEventRec[]
  hStates: HypothesisStateRec[]
}

const KEY_SESSION = 'think_session_v1'
const KEY_MASCOTS = 'think_mascots_v1'
const KEY_CASE = 'think_case_'

function emptyMascotStats(): MascotStats {
  const m: MascotStats = { frog: 0, snail: 0, otter: 0, rabbit: 0, dino: 0 }
  return m
}

export function getCaseProgress(caseId: string): CaseProgress | null {
  const raw = uni.getStorageSync(KEY_CASE + caseId)
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
  uni.setStorageSync(KEY_SESSION, JSON.stringify(record))
  touchStreak()

  // 合并案例进度
  const key = KEY_CASE + record.caseId
  let bestGrade = record.grade
  let bestCost = record.playerCost
  const prev = getCaseProgress(record.caseId)
  if (prev != null) {
    if (prev.bestGrade === 'S' || (record.grade !== 'S' && gradeRank(prev.bestGrade) <= gradeRank(record.grade))) {
      bestGrade = prev.bestGrade
    }
    if (prev.bestCost < bestCost) {
      bestCost = prev.bestCost
    }
  }
  const progress: CaseProgress = {
    solved: prev != null ? prev.solved || record.solved : record.solved,
    bestGrade: bestGrade,
    bestCost: bestCost,
    plays: prev != null ? prev.plays + 1 : 1,
  }
  uni.setStorageSync(key, JSON.stringify(progress))

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
  uni.setStorageSync(KEY_MASCOTS, JSON.stringify(stats))
}

function gradeRank(grade: string): number {
  if (grade === 'S') return 0
  if (grade === 'A') return 1
  if (grade === 'B') return 2
  return 3
}

export function getLastSession(): SessionRecord | null {
  const raw = uni.getStorageSync(KEY_SESSION)
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
  const raw = uni.getStorageSync(KEY_MASCOTS)
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
  const raw = uni.getStorageSync(KEY_STREAK)
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
  uni.setStorageSync(KEY_STREAK, JSON.stringify(next))
  return next
}

/** 首次使用至今的天数（个人中心"第 N 天"） */
export function useDay(): number {
  let first = uni.getStorageSync(KEY_FIRST) as string
  if (first == null || first.length === 0) {
    first = dateStr(new Date())
    uni.setStorageSync(KEY_FIRST, first)
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
