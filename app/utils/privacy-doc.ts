/** 隐私政策文档：GET /api/docs/privacy-policy（公开只读）。
 *  首选本地缓存秒开，后台刷新覆盖；拉取失败静默保留旧缓存。 */
import { API_BASE } from '../config'

const KEY_DOC = 'think_privacy_doc_v1'

export interface PrivacyDoc {
  content: string
  updatedAt: string
  customized: boolean
}

export function readCachedPrivacyDoc(): PrivacyDoc | null {
  const raw = uni.getStorageSync(KEY_DOC)
  if (raw == null || (raw as string).length == 0) return null
  try {
    const obj = JSON.parse(raw as string) as PrivacyDoc
    if (obj == null || typeof obj != 'object' || typeof obj.content != 'string' || obj.content.length == 0) {
      return null
    }
    return obj
  } catch (e) {
    return null
  }
}

/** 拉取最新文本：成功覆盖本地缓存；失败回调 false（保留旧缓存，不阻塞页面） */
export function fetchPrivacyDoc(cb: (ok: boolean) => void) {
  uni.request({
    url: API_BASE + '/api/docs/privacy-policy',
    method: 'GET',
    timeout: 8000,
    success: (res) => {
      try {
        const data = res.data as Record<string, any>
        if (data == null || typeof data != 'object' || typeof data.content != 'string' || (data.content as string).length == 0) {
          cb(false)
          return
        }
        const doc: PrivacyDoc = {
          content: data.content as string,
          updatedAt: typeof data.updatedAt == 'string' ? data.updatedAt : '',
          customized: data.customized == true,
        }
        uni.setStorageSync(KEY_DOC, JSON.stringify(doc))
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
