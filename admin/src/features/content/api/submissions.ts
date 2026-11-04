import { api } from '@/api/client'
import type { Submission } from './content'

export interface Material {
  title: string
  symptom: string
  resolution: string
  keyError: string | null
  timeline: string | null
  lessons: string[]
  stackTags: string[]
  domainHint: string | null
}
export interface Candidate {
  id: string
  key: string
  kind: string
  status: string
  title: string
  excerpt: string
  url: string | null
}
export interface SubmissionDetail extends Submission {
  displayStatus: string
  material: Material | null
  materialVersion: number
  materialConfirmed: boolean
  materialCurrent: boolean
  caseId: string | null
  linkedCaseId: string | null
  parentSubmissionId: string | null
  messages: { id: number; visibility: string; kind: string; body: string; created_at: string }[]
  review: { decision: string | null; mechanism: string | null; evidence: string | null; reasoning: string | null; candidate_ids: string }
}
export const statusLabels: Record<string, string> = {
  received: '已收到', needs_more: '待补充', producing: '制作中', published: '已发布', rejected: '本次不采用',
}
export const submissionApi = {
  list: (): Promise<SubmissionDetail[]> => api.get('/api/admin/submissions'),
  detail: (id: string): Promise<SubmissionDetail> => api.get(`/api/admin/submissions/${id}`),
  similar: (id: string): Promise<{ items: Candidate[] }> => api.get(`/api/admin/submissions/${id}/similar`),
  material: (id: string, material: Material) => api.put(`/api/admin/submissions/${id}/material`, { material }),
  review: (id: string, body: unknown) => api.post(`/api/admin/submissions/${id}/review`, body),
}
