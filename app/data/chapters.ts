/** 篇-章-关目录：必修与挑战关按冻结课程管理，新题默认进入章内选做。 */
import { CASE_CATALOG, getEffectiveCases, MAINLINE_CASE_IDS, TRIAL_CASE_IDS } from './cases'
import { COURSE_CASE_IDS, LEGACY_CASE_CATALOG } from './course'
import { DiagnosisCase } from '../types/case'
import { getCaseProgress, getUnlockedChapterIds, rememberUnlockedChapterIds, progressIdentity, progressStorageGet, progressStorageSet } from '../utils/storage'
import { getRemoteCases } from '../utils/sync'
import { isLoggedIn } from '../utils/auth'

export interface PartDef {
  id: string
  name: string
  desc: string
}

export interface ChapterDef {
  id: string
  part: string
  no: string
  name: string
  pact: string
}

export const PARTS: PartDef[] = [
  { id: 'apprentice', name: '侦探学徒篇', desc: '各层入门教学关，建立"假设-验证-结论"的基本功' },
  { id: 'engineer', name: '一线工兵篇', desc: '标准难度的真实故障，练习成本纪律与假设收缩' },
  { id: 'master', name: '资深值班篇', desc: '高噪声与叠加故障，练到条件反射' },
]

export const CHAPTERS: ChapterDef[] = [
  { id: 'error-reading', part: 'apprentice', no: '第 1 章', name: '读懂报错', pact: '报错不是噪音，是地图——堆栈的每一行都在告诉你去哪看' },
  { id: 'access', part: 'apprentice', no: '第 2 章', name: '接入层之夜', pact: 'TLS 是两端协商，任何一侧校验策略的差异都会造成"部分失败"' },
  { id: 'build', part: 'apprentice', no: '第 3 章', name: '构建与依赖', pact: '构建产物与运行环境的差异，是白屏的高发地带' },
  { id: 'integration', part: 'apprentice', no: '第 4 章', name: '联调之夜', pact: '联调问题的第一问：数据在哪一层变了形——每一跳都要留证' },
  { id: 'contract', part: 'engineer', no: '第 1 章', name: '接口与契约', pact: '接口是两个系统的契约——每一次变更都要对面还认' },
  { id: 'data', part: 'engineer', no: '第 2 章', name: '数据的脾气', pact: '缓存与数据库之间，永远隔着一致性窗口' },
  { id: 'config-boot', part: 'engineer', no: '第 3 章', name: '配置与启动', pact: '应用启动的每一秒都在读环境——配置的默认值就是它在生产的命运' },
  { id: 'runtime', part: 'engineer', no: '第 4 章', name: '运行时暗面', pact: '内存与连接是有生命周期的资源' },
  { id: 'concurrency', part: 'master', no: '第 1 章', name: '并发迷宫', pact: '时间与顺序是隐藏的维度：竞态只在重放时现形' },
  { id: 'observability', part: 'master', no: '第 2 章', name: '可观测性迷雾', pact: '你看到的日志和指标，本身也会说谎' },
  { id: 'security', part: 'master', no: '第 3 章', name: '安全攻防', pact: '每一个便利的捷径，都可能是别人进来的门' },
  { id: 'evolution', part: 'master', no: '第 4 章', name: '架构演进', pact: '故障的种子在设计时种下——容量、限流、降级是偿还' },
  { id: 'messaging', part: 'master', no: '第 5 章', name: '消息与异步', pact: '消息不是数据，是承诺——发出去就要到，到了就要对，对了就只能一次' },
  { id: 'deployment', part: 'master', no: '第 6 章', name: '部署与发布', pact: '上线不是终点，是另一次排错的起点' },
  { id: 'network', part: 'master', no: '第 7 章', name: '网络深处', pact: '你以为是代码的问题，其实是网络在偷偷改你的数据' },
  { id: 'testing', part: 'master', no: '第 8 章', name: '测试与质量', pact: '测试是代码的镜子——照不出问题的时候，问题最大' },
]

export { MAINLINE_CASE_IDS, TRIAL_CASE_IDS }

/** 章内先展示冻结主线，再展示选做；所有入口采用同一有效题目修订。
 *  进程内缓存：按 getEffectiveCases 引用校验（换包自动重建）；isCasePlayable/列表渲染每帧多次调用。
 *  缓存数组按引用返回，调用方只读。 */
const chapterCasesCache = new Map<string, DiagnosisCase[]>()
let chapterCasesSource: DiagnosisCase[] | null = null

export function casesInChapter(chapterId: string): DiagnosisCase[] {
  const source = getEffectiveCases()
  if (chapterCasesSource !== source) {
    chapterCasesCache.clear()
    chapterCasesSource = source
  }
  const hit = chapterCasesCache.get(chapterId)
  if (hit != null) return hit
  const merged = source.filter((c) => c.chapterId === chapterId)
  const out = merged.sort((a, b) => {
    const aMainline = MAINLINE_CASE_IDS.indexOf(a.id)
    const bMainline = MAINLINE_CASE_IDS.indexOf(b.id)
    if (aMainline >= 0 || bMainline >= 0) {
      if (aMainline < 0) return 1
      if (bMainline < 0) return -1
      return aMainline - bMainline
    }
    const aCommunity = CASE_CATALOG[a.id] == null && a.sourceType !== 'official'
    const bCommunity = CASE_CATALOG[b.id] == null && b.sourceType !== 'official'
    if (aCommunity !== bCommunity) return aCommunity ? 1 : -1
    return a.order - b.order
  })
  chapterCasesCache.set(chapterId, out)
  return out
}

/** 篇内全部章 */
export function chaptersInPart(partId: string): ChapterDef[] {
  return CHAPTERS.filter((c) => c.part === partId)
}

const KEY_LEGACY_CAPTURED = 'think_course_20261104_captured'

// 一次性标记按身份域记忆：KEY_LEGACY_CAPTURED 是按身份隔离的，
// 游客捕获后登录还要为新身份再捕获一次（prepareProgressIdentity 在覆盖进度前调用）
let legacyCapturedUid: string = ''

/** 在切换身份或覆盖旧 casepack 前调用；仅按迁移时可证明的旧规则保留资格。 */
export function preserveLegacyChapterUnlocks(): void {
  const uid = progressIdentity()
  if (legacyCapturedUid === uid) return
  if (progressStorageGet(KEY_LEGACY_CAPTURED) === '1') {
    legacyCapturedUid = uid
    return
  }
  const oldCases = LEGACY_CASE_CATALOG.slice()
  for (const item of getRemoteCases()) {
    if (!oldCases.some((c) => c.id === item.id)) oldCases.push({ id: item.id, chapterId: item.chapterId, order: item.order })
  }
  const unlocked: string[] = []
  for (const part of PARTS) {
    const chapters = chaptersInPart(part.id)
    for (let i = 0; i < chapters.length; i++) {
      const current = oldCases.filter((c) => c.chapterId === chapters[i].id).sort((a, b) => a.order - b.order)
      const challenge = current.length > 0 ? getCaseProgress(current[0].id) : null
      const previous = i > 0 ? oldCases.filter((c) => c.chapterId === chapters[i - 1].id) : []
      const completed = previous.length > 0 && previous.every((c) => getCaseProgress(c.id)?.solved === true)
      if (i === 0 || challenge?.solved === true || completed) unlocked.push(chapters[i].id)
    }
  }
  progressStorageSet(KEY_LEGACY_CAPTURED, '1')
  rememberUnlockedChapterIds(unlocked)
  legacyCapturedUid = uid
}

/** 章内已破案数（本地 + 远端 casepack） */
export function chapterSolvedCount(chapterId: string): number {
  const list = casesInChapter(chapterId)
  let n = 0
  for (let i = 0; i < list.length; i++) {
    const p = getCaseProgress(list[i].id)
    if (p != null && p.solved) n++
  }
  return n
}

/** 章所属篇 id（未知返回空串） */
export function chapterPartId(chapterId: string): string {
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (CHAPTERS[i].id === chapterId) return CHAPTERS[i].part
  }
  return ''
}

/** 章在篇内的下标（0 起 = 篇首章；未知返回 -1） */
export function chapterIndexInPart(chapterId: string): number {
  const partId = chapterPartId(chapterId)
  if (partId.length === 0) return -1
  const list = chaptersInPart(partId)
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === chapterId) return i
  }
  return -1
}

/** 锁定提示语（章页 toast / 首页弹窗共用）；游客态引导登录 */
export function chapterUnlockHint(chapterId: string): string {
  if (!isLoggedIn()) {
    return '登录保存破案记录，按学习顺序继续或参加跳级挑战'
  }
  return '通关上一章主线关卡，或通过本章跳级挑战'
}

/** 本章跳级挑战关是否已通关（跳级承诺：赢了立即解锁本章） */
function challengeSolved(chapterId: string): boolean {
  const cid = chapterChallengeCaseId(chapterId)
  if (cid.length === 0) return false
  const p = getCaseProgress(cid)
  return p != null && p.solved
}

/** 冻结必修全部通过即完成；新题、选做题和远端排序不扩大要求。 */
export function chapterCompleted(chapterId: string): boolean {
  const required = COURSE_CASE_IDS[chapterId]
  for (let i = 0; i < required.length; i++) {
    const p = getCaseProgress(required[i])
    if (p == null || !p.solved) return false
  }
  return true
}

/** 章解锁：游客 = 仅免费章；已登录 = 每篇第 1 章恒开 ∥ 本章跳级挑战已通关 ∥ 前一章全部通关 */
export function isChapterUnlocked(chapterId: string): boolean {
  preserveLegacyChapterUnlocks()
  if (!isLoggedIn()) return chapterId === 'error-reading'
  if (getUnlockedChapterIds().indexOf(chapterId) >= 0) return true
  const idx = chapterIndexInPart(chapterId)
  const list = chaptersInPart(chapterPartId(chapterId))
  const unlocked = idx === 0 || challengeSolved(chapterId) || chapterCompleted(list[idx - 1].id)
  if (unlocked) rememberUnlockedChapterIds([chapterId])
  return unlocked
}

/** 跳级挑战固定为冻结目录首关，不被新题或重排序改变。 */
export function chapterChallengeCaseId(chapterId: string): string {
  return COURSE_CASE_IDS[chapterId][0]
}

/** 关可玩：游客 = 免费章前 N 关；已登录 = 所在章已解锁 ∥ 是本章挑战关。
 *  未知关返回 false（play 页另有"案例不存在"兜底） */
export function isCasePlayable(caseId: string): boolean {
  if (!isLoggedIn()) return TRIAL_CASE_IDS.indexOf(caseId as (typeof TRIAL_CASE_IDS)[number]) >= 0
  for (let i = 0; i < CHAPTERS.length; i++) {
    const cases = casesInChapter(CHAPTERS[i].id)
    for (let j = 0; j < cases.length; j++) {
      if (cases[j].id === caseId) {
        if (isChapterUnlocked(CHAPTERS[i].id)) return true
        return chapterChallengeCaseId(CHAPTERS[i].id) === caseId
      }
    }
  }
  return false
}
