/** 进度云同步（登录态）：后端为唯一事实源。
 *  拉取：GET 全量 bundle → 覆盖本地（登录/每次回到首页时执行）；
 *  推送：任何玩法数据写入（storage 写穿透）→ 2s 防抖全量上传；
 *  手动同步 = 先推后拉。未登录（游客态）全部为本地，无网络行为。 */
import { API_BASE } from '../config'
import { getToken, isLoggedIn } from './auth'
import { exportProgressBundle, setProgressListener } from './storage'

const KEY_LAST_SYNC = 'think_last_sync'

export function lastSyncLabel(): string {
  const v = uni.getStorageSync(KEY_LAST_SYNC)
  return v == null || (v as string).length === 0 ? '' : v as string
}

function markSynced() {
  const d = new Date()
  const hh = d.getHours() < 10 ? '0' + d.getHours() : String(d.getHours())
  const mm = d.getMinutes() < 10 ? '0' + d.getMinutes() : String(d.getMinutes())
  uni.setStorageSync(KEY_LAST_SYNC, '今天 ' + hh + ':' + mm)
}

/** 全量推送（登录态；游客态为空操作） */
export function pushProgress(cb?: (r: { error: string }) => void) {
  if (!isLoggedIn()) {
    if (cb != null) cb({ error: '登录后可用' })
    return
  }
  uni.request({
    url: API_BASE + '/api/me/progress',
    method: 'POST',
    header: { Authorization: 'Bearer ' + getToken() } as any,
    data: exportProgressBundle() as any,
    timeout: 8000,
    success: (res) => {
      if (res.statusCode === 200) markSynced()
      if (cb != null) cb({ error: res.statusCode === 200 ? '' : '上传失败' })
    },
    fail: () => {
      if (cb != null) cb({ error: '无法连接社区服务' })
    },
  })
}

/** 全量拉取（登录态）：后端与本地做并集合并——
 *  关卡：服务端有本地无 → 补入；双方都有 → solved 并集、星级/成本取优；
 *  streak/mascots/tasks/checkuse：逐字段取大；dailyDone：本地为空才采用服务端。
 *  并集语义保证任何时序下不丢数据（离线破的关、后端的旧进度都安全）。 */
export function pullServerProgress(cb?: (r: { error: string }) => void) {
  if (!isLoggedIn()) {
    if (cb != null) cb({ error: '' })
    return
  }
  uni.request({
    url: API_BASE + '/api/me/progress',
    method: 'GET',
    header: { Authorization: 'Bearer ' + getToken() } as any,
    timeout: 8000,
    success: (res) => {
      if (res.statusCode !== 200) {
        if (cb != null) cb({ error: '拉取失败' })
        return
      }
      const d = res.data as any
      const remoteCases = (d.cases ?? {}) as { [id: string]: any }
      let merged = 0
      for (const id in remoteCases) {
        const rp = remoteCases[id]
        const raw = uni.getStorageSync('think_case_' + id)
        if (raw == null || (raw as string).length === 0) {
          uni.setStorageSync('think_case_' + id, JSON.stringify(rp))
          merged++
          continue
        }
        try {
          const lp = JSON.parse(raw as string)
          const before = JSON.stringify(lp)
          if (!lp.solved && rp.solved) lp.solved = true
          if (rp.bestGrade === 'S' || (lp.bestGrade !== 'S' && rp.bestGrade !== '' && (lp.bestGrade === '' || rp.bestGrade < lp.bestGrade))) lp.bestGrade = rp.bestGrade
          if (rp.bestGrade === 'S' && lp.bestGrade !== 'S') lp.bestGrade = 'S'
          if ((rp.bestCost ?? 0) > (lp.bestCost ?? 0)) lp.bestCost = rp.bestCost
          lp.plays = Math.max(lp.plays ?? 0, rp.plays ?? 0)
          if (JSON.stringify(lp) !== before) {
            uni.setStorageSync('think_case_' + id, JSON.stringify(lp))
            merged++
          }
        } catch (e) {}
      }
      const ls = uni.getStorageSync('think_streak_v1')
      let lsj: any = {}
      try { lsj = ls == null || (ls as string).length === 0 ? {} : JSON.parse(ls as string) } catch (e) { lsj = {} }
      const rs = d.streak ?? {}
      if ((rs.count ?? 0) > (lsj.count ?? 0)) uni.setStorageSync('think_streak_v1', JSON.stringify(rs))
      const lm = uni.getStorageSync('think_mascots_v1')
      let lmj: any = {}
      try { lmj = lm == null || (lm as string).length === 0 ? {} : JSON.parse(lm as string) } catch (e) { lmj = {} }
      const rm = d.mascots ?? {}
      const mm: any = {}
      let mDirty = false
      for (const k of ['frog', 'snail', 'otter', 'rabbit', 'dino']) {
        mm[k] = Math.max(lmj[k] ?? 0, rm[k] ?? 0)
        if (mm[k] !== (lmj[k] ?? 0)) mDirty = true
      }
      if (mDirty) uni.setStorageSync('think_mascots_v1', JSON.stringify(mm))
      const lt = uni.getStorageSync('think_tasks_v1')
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
      if (tDirty) uni.setStorageSync('think_tasks_v1', JSON.stringify(tt))
      const ld = uni.getStorageSync('think_daily_done_v1')
      if ((ld == null || (ld as string).length === 0) && (d.dailyDone ?? '').length > 0) {
        uni.setStorageSync('think_daily_done_v1', d.dailyDone)
      }
      const rcu = d.checkuse ?? 0
      const lcu = Number(uni.getStorageSync('think_checkuse_v1')) || 0
      if (rcu > lcu) uni.setStorageSync('think_checkuse_v1', String(rcu))
      markSynced()
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
    })
  })
}

// 写穿透注册：storage 内任何玩法数据写入 → 防抖推送后端
setProgressListener(() => scheduleProgressUpload())
