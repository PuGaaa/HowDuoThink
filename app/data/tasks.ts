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
}

export const DAILY_TASKS: TaskDef[] = [
  { id: 'd-win', type: 'daily', title: '今日首胜：破案 1 关', goal: 1, metric: 'win', icon: 'trophy-lemon' },
  { id: 'd-check', type: 'daily', title: '复习检查单 1 次', goal: 1, metric: 'checkuse', icon: 'scroll-coral' },
  { id: 'd-hypo', type: 'daily', title: '立假设 ≥2 个', goal: 2, metric: 'hypo', icon: 'bulb-sky' },
  { id: 'd-daily', type: 'daily', title: '完成今日一题', goal: 1, metric: 'dailycase', icon: 'target-coral' },
  { id: 'd-retrain', type: 'daily', title: '错案重练：破掉 1 个曾失败的案子', goal: 1, metric: 'retrain', icon: 'flame-lemon' },
]

export const WEEKLY_TASKS: TaskDef[] = [
  { id: 'w-case3', type: 'weekly', title: '本周破案 3 关', goal: 3, metric: 'casewin7', icon: 'target-coral' },
  { id: 'w-layer2', type: 'weekly', title: '集齐 2 个不同层的检查单', goal: 2, metric: 'layers2', icon: 'puzzle-sky' },
]

/** 成长任务：进度来自永久统计（rankOf/getTotals），不走 progress 存储 */
export const GROWTH_TASKS: TaskDef[] = [
  { id: 'g-rank', type: 'growth', title: '晋升「主治工程师」', goal: 3, metric: 'rank', icon: 'medal-coral' },
  { id: 'g-all', type: 'growth', title: '全部章节通关', goal: 11, metric: 'allcases', icon: 'map-sky' },
]

export function taskById(id: string): TaskDef | null {
  const all = DAILY_TASKS.concat(WEEKLY_TASKS).concat(GROWTH_TASKS)
  for (let i = 0; i < all.length; i++) {
    if (all[i].id === id) return all[i]
  }
  return null
}
