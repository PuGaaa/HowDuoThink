// 素材域 API：上传走 multipart（独立 fetch），鉴权与 401 处理对齐 client.ts。
import { clearToken, getToken } from './client'

export interface AssetItem {
  id: number
  key: string
  url: string
  filename: string
  category: string
  size: number
  sha256: string
  note: string
  uploaded_by: string
  created_at: string
}

async function request(method: string, path: string, body?: FormData): Promise<any> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = 'Bearer ' + token
  const resp = await fetch(path, { method, headers, body })
  let data: any = null
  try {
    data = await resp.json()
  } catch {
    // 非 JSON 响应
  }
  if (!resp.ok) {
    if (resp.status === 401) clearToken()
    throw new Error(typeof data?.detail === 'string' ? data.detail : `请求失败（${resp.status}）`)
  }
  return data
}

export async function listAssets(category?: string): Promise<AssetItem[]> {
  const qs = category ? '?category=' + encodeURIComponent(category) : ''
  const data = await request('GET', '/api/assets' + qs)
  return data.items as AssetItem[]
}

export async function uploadAsset(file: File, category: string): Promise<AssetItem> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('category', category)
  return (await request('POST', '/api/assets', fd)) as AssetItem
}

export async function deleteAsset(id: number): Promise<void> {
  await request('DELETE', '/api/assets/' + id)
}

export interface SlotItem {
  slot: string
  name: string
  asset: AssetItem | null
}

const jsonRequest = async (method: string, path: string, body?: unknown): Promise<any> => {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = 'Bearer ' + token
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const resp = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  let data: any = null
  try {
    data = await resp.json()
  } catch {
    // 非 JSON 响应
  }
  if (!resp.ok) {
    if (resp.status === 401) clearToken()
    throw new Error(typeof data?.detail === 'string' ? data.detail : `请求失败（${resp.status}）`)
  }
  return data
}

export async function listSlots(): Promise<SlotItem[]> {
  const data = await jsonRequest('GET', '/api/assets/slots')
  return data.items as SlotItem[]
}

export async function bindSlot(slot: string, assetId: number): Promise<void> {
  await jsonRequest('PUT', '/api/assets/slots/' + slot, { asset_id: assetId })
}

export async function unbindSlot(slot: string): Promise<void> {
  await jsonRequest('DELETE', '/api/assets/slots/' + slot)
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}
