import { API_BASE } from '../config'
import { DiagnosisCase } from '../types/case'
import { SessionRecord } from './storage'

interface DraftPreview {
  payload: DiagnosisCase
  session: SessionRecord | null
}

function previewKey(previewId: string): string {
  return 'think_preview_' + previewId
}

function readPreview(previewId: string): DraftPreview {
  return JSON.parse(uni.getStorageSync(previewKey(previewId)) as string) as DraftPreview
}

export function fetchDraftPreview(previewId: string, token: string, cb: (error: string) => void): void {
  uni.request({
    url: API_BASE + '/api/previews/' + previewId,
    method: 'GET',
    header: { Authorization: 'Bearer ' + token } as any,
    success: (response) => {
      if (response.statusCode !== 200) {
        cb('预览链接已失效，请回到编辑器重新生成')
        return
      }
      const data = response.data as { payload: DiagnosisCase }
      const preview: DraftPreview = { payload: data.payload, session: null }
      uni.setStorageSync(previewKey(previewId), JSON.stringify(preview))
      cb('')
    },
    fail: () => cb('无法连接预览服务'),
  })
}

export function getPreviewCase(previewId: string): DiagnosisCase {
  return readPreview(previewId).payload
}

export function savePreviewSession(previewId: string, session: SessionRecord): void {
  const preview = readPreview(previewId)
  preview.session = session
  uni.setStorageSync(previewKey(previewId), JSON.stringify(preview))
}

export function getPreviewSession(previewId: string): SessionRecord | null {
  return readPreview(previewId).session
}

export function clearDraftPreview(previewId: string): void {
  uni.removeStorageSync(previewKey(previewId))
}
