import { api } from '@/api/client'

export interface ActivityDay {
  day: string
  active: number
  hits: number
}

export interface StatsOverview {
  days: number
  activeDaily: ActivityDay[]
  dauToday: number
  activeUsersTotal: number
  newUsers: number
  newUsersDaily: { day: string; n: number }[]
  submissions: {
    total: number
    pending: number
    accepted: number
    rejected: number
    archived: number
    acceptRate: number | null
  }
  publishedInWindow: number
  publishedTotal: number
  progress: {
    usersWithProgress: number
    solvedTotal: number
    avgSolvedPerUser: number
    completionRate: number | null
  }
}

export const statsApi = {
  overview: (days: number): Promise<StatsOverview> => api.get(`/api/admin/stats/overview?days=${days}`),
}
