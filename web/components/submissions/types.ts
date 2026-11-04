export interface SubmissionMaterial {
  title: string
  symptom: string
  resolution: string
  keyError: string | null
  timeline: string | null
  lessons: string[]
  stackTags: string[]
  domainHint: string
}

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
  displayStatus: 'received' | 'needs_more' | 'producing' | 'published' | 'rejected'
  reviewNote: string | null
  createdAt: string
  caseId: string | null
  playPath: string | null
  articlePath: string | null
  materialVersion: number
  materialConfirmed: boolean
  materialCurrent: boolean
  material: SubmissionMaterial | null
  messages: { id: number; kind: string; body: string; created_at: string }[]
}

export interface SimilarCandidate {
  key: string
  title: string
  excerpt: string
  url: string | null
}
