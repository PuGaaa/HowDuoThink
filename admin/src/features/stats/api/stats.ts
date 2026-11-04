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

export interface LearningMetrics {
  asOf: string
  funnel: { startedUsers: number; finishedUsers: number; solvedUsers: number }
  d1: { eligibleUsers: number; retainedUsers: number }
  d7: { eligibleUsers: number; retainedUsers: number }
  d7Solved: { eligibleUsers: number; retainedUsers: number }
  threeCase7d: { eligibleUsers: number; completedUsers: number }
  firstSession: { startedUsers: number; solvedUsers: number; failedUsers: number; unfinishedUsers: number }
  saveConversion7d: { eligibleUsers: number; convertedUsers: number }
  continue7d: { eligibleUsers: number; continuedUsers: number }
  window: { firstDay: string | null; lastDay: string; sevenDayOffsets: number[] }
  immatureUsers: { d1: number; d7: number; threeCase7d: number; saveConversion7d: number; continue7d: number }
  sources: { source: string; startedUsers: number }[]
  weeklySolvedUsers: number
}

export const statsApi = {
  overview: (days: number): Promise<StatsOverview> => api.get(`/api/admin/stats/overview?days=${days}`),
  learning: (): Promise<LearningMetrics> => api.get('/api/admin/stats/learning'),
}
