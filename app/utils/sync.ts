/** Web 社区同步：拉取 casepack（已发布关卡包），本地校验后落 storage。
 *  增量：带本地版本号 since 只拉 delta，按 id 并入已存整包；
 *  所有入口经 getEffectiveCases 按内容修订合并；发布游标只决定增量范围。
 *  存储：按案例拆 key（think_casepack_v2/<id>），避免 iOS 上单 key 大值
 *  在主线程做整包 JSON 递归转换导致 watchdog（0x8BADF00D）杀进程；
 *  进程内缓存保证同一会话只读 storage 一轮。 */
import { API_BASE } from '../config'
import { DiagnosisCase } from '../types/case'
import { preserveLegacyChapterUnlocks } from '../data/chapters'

export interface SyncResult {
  version: number
  count: number
  error: string
}

/** 旧版整包 key：仅用于迁移与清理，不再写入。 */
export const CASEPACK_KEY = 'think_casepack_v1'
const V2_PREFIX = 'think_casepack_v2/'
const KEY_VERSION = 'think_pack_version'

let remoteCache: DiagnosisCase[] | null = null

export function getPackVersion(): number {
  const v = uni.getStorageSync(KEY_VERSION)
  return Number(v) || 0
}

function v2Keys(): string[] {
  const info = uni.getStorageInfoSync()
  const keys: string[] = info?.keys ?? []
  return keys.filter(k => k.startsWith(V2_PREFIX))
}

/** 远端已同步的案例（casepack payload 与 DiagnosisCase 同构）。 */
export function getRemoteCases(): DiagnosisCase[] {
  if (remoteCache != null) return remoteCache
  const keys = v2Keys()
  if (keys.length > 0) {
    const out: DiagnosisCase[] = []
    for (const key of keys) {
      try {
        const raw = uni.getStorageSync(key)
        if (raw == null) continue
        const parsed = JSON.parse(raw as string) as DiagnosisCase
        if (parsed != null && parsed.id) out.push(parsed)
      } catch (e) {
        // 单案例损坏只丢弃该条，不影响整包
      }
    }
    remoteCache = out
    return remoteCache
  }
  return migrateLegacyPack()
}

/** v1 整包 → v2 拆分 key；迁移后删除整包。 */
function migrateLegacyPack(): DiagnosisCase[] {
  const raw = uni.getStorageSync(CASEPACK_KEY)
  if (raw == null || (raw as string).length === 0) {
    remoteCache = []
    return remoteCache
  }
  let arr: DiagnosisCase[] = []
  try {
    const parsed = JSON.parse(raw as string)
    arr = Array.isArray(parsed) ? parsed : []
  } catch (e) {
    arr = []
  }
  for (const item of arr) {
    if (item == null || !item.id) continue
    uni.setStorageSync(V2_PREFIX + item.id, JSON.stringify(item))
  }
  uni.removeStorageSync(CASEPACK_KEY)
  remoteCache = arr.filter(item => item != null && item.id)
  return remoteCache
}

export function getPackCount(): number {
  return getRemoteCases().length
}

function persistPack(cases: DiagnosisCase[]) {
  // delta 语义：响应不含某案例不代表远端已删，只写不删；清理仅针对旧版整包 key。
  // 逐键比对、只写有变化的：回首页每次都拉 casepack，常态是空 delta——
  // 若整包重写 150 个 key，iOS 主线程要做 150 次大 JSON 转换（见文件头注释），
  // 液态 tab 变形动画会被冻住几百毫秒。
  let dirty = false
  for (const c of cases) {
    if (c == null || !c.id) continue
    const raw = JSON.stringify(c)
    if (uni.getStorageSync(V2_PREFIX + c.id) === raw) continue
    uni.setStorageSync(V2_PREFIX + c.id, raw)
    dirty = true
  }
  uni.removeStorageSync(CASEPACK_KEY)
  // 内容未变：保持 remoteCache 引用稳定（下游 effectiveCache/章缓存的指纹继续命中）
  if (!dirty && remoteCache != null) return
  remoteCache = cases.filter(c => c != null && c.id)
}

export function fetchCasepack(cb: (r: SyncResult) => void) {
  preserveLegacyChapterUnlocks()
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
        if (data.version < getPackVersion()) {
          cb({ version: getPackVersion(), count: getPackCount(), error: '' })
          return
        }
        if (data.cases.length === 0) {
          // 空 delta：远端无新内容，本地包原样保留——不进合并/落库，主线程零负担
          cb({ version: data.version, count: getPackCount(), error: '' })
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
          const previous = mergedMap.get(c.id)
          if (previous == null || (c.contentRevision ?? 1) > (previous.contentRevision ?? 1)) mergedMap.set(c.id, c)
        }
        const merged = [...mergedMap.values()] as DiagnosisCase[]
        persistPack(merged)
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
