/** 进度云同步（登录态）：后端为唯一事实源。
 *  拉取：GET 全量 bundle → 与本地并集合并（见 pullServerProgress；登录/每次回到首页时执行）；
 *  推送：任何玩法数据写入（storage 写穿透）→ 2s 防抖全量上传；
 *  手动同步 = 先推后拉。未登录（游客态）全部为本地，无网络行为。 */
import { API_BASE } from '../config'
import { preserveLegacyChapterUnlocks } from '../data/chapters'
import { getToken, isLoggedIn } from './auth'
import { clearProgressLocal, confirmProgressOperations, exportProgressBundle, getCaseProgress, getUnlockedChapterIds, importProgressBundle, invalidateCaseProgressCache, pendingProgressOperations, progressIdentity, progressStorageGet, progressStorageKey, progressStorageSet, setProgressIdentity, setProgressListener } from './storage'

const KEY_LAST_SYNC = 'think_last_sync'

export function prepareProgressIdentity(uid: string): void {
  // 身份合并后强制下一次同步全量应用：指纹跨身份残留会让 bootstrap 重放被跳过
  lastProjectionFp = ''
  const previous = progressIdentity()
  if (previous === 'guest') {
    preserveLegacyChapterUnlocks()
    const bundle = exportProgressBundle()
    const guestOperations = pendingProgressOperations()
    setProgressIdentity('guest')
    clearProgressLocal()
    setProgressIdentity(uid)
    preserveLegacyChapterUnlocks()
    const operations = pendingProgressOperations()
    if (Object.keys(bundle.cases).length > 0 || Object.keys(bundle.mascots).length > 0 || Object.keys(bundle.tasks).length > 0 || bundle.dailyDone.length > 0 || bundle.checkuse > 0 || bundle.solvedLayers.length > 0 || bundle.unlockedChapterIds.length > 0) {
      const archiveId = 'archive-' + String(Date.now()) + '-' + String(Math.random())
      operations.push({ opId: 'bootstrap-' + archiveId, kind: 'bootstrap', occurredAt: new Date().toISOString(), payload: { archiveId: archiveId, bundle: bundle } })
    }
    // uts 原生端数组展开 push 存在兼容性风险，改为等价循环
    for (let i = 0; i < guestOperations.length; i++) {
      operations.push(guestOperations[i])
    }
    progressStorageSet('think_progress_ops_v1', JSON.stringify(operations))
    return
  }
  setProgressIdentity(uid)
}

export function lastSyncLabel(): string {
  const v = progressStorageGet(KEY_LAST_SYNC)
  return v == null || (v as string).length === 0 ? '' : v as string
}

function markSynced() {
  const d = new Date()
  const hh = d.getHours() < 10 ? '0' + d.getHours() : String(d.getHours())
  const mm = d.getMinutes() < 10 ? '0' + d.getMinutes() : String(d.getMinutes())
  progressStorageSet(KEY_LAST_SYNC, '今天 ' + hh + ':' + mm)
}

// 投影指纹（含身份域）：服务端投影未变化时跳过整套覆盖写入——
// 覆盖路径含 getStorageInfoSync 全量枚举（iOS 真机慢）与逐键校验写，是高频回首页的最后一处重活。
// 跳过是安全的：本地状态 = 上次投影 + 未确认操作重放 + 写穿透的实时写，投影未变则无需任何写。
let lastProjectionFp = ''

function applyServerProjection(d: any): void {
  const fp = progressIdentity() + ':' + JSON.stringify(d)
  if (fp === lastProjectionFp) {
    markSynced()
    return
  }
  lastProjectionFp = fp
  const solvedLayers = progressStorageGet('think_solved_layers_v1')
  // 案例进度缓存随投影整体重建：先清缓存再覆盖写入
  invalidateCaseProgressCache()
  importProgressBundle({
    cases: d.cases ?? {},
    streak: d.streak ?? {},
    mascots: d.mascots ?? {},
    tasks: d.tasks ?? {},
    dailyDone: d.dailyDone ?? '',
    checkuse: d.checkuse ?? 0,
    solvedLayers: [],
    unlockedChapterIds: d.unlockedChapterIds ?? [],
  })
  // 投影替换语义：服务端已不存在的本地案例清掉（只删缺席项，不再全删重写）
  const serverCases = (d.cases ?? {}) as { [id: string]: any }
  const casePrefix = progressStorageKey('think_case_')
  const serverKeys = new Set<string>()
  for (const id in serverCases) serverKeys.add(casePrefix + id)
  const info = uni.getStorageInfoSync()
  for (let i = 0; i < info.keys.length; i++) {
    const k = info.keys[i]
    if (k.indexOf(casePrefix) === 0 && !serverKeys.has(k)) uni.removeStorageSync(k)
  }
  progressStorageSet('think_solved_layers_v1', solvedLayers == null ? '[]' : solvedLayers)
  // 覆盖抹掉了本地未确认操作的效果：重放一遍（fp 未变时本地本就含这些效果，不能重放以免二次计数）
  replayPendingOperations(pendingProgressOperations())
  markSynced()
}

function replayTask(metric: string, amount: number): void {
  const raw = progressStorageGet('think_tasks_v1')
  const tasks = raw == null || (raw as string).length === 0 ? { day: '', week: '', daily: {}, weekly: {} } : JSON.parse(raw as string)
  tasks.daily[metric] = (tasks.daily[metric] ?? 0) + amount
  tasks.weekly[metric] = (tasks.weekly[metric] ?? 0) + amount
  progressStorageSet('think_tasks_v1', JSON.stringify(tasks))
}

function replayPendingOperations(operations: any[]): void {
  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i]
    if (operation.kind === 'bootstrap') {
      importProgressBundle(operation.payload.bundle)
      continue
    }
    if (operation.kind === 'session_end') {
      const p = operation.payload
      const raw = progressStorageGet('think_case_' + p.caseId)
      const current = raw == null || (raw as string).length === 0 ? { solved: false, bestGrade: '', bestCost: 0, plays: 0, fails: 0 } : JSON.parse(raw as string)
      const localSolved = current.solved
      const hadFailure = (current.fails ?? 0) > 0
      current.solved = current.solved || p.solved
      current.plays = (current.plays ?? 0) + 1
      current.fails = (current.fails ?? 0) + (p.solved ? 0 : 1)
      const newerScoreVersion = current.contentRevision == null || p.contentRevision > current.contentRevision || (p.contentRevision === current.contentRevision && p.scoringVersion >= current.scoringVersion)
      if (newerScoreVersion) {
        if (current.contentRevision !== p.contentRevision || current.scoringVersion !== p.scoringVersion) {
          current.bestGrade = ''
          current.bestCost = 0
        }
        if (p.grade === 'S' || (current.bestGrade !== 'S' && (current.bestGrade === '' || p.grade < current.bestGrade))) current.bestGrade = p.grade
        if (p.solved && (!localSolved || current.bestCost == null || p.playerCost < current.bestCost)) current.bestCost = p.playerCost
        current.contentRevision = p.contentRevision
        current.scoringVersion = p.scoringVersion
      }
      progressStorageSet('think_case_' + p.caseId, JSON.stringify(current))
      if (p.solved) {
        replayTask('win', 1)
        if (hadFailure) replayTask('retrain', 1)
      }
      const mascots = JSON.parse((progressStorageGet('think_mascots_v1') as string) || '{}')
      for (let j = 0; j < p.mascotEvents.length; j++) mascots[p.mascotEvents[j].id] = (mascots[p.mascotEvents[j].id] ?? 0) + 1
      progressStorageSet('think_mascots_v1', JSON.stringify(mascots))
      continue
    }
    if (operation.kind === 'checklist_use') {
      progressStorageSet('think_checkuse_v1', String((Number(progressStorageGet('think_checkuse_v1')) || 0) + 1))
      replayTask('checkuse', 1)
      continue
    }
    if (operation.kind === 'task_increment') {
      replayTask(operation.payload.metric, operation.payload.amount)
      continue
    }
    if (operation.kind === 'unlocked_chapters') {
      const ids = getUnlockedChapterIds()
      for (let j = 0; j < operation.payload.chapterIds.length; j++) if (ids.indexOf(operation.payload.chapterIds[j]) < 0) ids.push(operation.payload.chapterIds[j])
      progressStorageSet('think_unlocked_chapters_v1', JSON.stringify(ids))
      continue
    }
    if (operation.kind === 'daily_done') {
      progressStorageSet('think_daily_done_v1', operation.payload.day)
      replayTask('dailycase', 1)
    }
  }
}

/** 操作同步（登录态；游客态为空操作） */
export function pushProgress(cb?: (r: { error: string }) => void) {
  if (!isLoggedIn()) {
    if (cb != null) cb({ error: '登录后可用' })
    return
  }
  const requestUid = progressIdentity()
  const requestToken = getToken()
  const sentOperations = pendingProgressOperations()
  uni.request({
    url: API_BASE + '/api/me/progress/sync',
    method: 'POST',
    header: { Authorization: 'Bearer ' + getToken() } as any,
    data: { operations: sentOperations } as any,
    timeout: 8000,
    success: (res) => {
      if (requestUid !== progressIdentity() || requestToken !== getToken()) return
      if (res.statusCode === 200) {
        const d = res.data as any
        confirmProgressOperations(d.confirmedOperationIds as string[])
        applyServerProjection(d)
      }
      if (cb != null) cb({ error: res.statusCode === 200 ? '' : '上传失败' })
    },
    fail: () => {
      if (cb != null) cb({ error: '无法连接社区服务' })
    },
  })
}

/** 全量拉取（登录态）：后端与本地做并集合并——
 *  关卡：服务端有本地无 → 补入；双方都有 → solved 并集、星级/成本取优、plays/fails 取大；
 *  streak/mascots/tasks/checkuse：逐字段取大；dailyDone：本地为空才采用服务端。
 *  并集语义保证任何时序下不丢数据（离线破的关、后端的旧进度都安全）。
 *  自动拉取 20s 节流（回首页/我的页高频触发，全量包解析在真机上有成本）；
 *  手动同步与登录后的强制拉取传 force = true 不受限。 */
let lastAutoPullAt = 0
const AUTO_PULL_MIN_GAP = 20000

export function pullServerProgress(cb?: (r: { error: string }) => void, force?: boolean) {
  if (!isLoggedIn()) {
    if (cb != null) cb({ error: '' })
    return
  }
  const now = Date.now()
  if (force != true && now - lastAutoPullAt < AUTO_PULL_MIN_GAP) {
    if (cb != null) cb({ error: '' })
    return
  }
  lastAutoPullAt = now
  const requestUid = progressIdentity()
  const requestToken = getToken()
  uni.request({
    url: API_BASE + '/api/me/progress',
    method: 'GET',
    header: { Authorization: 'Bearer ' + getToken() } as any,
    timeout: 8000,
    success: (res) => {
      if (requestUid !== progressIdentity() || requestToken !== getToken()) return
      if (res.statusCode !== 200) {
        if (cb != null) cb({ error: '拉取失败' })
        return
      }
      const d = res.data as any
      const remoteCases = (d.cases ?? {}) as { [id: string]: any }
      let merged = 0
      for (const id in remoteCases) {
        const rp = remoteCases[id]
        const lp = getCaseProgress(id)
        if (lp == null) {
          // 本地无进度：直接采用服务端投影
          progressStorageSet('think_case_' + id, JSON.stringify({
            solved: rp.solved ?? false,
            bestGrade: rp.bestGrade ?? '',
            bestCost: rp.bestCost ?? 0,
            plays: rp.plays ?? 0,
            fails: rp.fails ?? 0,
            contentRevision: rp.contentRevision ?? 1,
            scoringVersion: rp.scoringVersion ?? 1,
          }))
          merged++
          continue
        }
        // 字段级并集（与逐字段快照比对等价），只有真的变化才落库：回首页的拉取高频，别做整包读写
        const localSolved = lp.solved
        const ns = lp.solved || rp.solved
        let ng = lp.bestGrade
        if (rp.bestGrade === 'S' || (lp.bestGrade !== 'S' && rp.bestGrade !== '' && (lp.bestGrade === '' || rp.bestGrade < lp.bestGrade))) ng = rp.bestGrade
        if (rp.bestGrade === 'S' && lp.bestGrade !== 'S') ng = 'S'
        let nc = lp.bestCost
        if (rp.solved && (!localSolved || rp.bestCost < lp.bestCost)) nc = rp.bestCost
        const np = Math.max(lp.plays ?? 0, rp.plays ?? 0)
        const nf = Math.max(lp.fails ?? 0, rp.fails ?? 0)
        if (ns !== lp.solved || ng !== lp.bestGrade || nc !== lp.bestCost || np !== (lp.plays ?? 0) || nf !== (lp.fails ?? 0)) {
          progressStorageSet('think_case_' + id, JSON.stringify({
            solved: ns,
            bestGrade: ng,
            bestCost: nc,
            plays: np,
            fails: nf,
            contentRevision: lp.contentRevision ?? 1,
            scoringVersion: lp.scoringVersion ?? 1,
          }))
          merged++
        }
      }
      const ls = progressStorageGet('think_streak_v1')
      let lsj: any = {}
      try { lsj = ls == null || (ls as string).length === 0 ? {} : JSON.parse(ls as string) } catch (e) { lsj = {} }
      const rs = d.streak ?? {}
      if ((rs.count ?? 0) > (lsj.count ?? 0)) progressStorageSet('think_streak_v1', JSON.stringify(rs))
      const lm = progressStorageGet('think_mascots_v1')
      let lmj: any = {}
      try { lmj = lm == null || (lm as string).length === 0 ? {} : JSON.parse(lm as string) } catch (e) { lmj = {} }
      const rm = d.mascots ?? {}
      const mm: any = {}
      let mDirty = false
      for (const k of ['frog', 'snail', 'otter', 'rabbit', 'dino']) {
        mm[k] = Math.max(lmj[k] ?? 0, rm[k] ?? 0)
        if (mm[k] !== (lmj[k] ?? 0)) mDirty = true
      }
      if (mDirty) progressStorageSet('think_mascots_v1', JSON.stringify(mm))
      const lt = progressStorageGet('think_tasks_v1')
      let ltj: any = {}
      try { ltj = lt == null || (lt as string).length === 0 ? {} : JSON.parse(lt as string) } catch (e) { ltj = {} }
      const rt = d.tasks ?? {}
      const tt: any = { daily: {}, weekly: {}, day: ltj.day ?? rt.day ?? '', week: ltj.week ?? rt.week ?? '' }
      let tDirty = false
      for (const bucket of ['daily', 'weekly']) {
        const lb = ltj[bucket] ?? {}
        const rb = rt[bucket] ?? {}
        for (const k in rb) {
          if ((rb[k] ?? 0) > (lb[k] ?? 0)) { tt[bucket][k] = rb[k]; tDirty = true }
          else if (lb[k] != null) tt[bucket][k] = lb[k]
        }
        for (const k in lb) if (tt[bucket][k] == null) tt[bucket][k] = lb[k]
      }
      if (tDirty) progressStorageSet('think_tasks_v1', JSON.stringify(tt))
      const ld = progressStorageGet('think_daily_done_v1')
      if ((ld == null || (ld as string).length === 0) && (d.dailyDone ?? '').length > 0) {
        progressStorageSet('think_daily_done_v1', d.dailyDone)
      }
      const rcu = d.checkuse ?? 0
      const lcu = Number(progressStorageGet('think_checkuse_v1')) || 0
      if (rcu > lcu) progressStorageSet('think_checkuse_v1', String(rcu))
      const localUnlocked = getUnlockedChapterIds()
      const remoteUnlocked = (d.unlockedChapterIds ?? []) as string[]
      const mergedUnlocked = localUnlocked.slice()
      for (let i = 0; i < remoteUnlocked.length; i++) if (mergedUnlocked.indexOf(remoteUnlocked[i]) < 0) mergedUnlocked.push(remoteUnlocked[i])
      if (mergedUnlocked.length !== localUnlocked.length) progressStorageSet('think_unlocked_chapters_v1', JSON.stringify(mergedUnlocked))
      applyServerProjection(d)
      if (cb != null) cb({ error: '' })
    },
    fail: () => {
      if (cb != null) cb({ error: '无法连接社区服务' })
    },
  })
}

let uploadTimer: any = null

/** 破案/写入后调用（storage 写穿透自动触发）：2s 防抖全量上传 */
export function scheduleProgressUpload() {
  if (!isLoggedIn()) return
  if (uploadTimer != null) clearTimeout(uploadTimer)
  uploadTimer = setTimeout(() => {
    uploadTimer = null
    pushProgress()
  }, 2000)
}

/** 手动同步：先推（本地上传）后拉（并集合并） */
export function manualSync(cb: (r: { error: string }) => void) {
  if (!isLoggedIn()) {
    cb({ error: '登录后可用' })
    return
  }
  pushProgress((r) => {
    if (r.error.length > 0) {
      cb({ error: r.error })
      return
    }
    pullServerProgress((r2) => {
      if (r2.error.length > 0) {
        cb({ error: r2.error })
        return
      }
      const label = lastSyncLabel()
      cb({ error: '' })
      uni.showToast({ title: label.length > 0 ? '已同步 · ' + label : '已同步', icon: 'none' })
    }, true)
  })
}

// 写穿透注册：storage 内任何玩法数据写入 → 防抖推送后端
setProgressListener(() => scheduleProgressUpload())
