import { api } from '@/api/client'

export interface UsageDay {
  day: string
  chats: number
  drafts: number
  prompt_tokens: number
  completion_tokens: number
  avg_ms: number | null
  cost: number
}

export interface UsageUser {
  uid: string
  login: string | null
  calls: number
  prompt_tokens: number
  completion_tokens: number
  cost: number
}

export interface UsageSummary {
  days: UsageDay[]
  total: { prompt_tokens: number; completion_tokens: number; cost: number }
}

export const usageApi = {
  summary: (days: number): Promise<UsageSummary> => api.get(`/api/admin/ai/usage?days=${days}`),
  topUsers: (days: number): Promise<{ items: UsageUser[] }> => api.get(`/api/admin/ai/usage/users?days=${days}`),
}
