import { api } from '@/api/client'

export interface Submission {
  id: string
  title: string
  symptom: string
  resolution: string
  keyError: string | null
  timeline: string | null
  lessons: string[]
  stackTags: string[]
  domainHint: string | null
  status: string
  reviewNote: string | null
  author: string | null
  createdAt: string
}

export interface CaseRow {
  id: string
  title: string
  domain: string
  layer: string
  difficulty: number
  version: number
  status: string
  contentRevision: number | null
  sourceType: string
  sourceCommit: string | null
  readOnly: boolean
  part?: string
  chapterId?: string
  typeTags?: string
  submissionId?: string
}

export interface CaseDetail extends CaseRow {
  payload: Record<string, any>
}

export interface CaseRevision {
  contentRevision: number
  contentHash: string
  sourceType: string | null
  sourceCommit: string | null
  publishedBy: string | null
  publishedAt: string | null
  recordedAt: string
  legacySnapshot: boolean
  payload: Record<string,any>
}

export interface DraftResult {
  caseId: string
  submissionId: string
  status: string
  aiGenerated?: boolean
  warnings?: string[]
}

export interface ReindexResult {
  ok: boolean
  indexed?: number
  total?: number
  reason?: string
}

export interface PreviewResult {
  previewId: string
  previewToken: string
  expiresAt: string
  previewUrl: string
}

export const contentApi = {
  submissions: (status?: string): Promise<Submission[]> =>
    api.get('/api/admin/submissions' + (status ? '?status=' + encodeURIComponent(status) : '')),
  setSubmissionStatus: (sid: string, status: string, reviewNote: string) =>
    api.post(`/api/admin/submissions/${sid}/status`, { status, reviewNote }),
  makeDraft: (sid: string): Promise<DraftResult> => api.post(`/api/admin/submissions/${sid}/draft`, {}),
  makeAiDraft: (sid: string): Promise<DraftResult> => api.post(`/api/admin/submissions/${sid}/ai-draft`, {}),

  cases: (status?: string): Promise<CaseRow[]> =>
    api.get('/api/admin/cases' + (status ? '?status=' + encodeURIComponent(status) : '')),
  caseDetail: (cid: string): Promise<CaseDetail> => api.get(`/api/admin/cases/${cid}`),
  revisions: (cid: string): Promise<{items:CaseRevision[]}> => api.get(`/api/admin/cases/${cid}/revisions`),
  saveDraft: (id: string, payload: unknown) => api.post('/api/admin/cases', { id, payload }),
  updateMeta: (cid: string, body: { part: string; chapterId: string; order: number; typeTags: string[] }) =>
    api.patch(`/api/admin/cases/${cid}/meta`, body),
  publish: (payload: unknown): Promise<{ version: number; contentRevision: number; articleId: string; unchanged: boolean }> => api.post('/api/cases', payload),
  preview: (cid: string, payload: unknown): Promise<PreviewResult> => api.post(`/api/admin/cases/${cid}/preview`, { payload }),
  reindex: (): Promise<ReindexResult> => api.post('/api/admin/ai/reindex', {}),
}
