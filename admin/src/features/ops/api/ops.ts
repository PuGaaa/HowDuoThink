import { api } from '@/api/client'

export interface OpsSnapshot {
  ts: string
  requests: number
  errors: number
  avgMs: number
  rssMb: number
  diskFreeMb: number
}

export interface OpsHealth {
  db: { ok: boolean; provider: string; casepackVersion: number }
  process: { requests: number; errors: number; avgMs: number; uptimeMin: number; rssMb: number }
  diskFreeMb: number
  recent: OpsSnapshot[]
  integrations: { sentry: boolean; snapshotIntervalSec: number }
}

export const opsApi = {
  health: (): Promise<OpsHealth> => api.get('/api/admin/ops/health'),
}
