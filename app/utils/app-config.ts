/** 运行时配置下发：GET /api/app-config（公开只读，仅 client scope 白名单）。
 *  游客门禁等运营策略由管理端「系统设置」调整，App 启动/回前台拉取；
 *  拉取失败或字段缺失一律退内置默认——配置通道绝不阻断启动与游玩。 */
import { API_BASE } from '../config'

const KEY_CONFIG = 'think_app_config_v1'

/** 内置兜底（与 server/core/settings.py REGISTRY 默认值对齐；改任一侧须同步） */
const DEFAULTS: Record<string, string | number> = {
  'guest_gate.chapter_id': 'error-reading',
  'guest_gate.free_levels': 3,
}

function readLocal(): Record<string, any> {
  const raw = uni.getStorageSync(KEY_CONFIG)
  if (raw == null || raw == '') return {}
  try {
    const obj = JSON.parse(raw as string) as Record<string, any>
    return obj != null && typeof obj == 'object' ? obj : {}
  } catch (e) {
    return {}
  }
}

export function fetchAppConfig(cb: (ok: boolean) => void) {
  uni.request({
    url: API_BASE + '/api/app-config',
    method: 'GET',
    timeout: 8000,
    success: (res) => {
      try {
        const data = res.data as Record<string, any>
        if (data == null || typeof data != 'object') {
          cb(false)
          return
        }
        // 只收白名单键，其余忽略（服务端保证不下发别的，客户端再收一道口）
        const clean: Record<string, any> = {}
        for (const key in DEFAULTS) {
          if (data[key] != null) clean[key] = data[key]
        }
        uni.setStorageSync(KEY_CONFIG, JSON.stringify(clean))
        cb(true)
      } catch (e) {
        cb(false)
      }
    },
    fail: () => {
      cb(false)
    },
  })
}

export function getConfigValue(key: string): string | number {
  const local = readLocal()
  const v = local[key]
  if (v != null) return v as string | number
  return DEFAULTS[key]
}

/** 游客免费章 id（章内按 order 升序计前 N 关） */
export function getGuestFreeChapter(): string {
  return String(getConfigValue('guest_gate.chapter_id'))
}

/** 游客免费关数 */
export function getGuestFreeLevels(): number {
  const v = Number(getConfigValue('guest_gate.free_levels'))
  return isNaN(v) || v < 0 ? 3 : v
}
