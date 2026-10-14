// 统一 API 客户端：Bearer 鉴权 + 401 自动清 token。
// dev 走 vite 代理、生产与 api 同源，故一律用相对路径。
const TOKEN_KEY = 'hdt_admin_token'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `请求失败（${status}）`)
    this.status = status
    this.detail = detail
  }
}

async function request(method: string, path: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = 'Bearer ' + token
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const resp = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data: any = null
  try {
    data = await resp.json()
  } catch {
    // 204 或非 JSON 响应
  }
  if (!resp.ok) {
    if (resp.status === 401) clearToken()
    throw new ApiError(resp.status, data?.detail ?? data ?? resp.statusText)
  }
  return data
}

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, body?: unknown) => request('POST', path, body),
  patch: (path: string, body: unknown) => request('PATCH', path, body),
}
