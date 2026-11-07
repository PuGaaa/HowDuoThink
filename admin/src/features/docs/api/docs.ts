import { api } from '@/api/client'

export interface DocInfo {
  id: string
  content: string
  updatedBy: string | null
  updatedAt: string | null
  customized: boolean
}

export const docsApi = {
  fetch: (): Promise<DocInfo> => api.get('/api/docs/privacy-policy'),
  save: (content: string) => api.put('/api/admin/docs/privacy-policy', { content }),
}
