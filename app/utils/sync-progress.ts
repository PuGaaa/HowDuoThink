/** 检查单/进度云同步：登录态下拉取合并（并集），破案后防抖全量上传。
 *  冲突策略：本地 solved 优先；服务器有而本地无的补入。任务计数不同步。 */
import { API_BASE } from '../config'
import { getToken, isLoggedIn } from './auth'

const KEY_LAST_SYNC = 'think_last_sync'

export function lastSyncLabel(): string {
  const v = uni.getStorageSync(KEY_LAST_SYNC)
  return v == null || (v as string).length === 0 ? '' : v as string
}

/** 读本地案例进度（与 storage.ts 的 KEY_CASE 约定一致） */
function readLocalCases(): { [id: string]: any } {
  const out: { [id: string]: any } = {}
  const info = uni.getStorageInfoSync()
  for (const k of info.keys) {
    if (k.indexOf('think_case_') !== 0) continue
    const raw = uni.getStorageSync(k)
    if (raw == null || (raw as string).length === 0) continue
    try {
      const p = JSON.parse(raw as string)
      out[k.replace('think_case_', '')] = p
    } catch (e) {}
  }
  return out
}

function writeLocalCase(caseId: string, p: any) {
  uni.setStorageSync('think_case_' + caseId, JSON.stringify(p))
}

/** 拉取服务器进度并与本地合并（服务器有而本地无 → 补入；都有 → solved 并集、成本取优） */
export function pullMergeProgress(cb: (r: { error: string; merged: number }) => void) {
  if (!isLoggedIn()) {
    cb({ error: '', merged: 0 })
    return
  }
  uni.request({
    url: API_BASE + '/api/me/progress',
    method: 'GET',
    header: { Authorization: 'Bearer ' + getToken() } as any,
    timeout: 8000,
    success: (res) => {
      if (res.statusCode !== 200) {
        cb({ error: '拉取失败', merged: 0 })
        return
      }
      const remote = (res.data as any).cases as { [id: string]: any }
      let merged = 0
      for (const id in remote) {
        const rp = remote[id]
        const localRaw = uni.getStorageSync('think_case_' + id)
        if (localRaw == null || (localRaw as string).length === 0) {
          writeLocalCase(id, rp)
          merged++
          continue
        }
        try {
          const lp = JSON.parse(localRaw as string)
          if (!lp.solved && rp.solved) {
            lp.solved = true
            lp.bestGrade = rp.bestGrade
            lp.bestCost = rp.bestCost
            lp.plays = Math.max(lp.plays || 0, rp.plays || 0)
            writeLocalCase(id, lp)
            merged++
          }
        } catch (e) {}
      }
      if (merged > 0) {
        uni.showToast({ title: '已同步 ' + merged + ' 关进度', icon: 'none' })
      }
      cb({ error: '', merged: merged })
    },
    fail: () => {
      cb({ error: '无法连接社区服务', merged: 0 })
    },
  })
}

let uploadTimer: any = null

/** 破案后调用：2s 防抖全量上传（仅登录态） */
export function scheduleProgressUpload() {
  if (!isLoggedIn()) return
  if (uploadTimer != null) clearTimeout(uploadTimer)
  uploadTimer = setTimeout(() => {
    uploadTimer = null
    const cases = readLocalCases()
    uni.request({
      url: API_BASE + '/api/me/progress',
      method: 'POST',
      header: { Authorization: 'Bearer ' + getToken() } as any,
      data: { cases: cases } as any,
      timeout: 8000,
      success: (res) => {
        if (res.statusCode === 200) {
          const d = new Date()
          const hh = d.getHours() < 10 ? '0' + d.getHours() : String(d.getHours())
          const mm = d.getMinutes() < 10 ? '0' + d.getMinutes() : String(d.getMinutes())
          uni.setStorageSync(KEY_LAST_SYNC, '今天 ' + hh + ':' + mm)
        }
      },
    })
  }, 2000)
}

/** 手动同步：先上传再拉取 */
export function manualSync(cb: (r: { error: string }) => void) {
  if (!isLoggedIn()) {
    cb({ error: '登录后可用' })
    return
  }
  scheduleProgressUpload()
  setTimeout(() => {
    pullMergeProgress((r) => {
      if (r.error.length > 0) {
        cb({ error: r.error })
        return
      }
      const label = lastSyncLabel()
      cb({ error: '' })
      uni.showToast({ title: label.length > 0 ? '已同步 · ' + label : '已同步', icon: 'none' })
    })
  }, 2300)
}
