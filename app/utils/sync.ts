/** Web 社区同步：拉取 casepack（已发布关卡包），本地校验后落 storage。
 *  v1 范围：拉取 + 落库 + 计数展示；远端关卡的章节合并与游玩放 M3。 */
import { API_BASE } from '../config'
import { DiagnosisCase } from '../types/case'

export interface SyncResult {
  version: number
  count: number
  error: string
}

export const CASEPACK_KEY = 'think_casepack_v1'
const KEY_VERSION = 'think_pack_version'
const KEY_PACK = CASEPACK_KEY

export function getPackVersion(): number {
  const v = uni.getStorageSync(KEY_VERSION)
  return Number(v) || 0
}

/** 远端已同步的案例（casepack payload 与 DiagnosisCase 同构） */
export function getRemoteCases(): DiagnosisCase[] {
  const raw = uni.getStorageSync(CASEPACK_KEY)
  if (raw == null) {
    return []
  }
  const str = raw as string
  if (str.length === 0) {
    return []
  }
  try {
    const arr = JSON.parse(str) as DiagnosisCase[]
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

export function getPackCount(): number {
  const raw = uni.getStorageSync(KEY_PACK)
  if (raw == null) return 0
  const str = raw as string
  if (str.length === 0) return 0
  try {
    const arr = JSON.parse(str) as any[]
    return arr.length
  } catch (e) {
    return 0
  }
}

export function fetchCasepack(cb: (r: SyncResult) => void) {
  uni.request({
    url: API_BASE + '/api/casepack?since=' + getPackVersion(),
    method: 'GET',
    timeout: 8000,
    success: (res) => {
      try {
        const data = res.data as { version: number, count: number, cases: any[] }
        if (data == null || data.version == null || !Array.isArray(data.cases)) {
          cb({ version: 0, count: 0, error: '数据格式异常' })
          return
        }
        // 最小字段校验（App 端防丢字段第二道门）
        for (const c of data.cases) {
          if (!c.id || !c.title || !c.actions || !c.lessons) {
            cb({ version: 0, count: 0, error: 'casepack 字段缺失' })
            return
          }
        }
        // 增量合并：since 拉回的是 delta，按 id 并入已存整包后整体落库（直接覆盖会丢掉历史关卡）
        const mergedMap: Map<string, any> = new Map()
        for (const c of getRemoteCases()) {
          if (c != null && c.id) mergedMap.set(c.id, c)
        }
        for (const c of data.cases) {
          mergedMap.set(c.id, c)
        }
        const merged = [...mergedMap.values()]
        uni.setStorageSync(KEY_PACK, JSON.stringify(merged))
        uni.setStorageSync(KEY_VERSION, String(data.version))
        cb({ version: data.version, count: merged.length, error: '' })
      } catch (e) {
        cb({ version: 0, count: 0, error: '解析失败' })
      }
    },
    fail: () => {
      cb({ version: 0, count: 0, error: '无法连接社区服务' })
    },
  })
}
