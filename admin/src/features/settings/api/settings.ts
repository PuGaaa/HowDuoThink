import { api } from '@/api/client'

export interface SettingItem {
  key: string
  value: number | string
  source: 'db' | 'env' | 'default'
  group: 'gate' | 'ai' | 'security'
  label: string
  unit: string
  min: number | null
  max: number | null
}

export interface SettingsResult {
  items: SettingItem[]
}

export const settingsApi = {
  fetch: (): Promise<SettingsResult> => api.get('/api/admin/settings'),
  save: (values: Record<string, number | string>) => api.put('/api/admin/settings', { values }),
}
