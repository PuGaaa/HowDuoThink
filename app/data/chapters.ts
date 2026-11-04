/** 篇-章-关三级内容架构。
 *  篇 = 学习阶段（三篇）；章 = 层的契约（可无限加，6~12 关封顶）；
 *  关 = 案例（带 part/typeTags/order），章内容按 layerKey 动态聚合——加第 101 关只需打标，不改本章。 */
import { ALL_CASES, MAINLINE_CASE_IDS, TRIAL_CASE_IDS } from './cases'
import { DiagnosisCase } from '../types/case'
import { getCaseProgress } from '../utils/storage'
import { getRemoteCases } from '../utils/sync'
import { isLoggedIn } from '../utils/auth'
import { getGuestFreeChapter, getGuestFreeLevels } from '../utils/app-config'

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

/** 章内关卡：按 chapterId 动态聚合 + order 排序；本地与远端（casepack）合并，按 id 去重 */
export function casesInChapter(chapterId: string): DiagnosisCase[] {
  const merged: DiagnosisCase[] = []
  const seen: string[] = []
  const push = (c: DiagnosisCase) => {
    if (seen.indexOf(c.id) < 0) {
      seen.push(c.id)
      merged.push(c)
    }
  }
  for (let i = 0; i < ALL_CASES.length; i++) {
    if (ALL_CASES[i].chapterId === chapterId) push(ALL_CASES[i])
  }
  const remote = getRemoteCases()
  for (let i = 0; i < remote.length; i++) {
    const c = remote[i]
    if (c != null && c.chapterId === chapterId && seen.indexOf(c.id) < 0) push(c)
  }
  return merged.sort((a, b) => {
    const aMainline = MAINLINE_CASE_IDS.indexOf(a.id as (typeof MAINLINE_CASE_IDS)[number])
    const bMainline = MAINLINE_CASE_IDS.indexOf(b.id as (typeof MAINLINE_CASE_IDS)[number])
    if (aMainline >= 0 || bMainline >= 0) {
      if (aMainline < 0) return 1
      if (bMainline < 0) return -1
      return aMainline - bMainline
    }
    return a.order - b.order
  })
}

/** 篇内全部章 */
export function chaptersInPart(partId: string): ChapterDef[] {
  return CHAPTERS.filter((c) => c.part === partId)
}

// —— 解锁：游客留存门禁 + 进度解锁 ————————————————
// 游客（未登录）：仅开放学徒篇第 1 章前 N 关，其余章节/关卡引导登录（utils/login-guide.ts）。
// 已登录：沿用进度规则——每篇第 1 章恒开（编号按篇起算，篇首即入口）；
//   章解锁 = 前一章全部通关 ∥ 本章跳级挑战已通关；跳级挑战 = 锁定章的 order 最小关恒可玩，
//   通关即解锁本章。全部从 solved 进度派生，无独立存储。

// 游客免费章 / 免费关数：管理端「系统设置」下发（utils/app-config），拉取失败退内置默认

/** 目标关是否在游客免费范围（rankInChapter = casesInChapter 升序中的下标） */
function inGuestFreeScope(chapterId: string, rankInChapter: number): boolean {
  return chapterId === getGuestFreeChapter() && rankInChapter < getGuestFreeLevels()
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
    return chapterId === getGuestFreeChapter() ? '登录后解锁本关' : '登录后解锁本章，继续侦探之旅'
  }
  return '通关上一章全部关卡，解锁本章'
}

/** 本章跳级挑战关是否已通关（跳级承诺：赢了立即解锁本章） */
function challengeSolved(chapterId: string): boolean {
  const cid = chapterChallengeCaseId(chapterId)
  if (cid.length === 0) return false
  const p = getCaseProgress(cid)
  return p != null && p.solved
}

/** 章全部通关（每关都已破案） */
export function chapterCompleted(chapterId: string): boolean {
  const list = casesInChapter(chapterId)
  if (list.length === 0) return false
  for (let i = 0; i < list.length; i++) {
    const p = getCaseProgress(list[i].id)
    if (p == null || !p.solved) return false
  }
  return true
}

/** 章解锁：游客 = 仅免费章；已登录 = 每篇第 1 章恒开 ∥ 本章跳级挑战已通关 ∥ 前一章全部通关 */
export function isChapterUnlocked(chapterId: string): boolean {
  if (!isLoggedIn()) return chapterId === getGuestFreeChapter()
  const idx = chapterIndexInPart(chapterId)
  if (idx <= 0) return true
  if (challengeSolved(chapterId)) return true
  const list = chaptersInPart(chapterPartId(chapterId))
  return chapterCompleted(list[idx - 1].id)
}

/** 章的跳级挑战关：order 最小（casesInChapter 已按 order 升序，取首关） */
export function chapterChallengeCaseId(chapterId: string): string {
  const list = casesInChapter(chapterId)
  return list.length > 0 ? list[0].id : ''
}

/** 关可玩：游客 = 免费章前 N 关；已登录 = 所在章已解锁 ∥ 是本章挑战关。
 *  未知关返回 false（play 页另有"案例不存在"兜底） */
export function isCasePlayable(caseId: string): boolean {
  for (let i = 0; i < CHAPTERS.length; i++) {
    const cases = casesInChapter(CHAPTERS[i].id)
    for (let j = 0; j < cases.length; j++) {
      if (cases[j].id === caseId) {
        if (!isLoggedIn()) return inGuestFreeScope(CHAPTERS[i].id, j)
        if (isChapterUnlocked(CHAPTERS[i].id)) return true
        return chapterChallengeCaseId(CHAPTERS[i].id) === caseId
      }
    }
  }
  return false
}
