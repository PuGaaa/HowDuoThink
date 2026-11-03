/** 远程资源派发：GET /api/app-resources（公开只读）。
 *  App 启动即预取（index onShow），吉祥物槽位 URL 表与头像池存 storage；
 *  拉取失败保留旧缓存。前端不打包吉祥物/头像图片——未拉到时由调用方走 emoji/占位降级。 */
import { API_BASE } from '../config'

const KEY_RESOURCES = 'think_app_resources_v1'

interface AppResources {
  version: string
  mascots: Record<string, string>
  avatars: string[]
}

const EMPTY: AppResources = { version: '', mascots: {}, avatars: [] }

function readResources(): AppResources {
  const raw = uni.getStorageSync(KEY_RESOURCES)
  if (raw == null || raw == '') return EMPTY
  try {
    const obj = JSON.parse(raw as string) as AppResources
    if (obj == null || typeof obj != 'object' || obj.mascots == null || obj.avatars == null) return EMPTY
    return obj
  } catch (e) {
    return EMPTY
  }
}

/** 启动预取：失败静默（保留旧缓存），不阻塞启动流程 */
export function fetchAppResources(cb: (ok: boolean) => void) {
  uni.request({
    url: API_BASE + '/api/app-resources',
    method: 'GET',
    timeout: 8000,
    success: (res) => {
      try {
        const data = res.data as Record<string, any>
        if (data == null || typeof data != 'object' || data.mascots == null || data.avatars == null) {
          cb(false)
          return
        }
        const clean: AppResources = { version: String(data.version ?? ''), mascots: {}, avatars: [] }
        for (const k in data.mascots) {
          const v = data.mascots[k]
          if (typeof v == 'string' && v.length > 0) clean.mascots[k] = v
        }
        if (Array.isArray(data.avatars)) {
          for (let i = 0; i < data.avatars.length; i++) {
            const v = data.avatars[i]
            if (typeof v == 'string' && v.length > 0) clean.avatars.push(v)
          }
        }
        uni.setStorageSync(KEY_RESOURCES, JSON.stringify(clean))
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

/** 吉祥物槽位 URL：frog/snail/otter/rabbit/dino；未派发返回 ''（调用方走 emoji 降级） */
export function getMascotUrl(who: string): string {
  const r = readResources()
  const v = r.mascots[who]
  return typeof v == 'string' ? v : ''
}

/** 头像池：后端 avatar 分类的全部素材 URL，按上传顺序 */
export function getAvatarPresets(): string[] {
  return readResources().avatars
}
