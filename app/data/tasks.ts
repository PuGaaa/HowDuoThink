/** 任务系统：每日/每周/成长三类任务的定义与进度（多邻国式留存）。
 *  进度数据源全部是已有埋点：破案(saveSession)、检查单核对(bumpChecklistUse)、立假设(submitHypotheses)。
 *  每日 0 点重置、每周一重置；成长任务永久累计。 */

export interface TaskDef {
  id: string
  type: 'daily' | 'weekly' | 'growth'
  title: string
  /** 目标值 */
  goal: number
  /** 进度事件 key：win | checkuse | hypo | casewin7 | layers2 | solved3 | retrain | dailycase */
  metric: string
  /** 图标资产名（app/static/icons/{name}.png） */
  icon: string
  /** 点击任务卡的去向页面（任务页 = 地图 + 手册两个完成入口） */
  to: string
  /** 去向是否为 tabBar 页（决定 switchTab / navigateTo） */
  toTab: boolean
}

export const DAILY_TASKS: TaskDef[] = [
  { id: 'd-win', type: 'daily', title: '破案 1 关（今日一题也计入）', goal: 1, metric: 'win', icon: 'trophy-lemon', to: '/pages/index/index', toTab: true },
  { id: 'd-check', type: 'daily', title: '复习检查单 1 次', goal: 1, metric: 'checkuse', icon: 'scroll-coral', to: '/pages/handbook/handbook', toTab: false },
]

export const WEEKLY_TASKS: TaskDef[] = [
  { id: 'w-case3', type: 'weekly', title: '本周破案 3 关', goal: 3, metric: 'casewin7', icon: 'target-coral', to: '/pages/index/index', toTab: true },
  { id: 'w-layer2', type: 'weekly', title: '集齐 2 个不同层的检查单', goal: 2, metric: 'layers2', icon: 'puzzle-sky', to: '/pages/index/index', toTab: true },
]

/** 成长任务：进度来自永久统计（rankOf/getTotals），不走 progress 存储。
 *  只留两根进度轴的终点（破案数 / 章节数），中段刻度不再单独立卡。 */
export const GROWTH_TASKS: TaskDef[] = [
  { id: 'g-rank', type: 'growth', title: '破案 6 关：晋升「首席诊断官」', goal: 6, metric: 'solved', icon: 'medal-coral', to: '/pages/index/index', toTab: true },
  { id: 'g-all', type: 'growth', title: '全部章节主线通关', goal: 16, metric: 'chapters', icon: 'map-sky', to: '/pages/index/index', toTab: true },
]

export function taskById(id: string): TaskDef | null {
  const all = DAILY_TASKS.concat(WEEKLY_TASKS).concat(GROWTH_TASKS)
  for (let i = 0; i < all.length; i++) {
    if (all[i].id === id) return all[i]
  }
  return null
}
